# 📼 Media Vault

AI-powered barcode scanning catalog for DVD, Blu-ray, and VHS collections. Built with Next.js, TMDB API, and Claude AI.

## Quick Start

```bash
make setup       # Install deps + create .env.local
# Edit .env.local with your API keys
make dev         # Start dev server → http://localhost:3000
```

## API Keys

| Key | Where to Get | Cost |
|---|---|---|
| `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | Free |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Pay-per-use |

Both keys live in `.env.local` (gitignored) and are only accessed server-side via Next.js API routes. They never reach the browser.

## Make Commands

```
make help           Show all commands
make setup          First-time setup (install + create .env.local)
make dev            Start dev server
make build          Production build
make start          Start production server
make deploy         Deploy to Vercel (production)
make deploy-preview Deploy preview to Vercel
make env-check      Verify API keys are configured
make clean          Remove build artifacts
make logs           Tail Vercel production logs
make status         Show project info
```

## Architecture

```
Browser (client)         Next.js API Routes (server)        External APIs
─────────────────        ─────────────────────────          ──────────────
                         
/api/tmdb/search?q=...  → TMDB_API_KEY + fetch()          → TMDB /3/search/movie
/api/tmdb/movie/1893    → TMDB_API_KEY + fetch()          → TMDB /3/movie/{id}
/api/ai/lookup          → ANTHROPIC_API_KEY + fetch()     → Anthropic /v1/messages
                         
Posters load directly:   https://image.tmdb.org/t/p/w500/  (public CDN, no auth)
```

API keys are **only in `.env.local`** → **only accessed in `/app/api/` route handlers** → **never sent to the browser**. The client calls `/api/tmdb/search?q=inception` and the server-side route appends the key and forwards to TMDB.

## Project Structure

```
media-vault/
├── app/
│   ├── layout.js                  Root layout
│   ├── page.js                    Home page (imports MediaVault)
│   ├── globals.css                Fonts, animations, scrollbar
│   └── api/
│       ├── tmdb/
│       │   ├── search/route.ts    GET  /api/tmdb/search?q={title}
│       │   └── movie/[id]/route.ts GET /api/tmdb/movie/{tmdb_id}
│       └── ai/
│           └── lookup/route.ts    POST /api/ai/lookup {query}
├── components/
│   └── MediaVault.jsx             Main client component ("use client")
├── lib/
│   ├── api.js                     Client-side fetch helpers
│   └── seed-data.js               Star Wars seed library
├── .env.example                   Template (committed)
├── .env.local                     Real keys (gitignored!)
├── .gitignore
├── Makefile
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

## Deploying to Vercel

### First time

```bash
npm i -g vercel         # Install Vercel CLI
vercel login            # Auth with your account
make deploy-preview     # Test deploy
```

### Set environment variables in Vercel

```bash
vercel env add TMDB_API_KEY        # Paste your TMDB key
vercel env add ANTHROPIC_API_KEY   # Paste your Anthropic key
```

Or set them in the Vercel dashboard: **Project → Settings → Environment Variables**.

### Production deploy

```bash
make deploy    # Deploys to production
```

### Custom domain (optional)

In Vercel dashboard: **Project → Settings → Domains → Add** your domain. If you're using Namecheap, add a CNAME record pointing to `cname.vercel-dns.com`.

## Features

- **Barcode scanning** — Native BarcodeDetector API (Chrome/Edge) + manual UPC entry
- **TMDB search** — Fast poster grid, full metadata with credits, ~200ms
- **AI search** — Claude + web search for fuzzy/partial title lookups
- **14 Star Wars titles** seeded with real TMDB poster images
- **Filter/sort** — By format, collection, year, title, runtime
- **Detail view** — Poster, synopsis, cast chips, metadata grid
- **Responsive** — Works on desktop and mobile

## Security

- `.env.local` is in `.gitignore` — never committed
- API keys only accessed in server-side route handlers (`app/api/`)
- TMDB image CDN is public (no auth needed for `image.tmdb.org`)
- No client-side environment variables (`NEXT_PUBLIC_*` not used)
- Consider adding rate limiting to API routes for production use

## Tech Stack

Next.js 14 · React 18 · TypeScript (API routes) · TMDB API v3 · Anthropic Messages API · BarcodeDetector API · Vercel
