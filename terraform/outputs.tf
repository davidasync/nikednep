output "d1_database_id" {
  value       = cloudflare_d1_database.links.id
  description = "Paste into wrangler.toml as [[d1_databases]] database_id."
}

output "kv_namespace_id" {
  value       = cloudflare_workers_kv_namespace.links_cache.id
  description = "Paste into wrangler.toml as [[kv_namespaces]] id."
}

output "custom_domain_hostname" {
  value       = var.custom_domain_hostname != "" ? var.custom_domain_hostname : null
  description = "Set only when zone_id and custom_domain_hostname were both provided."
}

output "next_steps" {
  value = <<-EOT
    1. Paste the ids above into wrangler.toml:
         [[d1_databases]]  database_id = "${cloudflare_d1_database.links.id}"
         [[kv_namespaces]] id          = "${cloudflare_workers_kv_namespace.links_cache.id}"
    2. make migrate-remote
    3. make deploy
    4. Only if you set zone_id/custom_domain_hostname: terraform apply again to attach the domain.
  EOT
}
