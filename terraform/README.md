# Terraform

Provisions the durable Cloudflare resource for nikednep: the KV namespace that
holds every link, plus an optional custom domain.

## Scope: what Terraform does and does not own

| Managed here | Managed by Wrangler |
| --- | --- |
| KV namespace | Worker script + its bundle |
| Custom domain (optional) | Bindings, incl. the rate limiter |

The Worker script is deliberately left to `wrangler deploy`. Wrangler runs the
esbuild bundle (Hono, nanoid) that a `cloudflare_workers_script` resource would
need pre-built, and it owns the rate limiting binding, which is still an
experimental "unsafe" binding without stable Terraform support. Terraform owns the
long-lived stateful resources — the ones you genuinely do not want recreated by
accident — and code deploys stay a one-command CI step.

This makes Terraform an alternative to `make create-resources`, not to `make deploy`.

## Usage

```bash
export CLOUDFLARE_API_TOKEN=...          # never commit this
cd terraform
terraform init
terraform apply -var="cloudflare_account_id=YOUR_ACCOUNT_ID"
```

Copy the id from the output into `wrangler.toml`, then from the repo root:

```bash
make deploy
```

### Custom domain

Attach a hostname only after the Worker exists, since the resource binds to a
script by name rather than creating one:

```bash
terraform apply \
  -var="cloudflare_account_id=YOUR_ACCOUNT_ID" \
  -var="zone_id=YOUR_ZONE_ID" \
  -var="custom_domain_hostname=short.example.com"
```

## API token

Create at https://dash.cloudflare.com/profile/api-tokens with:

- `Account` → `Workers KV Storage` → `Edit`
- `Zone` → `Workers Routes` → `Edit` (only for a custom domain)

## State

The default local backend writes `terraform.tfstate` next to these files, and
`.gitignore` keeps it out of git. `.terraform.lock.hcl` is committed on purpose,
so everyone resolves the same provider build. State holds resource ids, not secrets, but it
is still worth putting on a remote backend if more than one person applies.

## Provider versions

Pinned to `cloudflare/cloudflare ~> 4.0`; validated against 4.52.9, with the
resolved build recorded in `.terraform.lock.hcl`. The Cloudflare provider renames
Workers resources between majors, so if you relax that constraint to v5, re-check
`cloudflare_workers_domain` and `cloudflare_workers_kv_namespace` against the
provider docs — `terraform validate` reports renames as deprecation warnings
before anything is applied.

## Free tier

Every resource here is inside Cloudflare's free tier: KV (1 GB, 100k reads and
1,000 writes per day) and Workers (100k requests/day). Terraform itself costs nothing
with the local backend.
