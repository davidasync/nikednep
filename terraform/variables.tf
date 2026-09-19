variable "cloudflare_account_id" {
  description = "Cloudflare account ID (Dashboard -> Workers & Pages -> Overview, right sidebar)"
  type        = string
}

variable "project_name" {
  description = "Base name for the D1 database, KV namespace, and Worker. Must match wrangler.toml's `name`."
  type        = string
  default     = "nikednep"
}

variable "zone_id" {
  description = "Zone ID to route a custom domain to the Worker. Leave empty to use the workers.dev subdomain only."
  type        = string
  default     = ""
}

variable "custom_domain_hostname" {
  description = "Hostname to attach to the Worker, e.g. short.example.com. Requires zone_id, and the Worker must already be deployed once via `wrangler deploy`. Leave empty to skip."
  type        = string
  default     = ""
}
