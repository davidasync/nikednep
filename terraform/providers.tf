provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from the environment. Never put the token in a
  # .tf or .tfvars file that might get committed.
  # Create one at: https://dash.cloudflare.com/profile/api-tokens
  # Needs: Account.D1:Edit, Account.Workers KV Storage:Edit, and (only if you
  # set custom_domain_hostname) Zone.Workers Routes:Edit for that zone.
}
