output "kv_namespace_id" {
  value       = cloudflare_workers_kv_namespace.links.id
  description = "Paste into wrangler.toml as [[kv_namespaces]] id."
}

output "custom_domain_hostname" {
  value       = var.custom_domain_hostname != "" ? var.custom_domain_hostname : null
  description = "Set only when zone_id and custom_domain_hostname were both provided."
}

output "next_steps" {
  value = <<-EOT
    1. Paste the id above into wrangler.toml:
         [[kv_namespaces]] id = "${cloudflare_workers_kv_namespace.links.id}"
    2. make deploy
    3. Only if you set zone_id/custom_domain_hostname: terraform apply again to attach the domain.
  EOT
}
