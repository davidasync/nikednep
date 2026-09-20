# nikednep

API-only URL shortener. Clients `POST` a URL and get a short path; `GET` that path 302-redirects to the original.

- **Runtime:** Cloudflare Workers (TypeScript + Hono)
- **Storage:** D1 (source of truth) with a KV read cache in front of redirects
- **Cost:** nothing — everything used here sits inside Cloudflare's free tier
- **No UI, no login**

## Architecture

Hexagonal (ports and adapters). `src/container.ts` is the composition root.

```
HTTP (Hono)  →  core shortener service  →  ports  →  KV cache → D1 / rate limit / clock / nanoid
```

`src/core` never imports Hono, D1, KV, or any adapter.

```
src/
  index.ts                  Worker fetch entry + scheduled cleanup
  container.ts              wires ports to adapters
  core/shortener/           entity, errors, ports, service
  adapter/d1/               LinkRepository over SQLite
  adapter/kv/               read-through cache + eviction invalidation
  adapter/ratelimit/        rate limiting binding, in-memory fallback
  adapter/clock/
  adapter/nanoid/
  app/http/                 router, handlers, JSON DTOs
migrations/                 0001 links, 0003 expiry index, 0004 drops 0002's counter
wrangler.toml.example       template; copy to wrangler.toml and fill in ids
terraform/                  D1 + KV as code (optional; script stays on wrangler)
```

### Why KV in front of D1

A redirect is a single point read that is overwhelmingly repeated, so it is served
from KV at the edge. Writes go to D1 first and are then mirrored into KV with the
link's own TTL, so a cache entry can never outlive the link it describes. `count`
and FIFO eviction need `COUNT(*)` and `ORDER BY created_at`, which only D1 can do;
eviction deletes with `RETURNING code` so the cache is invalidated with the rows.

## API

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| POST | `/api/shorten` | `{ "url", "code?", "ttlSeconds?" }` | `201` `{ "code", "shortUrl", "expireAt" }` |
| GET | `/:code` | — | `302` to the stored URL |
| GET | `/health` | — | `200` `{ "ok": true }` |

`code` optional: 3–32 letters or digits. Omit to generate a 7-character nanoid. Reserved: `api`, `health`.

`url` must be at most **8192** characters; longer returns `414`.

`ttlSeconds` optional: default **604800** (7 days), max **31536000** (1 year).
Expired links stop resolving immediately and their rows are swept hourly; see
[Expiry](#expiry).

Errors: `400` bad input, `409` `{ "error": "code already exists" }`, `414` url too long, `429` `{ "error": "rate limited" }`, `404` `{ "error": "not found" }` or `{ "error": "expired" }`.

Capacity: at most **50,000** links; oldest by `created_at` are deleted when over the cap.
The cap is checked against a trigger-maintained counter, not `COUNT(*)` — see below.

Rate limit: **20 creates per IP per minute**, via Cloudflare's rate limiting binding.

## Local

```bash
make install
make config         # copies wrangler.toml.example -> wrangler.toml
make migrate-local
make dev            # http://localhost:8081
```

`wrangler.toml` holds your own D1 and KV ids and is gitignored; only
`wrangler.toml.example` is tracked. The `make` targets that need it will create
it from the example on first run, and never overwrite one that already exists.

`wrangler dev` simulates D1 and KV on disk under `.wrangler/`, so nothing touches
your account and no Docker or emulator is needed.

```bash
curl -s -X POST http://localhost:8081/api/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","code":"nike","ttlSeconds":3600}'

curl -sI http://localhost:8081/nike
curl -s http://localhost:8081/health
```

## Deploy

Needs a free Cloudflare account. No credit card, no billing.

```bash
npx wrangler login
make create-resources     # creates the D1 database and KV namespace
```

Or provision those two resources with Terraform instead — see [terraform/](terraform/):

```bash
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
make tf-init && make tf-apply
```

Paste the printed `database_id` and KV `id` into your `wrangler.toml` (not the
example file — that one keeps the placeholders), then:

```bash
make migrate-remote
make deploy
```

Short links are live at `https://nikednep.<your-subdomain>.workers.dev/abc12xy`.
For a custom domain, add the zone to Cloudflare and uncomment the `routes` line
in `wrangler.toml`.

## Free tier

| Resource | Free allowance | What this app uses it for |
| --- | --- | --- |
| Workers | 100,000 requests/day | every request |
| D1 | 5 GB, 5M row reads/day, 100k row writes/day | link storage, count, eviction |
| KV | 100,000 reads/day, 1,000 writes/day | redirect cache |
| Rate limiting | unmetered | 20 creates/IP/minute |

KV writes are the tightest limit at 1,000/day, and only a cache miss or a new link
writes to KV — a cache hit costs a read. If you ever exceed it, KV writes start
failing while D1 keeps serving correctly, so redirects degrade to a D1 read rather
than breaking.

Nothing here can bill you: the Workers Free plan has no billing attached, so
exceeding a limit returns errors until the 00:00 UTC reset rather than charging
overage. Overage pricing applies only after an explicit upgrade to Workers Paid.

### Expiry

Two mechanisms, because the two stores behave differently.

**KV** entries are written with `expirationTtl` set to the link's own remaining
life, so Cloudflare drops them on its own. Nothing of ours runs, and a cache entry
can never outlive the link it caches.

**D1** has no such thing, so expiry there is enforced on read: `resolve` checks the
timestamp and returns `404`. That alone leaves the rows in place, where they hold
storage and count against the 50,000 cap. Worse, FIFO eviction orders by
`created_at`, so at the cap it would drop a live link while keeping an expired one
created more recently.

An hourly Cron Trigger closes that gap. `scheduled` in `src/index.ts` calls
`purgeExpired`, which deletes in batches of `PURGE_BATCH` through an indexed range
seek:

```
SEARCH links USING INDEX idx_links_expire_at (expire_at>? AND expire_at<?)
```

The delete triggers from `0002` keep the counter right, so the cap reflects only
live links. The purge deliberately does not touch KV: those entries have already
expired on their own TTL, and deleting them would spend the 1,000/day free write
budget on no-ops. Cron Triggers are free (5 per account on the free plan).

### What bounds storage

There is no cap on the number of links. An earlier 50,000 limit with FIFO
eviction came from the Firestore build's much smaller free tier; on D1 that is
0.16% of the 5 GB allowance, and because eviction ordered by `created_at` it
deleted live links to make room. Once the hourly purge removed expired rows,
everything at the cap was by definition still alive, so eviction had nothing
left to reclaim and only destroyed working links.

Storage is bounded by `MAX_URL_LENGTH` instead, which caps what one link can
cost rather than how many may exist. Row count then finds its own steady state:
links expire, the purge reclaims them, and the table settles at roughly the
creation rate times the average TTL.

Dropping the cap removed its whole supporting cast — `count()`, `deleteOldest()`,
and the trigger-maintained counter table that existed only to make the cap check
cheap. `0004` drops what `0002` created.

## Bindings

| Binding | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 | links table |
| `LINKS_CACHE` | KV | redirect read cache |
| `RATE_LIMITER` | rate limit | 20 creates/IP/minute; optional, falls back to per-isolate counting |

## Dependency rule

`src/core` must not import `src/adapter`, `src/app`, Hono, or any Cloudflare binding type.
