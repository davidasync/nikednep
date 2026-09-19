# Source of truth for links. The schema itself lives in migrations/0001_init.sql
# and is applied with `wrangler d1 migrations apply`, not Terraform.
resource "cloudflare_d1_database" "links" {
  account_id = var.cloudflare_account_id
  name       = var.project_name
}

# Read cache in front of D1 for redirects.
resource "cloudflare_workers_kv_namespace" "links_cache" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-links-cache"
}

# Optional: attach a hostname on a zone you already manage in Cloudflare,
# instead of the shared workers.dev subdomain. Apply this only after the
# Worker has been deployed at least once (`make deploy`), since it attaches
# to an existing script by name rather than creating one.
resource "cloudflare_workers_domain" "shortener" {
  count      = var.zone_id != "" && var.custom_domain_hostname != "" ? 1 : 0
  account_id = var.cloudflare_account_id
  zone_id    = var.zone_id
  hostname   = var.custom_domain_hostname
  service    = var.project_name
}
