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
  index.ts                  Worker fetch entry
  container.ts              wires ports to adapters
  core/shortener/           entity, errors, ports, service
  adapter/d1/               LinkRepository over SQLite
  adapter/kv/               read-through cache + eviction invalidation
  adapter/ratelimit/        rate limiting binding, in-memory fallback
  adapter/clock/
  adapter/nanoid/
  app/http/                 router, handlers, JSON DTOs
migrations/                 0001 links table, 0002 counter + triggers
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

`ttlSeconds` optional: default **604800** (7 days), max **31536000** (1 year).

Errors: `400` bad input, `409` `{ "error": "code already exists" }`, `429` `{ "error": "rate limited" }`, `404` `{ "error": "not found" }` or `{ "error": "expired" }`.

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

### Why the link count lives in its own table

D1 meters rows *scanned*, not rows returned, so `SELECT COUNT(*) FROM links` costs
one row read per stored link. Checking the 50,000 cap on every write that way cost
~50,000 reads per create at capacity, which exhausts the 5M/day free allowance in
about 100 creates. `migrations/0002_link_count.sql` keeps a running total in a
one-row table maintained by insert and delete triggers, so the check is a single
primary-key lookup no matter how many links are stored:

```
SELECT COUNT(*) FROM links          SCAN links USING COVERING INDEX ...
SELECT n FROM link_count WHERE id=1 SEARCH link_count USING INTEGER PRIMARY KEY
```

Triggers keep the total exact without the application tracking it. An upsert that
replaces an existing code fires UPDATE rather than INSERT, so re-pointing a link
does not inflate the count.

## Bindings

| Binding | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 | links table |
| `LINKS_CACHE` | KV | redirect read cache |
| `RATE_LIMITER` | rate limit | 20 creates/IP/minute; optional, falls back to per-isolate counting |

## Dependency rule

`src/core` must not import `src/adapter`, `src/app`, Hono, or any Cloudflare binding type.
