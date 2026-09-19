.PHONY: help install dev deploy typecheck migrate-local migrate-remote health curl tail create-resources tf-init tf-plan tf-apply tf-destroy check-cf-env

.DEFAULT_GOAL := help

help:
	@echo "nikednep"
	@echo "  make install           Install dependencies"
	@echo "  make create-resources  Create the D1 database and KV namespace (wrangler)"
	@echo "  make tf-apply          Create them with Terraform instead"
	@echo "  make migrate-local     Apply migrations to the local D1"
	@echo "  make migrate-remote    Apply migrations to the deployed D1"
	@echo "  make dev               Run the Worker locally on :8081"
	@echo "  make typecheck         tsc --noEmit"
	@echo "  make deploy            Publish to Cloudflare"
	@echo "  make tail              Stream production logs"
	@echo "  make health            GET /health"
	@echo "  make curl              Sample POST /api/shorten + redirect"
	@echo ""
	@echo "Terraform needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment."

install:
	npm install

create-resources:
	npx wrangler d1 create nikednep
	npx wrangler kv namespace create LINKS_CACHE
	@echo "Copy the printed ids into wrangler.toml."

migrate-local:
	npx wrangler d1 migrations apply nikednep --local

migrate-remote:
	npx wrangler d1 migrations apply nikednep --remote

dev:
	npx wrangler dev --port 8081

typecheck:
	npx tsc --noEmit

deploy:
	npx wrangler deploy

tail:
	npx wrangler tail

health:
	curl -sS http://localhost:8081/health
	@echo

curl:
	curl -sS -X POST http://localhost:8081/api/shorten \
	  -H 'content-type: application/json' \
	  -d '{"url":"https://example.com","code":"nike","ttlSeconds":3600}'
	@echo
	curl -sSI http://localhost:8081/nike

# The Cloudflare provider reads CLOUDFLARE_API_TOKEN straight from the environment,
# and make only forwards variables that were exported. Checking $$VAR rather than
# $(VAR) tests the real environment, which is what terraform ends up seeing.
check-cf-env:
	@if [ -z "$$CLOUDFLARE_API_TOKEN" ]; then \
		echo "CLOUDFLARE_API_TOKEN is not set in this shell."; \
		echo "  export CLOUDFLARE_API_TOKEN='your-token'   # 'export' is required"; \
		exit 1; \
	fi
	@if [ -z "$$CLOUDFLARE_ACCOUNT_ID" ]; then \
		echo "CLOUDFLARE_ACCOUNT_ID is not set in this shell."; \
		echo "  export CLOUDFLARE_ACCOUNT_ID='your-32-char-account-id'"; \
		exit 1; \
	fi

tf-init:
	cd terraform && terraform init

tf-plan: check-cf-env
	cd terraform && terraform plan -var="cloudflare_account_id=$$CLOUDFLARE_ACCOUNT_ID"

tf-apply: check-cf-env
	cd terraform && terraform apply -var="cloudflare_account_id=$$CLOUDFLARE_ACCOUNT_ID"

tf-destroy: check-cf-env
	cd terraform && terraform destroy -var="cloudflare_account_id=$$CLOUDFLARE_ACCOUNT_ID"
