# nikednep

API-only URL shortener. Clients `POST` a URL and get a short path; `GET` that path 302-redirects to the original.

- **Runtime:** Cloudflare Workers (TypeScript + Hono)
- **Storage:** Workers KV, and nothing else — no database, no schema, no migrations
- **Cost:** nothing — everything used here sits inside Cloudflare's free tier
- **No UI, no login**

## Architecture

Hexagonal (ports and adapters). `src/container.ts` is the composition root.

```
HTTP (Hono)  →  core shortener service  →  ports  →  KV / rate limit / clock / nanoid
```

`src/core` never imports Hono, KV, or any adapter.

```
src/
  index.ts                  Worker fetch entry
  container.ts              wires ports to adapters
  core/shortener/           entity, errors, ports, service
  adapter/kv/               LinkRepository over Workers KV
  adapter/ratelimit/        rate limiting binding, in-memory fallback
  adapter/clock/
  adapter/nanoid/
  app/http/                 router, handlers, JSON DTOs
wrangler.toml.example       template; copy to wrangler.toml and fill in the KV id
terraform/                  the KV namespace as code (optional; code stays on wrangler)
```

The repository port is two methods, `get` and `put`. Storage holds a link under its
code and hands it back; it decides nothing about validity.

## API

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| POST | `/api/shorten` | `{ "url", "code?", "ttlSeconds?" }` | `201` `{ "code", "shortUrl", "expireAt" }` |
| GET | `/:code` | — | `302` to the stored URL |
| GET | `/health` | — | `200` `{ "ok": true }` |

`code` optional: 3–32 letters or digits. Omit to generate a 7-character nanoid. Reserved: `api`, `health`.

`url` must be at most **8192** characters; longer returns `414`.

`ttlSeconds` optional: default **604800** (7 days), max **31536000** (1 year).

Rate limit: **20 creates per IP per minute**, via Cloudflare's rate limiting binding.

Errors: `400` bad input, `409` `{ "error": "code already exists" }`, `414` url too long,
`429` `{ "error": "rate limited" }`, `404` `{ "error": "not found" }` or
`{ "error": "expired" }`, `503` `{ "error": "could not store link, try again later" }`
when the store refuses a write.

## Expiry

KV deletes keys on its own, so there is no sweep, no cron and no index — the whole
cleanup layer that a SQL store would need does not exist here.

KV will not accept an expiry less than 60 seconds out, so a link with a shorter TTL is
stored for 60 seconds anyway and simply reads as expired for the remainder. That works
because **KV's expiry is a garbage collector, not an access check**: the core compares
`expireAt` on every read and is the only thing that decides a link is dead. A link can
therefore be physically present and still correctly answer `404 expired`.

The same split covers KV's deletion lag, its edge cache, and clock skew — all of which
can hand back a key slightly past its expiry.

## Consistency

KV is eventually consistent and has no atomic operations. That buys the simplicity above
and costs real guarantees, which are worth stating plainly:

**A newly created link may not resolve immediately.** KV caches the fact that a key was
*absent* for up to 60 seconds. Creating a link with a custom code reads it first — that is
how duplicates are rejected — and that read caches a miss for the key about to be written.
So a custom-coded link can `404` briefly in the region that created it.

Generated codes avoid this entirely: they are **not** checked before writing, precisely so
that nothing caches a miss for them. The cost is that a collision overwrites instead of
retrying, which for a 7-character code over a 62-character alphabet is around one in a
hundred thousand at this corpus size — far better odds than a guaranteed 404 on every new
link.

**Concurrent claims on the same custom code resolve last-write-wins.** Two simultaneous
requests for the same code can both succeed, and one link quietly replaces the other. KV
cannot express a conditional write, so this is not fixable here.

**There is no way to delete a link before its TTL** through the API. Use
`wrangler kv key delete --binding LINKS <code>`.

## Local

```bash
make install
make config         # copies wrangler.toml.example -> wrangler.toml
make dev            # http://localhost:8081
```

`wrangler dev` simulates KV on disk under `.wrangler/`, so nothing touches your account.
There is no migration step.

```bash
curl -s -X POST http://localhost:8081/api/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","code":"nike","ttlSeconds":3600}'

curl -sI http://localhost:8081/nike
```

Local KV cannot reproduce the propagation delay or the concurrent-claim race — both are
properties of the real distributed store. Passing locally is not evidence they are absent.

## Deploy

Needs a free Cloudflare account. No credit card, no billing.

```bash
npx wrangler login
make create-resources     # creates the KV namespace
```

Paste the printed id into `wrangler.toml`, then `make deploy`.

Or provision the namespace with Terraform instead — see [terraform/](terraform/).

Short links are live at `https://nikednep.<your-subdomain>.workers.dev/abc12xy`.

## Free tier

| Resource | Free allowance | Used for |
| --- | --- | --- |
| Workers | 100,000 requests/day | every request |
| KV | 100,000 reads/day, 1,000 writes/day, 1 GB | every link |
| Rate limiting | unmetered | 20 creates/IP/minute |

**Writes are the binding limit: 1,000 per day.** Each new link is one write, so that is
roughly the ceiling on links created per day. Reads are 100× more plentiful, which suits a
shortener — written once, read many times. Exceeding the write limit returns `503` until
the 00:00 UTC reset.

Nothing here can bill you: the Workers Free plan has no billing attached, so exceeding a
limit returns errors rather than charging overage.

Storage is bounded by `MAX_URL_LENGTH` rather than by a link count: 8 KB is the most one
link can cost, so a full 1 GB namespace is unreachable in practice.

## Bindings

| Binding | Type | Purpose |
| --- | --- | --- |
| `LINKS` | KV | every link |
| `RATE_LIMITER` | rate limit | 20 creates/IP/minute; optional, falls back to per-isolate counting |

`wrangler.toml` is gitignored and nothing typechecks binding names against the code, so
`buildService` fails fast with a named error if `LINKS` is missing rather than throwing
from deep inside the adapter.

## Dependency rule

`src/core` must not import `src/adapter`, `src/app`, Hono, or any Cloudflare binding type.
