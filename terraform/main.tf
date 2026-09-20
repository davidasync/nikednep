# The only store. KV expires keys on its own, so there is no schema to apply and
# nothing for Terraform to manage beyond the namespace itself.
#
# `title` deliberately keeps the old "-links-cache" name: it is the resource's
# natural identifier, so changing it would force a replacement and hand back a new
# namespace id — destroying every stored link to fix a word.
resource "cloudflare_workers_kv_namespace" "links" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-links-cache"
}

# Renaming the resource address alone would read as destroy-and-create, which
# would take every stored link with it. This tells Terraform it is the same
# namespace under a new name.
moved {
  from = cloudflare_workers_kv_namespace.links_cache
  to   = cloudflare_workers_kv_namespace.links
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
