.PHONY: help dev build start lint clean setup deploy logs env-check

# ============================================================
#  Media Vault — Makefile
# ============================================================

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

# --- Setup -------------------------------------------------------------------

setup: ## First-time setup: install deps + create .env.local
	@echo "📦 Installing dependencies..."
	npm install
	@if [ ! -f .env.local ]; then \
		cp .env.example .env.local; \
		echo "📝 Created .env.local — fill in your API keys!"; \
		echo "   TMDB key:      https://www.themoviedb.org/settings/api"; \
		echo "   Anthropic key: https://console.anthropic.com/settings/keys"; \
	else \
		echo "✅ .env.local already exists"; \
	fi

env-check: ## Verify API keys are set
	@echo "🔑 Checking environment..."
	@if [ -f .env.local ]; then \
		if grep -q "your_tmdb_api_key_here" .env.local; then \
			echo "  ⚠  TMDB_API_KEY not set"; \
		else \
			echo "  ✅ TMDB_API_KEY configured"; \
		fi; \
		if grep -q "your_anthropic_api_key_here" .env.local; then \
			echo "  ⚠  ANTHROPIC_API_KEY not set"; \
		else \
			echo "  ✅ ANTHROPIC_API_KEY configured"; \
		fi; \
	else \
		echo "  ❌ .env.local missing — run: make setup"; \
	fi

# --- Development --------------------------------------------------------------

dev: env-check ## Start dev server (http://localhost:3000)
	npm run dev

build: ## Production build
	npm run build

start: ## Start production server (run build first)
	npm run start

lint: ## Run linter
	npm run lint

# --- Deployment ---------------------------------------------------------------

deploy: ## Deploy to Vercel (production)
	@echo "🚀 Deploying to Vercel..."
	npx vercel --prod

deploy-preview: ## Deploy preview to Vercel
	@echo "👀 Deploying preview..."
	npx vercel

# --- Utilities ----------------------------------------------------------------

clean: ## Remove build artifacts + node_modules
	rm -rf .next node_modules out
	@echo "🧹 Cleaned"

logs: ## Tail Vercel production logs
	npx vercel logs --follow

typecheck: ## Run TypeScript type checker
	npx tsc --noEmit

# --- Info ---------------------------------------------------------------------

status: ## Show project status
	@echo "📼 Media Vault"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "Node:    $$(node -v 2>/dev/null || echo 'not installed')"
	@echo "Next.js: $$(npx next --version 2>/dev/null || echo 'not installed')"
	@echo "Files:   $$(find app components lib -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' 2>/dev/null | wc -l | tr -d ' ') source files"
	@echo ""
	@make env-check
