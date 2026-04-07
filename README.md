# 📼 Media Vault

AI-powered barcode scanning catalog for DVD, Blu-ray, and VHS collections. Scan a barcode, identify the movie, pull poster art, and store everything in MongoDB Atlas.

**Live**: [media-vault-psi-ten.vercel.app](https://media-vault-psi-ten.vercel.app)

---

## Quick Start

```bash
git clone git@github.com:YOUR_USERNAME/media-vault.git
cd media-vault
make setup          # Install deps + create .env.local
# Edit .env.local with your keys (see below)
make dev            # http://localhost:3000
```

## Environment Variables

Three keys needed in `.env.local`:

| Variable | Where to Get | Cost |
|---|---|---|
| `MONGODB_URI` | [cloud.mongodb.com](https://cloud.mongodb.com) → Cluster → Connect → Drivers | Free (M0 tier) |
| `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | Free |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Pay-per-use |

```env
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
TMDB_API_KEY=abc123...
ANTHROPIC_API_KEY=sk-ant-...
```

### MongoDB Atlas Setup

1. Create a free account at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free M0 cluster (any region)
3. **Database Access** → Add user with read/write permissions
4. **Network Access** → Add `0.0.0.0/0` (allow from anywhere — required for Vercel)
5. **Connect** → Drivers → Copy the connection string
6. Replace `<username>`, `<password>` in the string and paste into `.env.local`

The app auto-creates the `media-vault` database and `library` collection on first request. On first load with an empty DB, it seeds 14 Star Wars titles automatically.

---

## Make Commands

```
make help            Show all commands
make setup           Install deps + create .env.local
make dev             Start dev server (localhost:3000)
make build           Production build
make start           Start production server
make deploy          Deploy to Vercel (production)
make deploy-preview  Deploy preview to Vercel
make env-check       Verify all keys are configured
make seed            Seed DB with Star Wars collection (dev server must be running)
make db-count        Show item count in library
make clean           Remove build artifacts
make logs            Tail Vercel logs
make status          Show project info
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     MEDIA VAULT UI                          │
│                   (React — client-side)                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Barcode Scanner (Quagga2)  →  UPC Lookup  →  TMDB Match  │
│  TMDB Search (by title)     →  Full Details + Poster       │
│  AI Search (Claude)         →  Fuzzy matching fallback     │
│                                                            │
│  Library: Load / Add / Delete  →  /api/library/*           │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                  NEXT.JS API ROUTES (server-side)           │
│                                                            │
│  /api/library           GET list, POST add                 │
│  /api/library/[upc]     DELETE remove, PATCH update        │
│  /api/library/seed      POST seed Star Wars data           │
│  /api/upc?upc=XXX       UPC → product title → TMDB        │
│  /api/tmdb/search       TMDB movie search                  │
│  /api/tmdb/movie/[id]   TMDB movie details + credits       │
│  /api/ai/lookup         Claude + web search (fallback)     │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                     EXTERNAL SERVICES                       │
│                                                            │
│  MongoDB Atlas        ← Library persistence                │
│  UPCitemdb.com        ← Barcode → product title (free)     │
│  TMDB API v3          ← Movie data + poster CDN (free)     │
│  Anthropic API        ← AI fuzzy search (pay-per-use)      │
│  image.tmdb.org       ← Poster images (public CDN)         │
└────────────────────────────────────────────────────────────┘
```

### Barcode → Movie Pipeline

```
Scan barcode on phone
       ↓
GET /api/upc?upc=0025192867422
       ↓
UPCitemdb.com → "Dvd - Michael Clayton & Sealed"
       ↓
Clean title  → "Michael Clayton"
       ↓
TMDB search  → match → full details + poster
       ↓
Return to client → user confirms → POST /api/library → MongoDB
```

### Key Security

All API keys and the MongoDB connection string live exclusively in environment variables. They are only accessed in server-side API route handlers (`app/api/`). Nothing is exposed to the browser. The client calls `/api/library` and the server handles auth to MongoDB/TMDB/Anthropic.

---

## Project Structure

```
media-vault/
├── app/
│   ├── layout.js                       Root layout
│   ├── page.js                         Home (dynamic import, no SSR)
│   ├── globals.css                     Fonts, animations
│   └── api/
│       ├── library/
│       │   ├── route.ts                GET all, POST new item
│       │   ├── [upc]/route.ts          DELETE, PATCH by UPC
│       │   └── seed/route.ts           POST seed Star Wars data
│       ├── upc/route.ts                UPC → title → TMDB pipeline
│       ├── tmdb/
│       │   ├── search/route.ts         TMDB movie search proxy
│       │   └── movie/[id]/route.ts     TMDB movie details proxy
│       └── ai/
│           └── lookup/route.ts         Claude AI search proxy
├── components/
│   └── MediaVault.jsx                  Main client component
├── lib/
│   ├── api.js                          Client-side fetch helpers
│   ├── mongodb.ts                      MongoDB connection singleton
│   └── seed-data.js                    Star Wars seed collection
├── .env.example                        Env var template
├── .env.local                          Real keys (gitignored!)
├── .gitignore
├── Makefile
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

---

## Data Model

Each library item in MongoDB:

```javascript
{
  upc: "024543246558",           // Unique identifier (from barcode or generated)
  title: "Star Wars: Episode IV", // Movie title
  year: 1977,                    // Release year
  format: "DVD",                 // DVD | Blu-ray | VHS | 4K UHD
  director: "George Lucas",      // Director(s)
  runtime: 121,                  // Minutes
  genre: "Sci-Fi",              // Primary genre
  rating: "PG",                 // MPAA rating or TMDB score
  synopsis: "...",              // Plot summary
  cast: "Mark Hamill, ...",     // Comma-separated top cast
  poster_url: "https://...",    // TMDB CDN image URL
  collection: "Original Trilogy", // Franchise or "Standalone"
  tmdb_id: 11,                  // TMDB movie ID for re-fetching
  added_at: "2025-04-06T...",   // Timestamp
}
```

---

## API Reference

### Library

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/library` | Fetch all items, sorted by `added_at` desc |
| `POST` | `/api/library` | Add item (body: JSON). Returns 409 on duplicate UPC |
| `DELETE` | `/api/library/[upc]` | Remove item by UPC |
| `PATCH` | `/api/library/[upc]` | Update fields (body: JSON partial) |
| `POST` | `/api/library/seed` | Seed 14 Star Wars titles (skips if DB not empty) |

### Lookup

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/upc?upc=XXX` | UPC → product title → TMDB match |
| `GET` | `/api/tmdb/search?q=XXX` | TMDB title search (returns poster grid) |
| `GET` | `/api/tmdb/movie/[id]` | Full TMDB details + credits |
| `POST` | `/api/ai/lookup` | Claude AI fuzzy search (body: `{query}`) |

---

## Deploying to Vercel

```bash
# First time
npm i -g vercel
vercel login
make deploy-preview     # Test deploy

# Set environment variables
vercel env add MONGODB_URI
vercel env add TMDB_API_KEY
vercel env add ANTHROPIC_API_KEY

# Production deploy
make deploy
```

Ensure your MongoDB Atlas Network Access includes `0.0.0.0/0` so Vercel's serverless functions can connect. After setting env vars, redeploy for them to take effect.

---

## Features

- **Barcode scanning** — Quagga2 live scanner + photo capture for iOS
- **UPC lookup** — UPCitemdb → title cleaning → TMDB match (no AI needed)
- **TMDB search** — Fast poster grid, full metadata with credits
- **AI search** — Claude + web search for fuzzy/partial queries
- **MongoDB persistence** — Library survives across sessions and devices
- **Auto-seed** — Empty DB gets 14 Star Wars titles on first load
- **Poster enrichment** — Missing posters fetched from TMDB on load
- **Responsive** — Desktop and mobile optimized
- **Secure** — All keys server-side, never exposed to browser

## Tech Stack

Next.js 15 · React 18 · MongoDB Atlas · Quagga2 · TMDB API v3 · Anthropic Claude API · UPCitemdb · Vercel

---

## Seed Library

14 Star Wars titles across all eras:

| Collection | Titles | Format |
|---|---|---|
| Prequel Trilogy | Episodes I, II, III | DVD |
| Original Trilogy | Episodes IV, V, VI | DVD |
| Sequel Trilogy | Force Awakens, Last Jedi, Rise of Skywalker | Blu-ray |
| Anthology | Rogue One, Solo | Blu-ray |
| Animated | The Clone Wars | DVD |
| Specials | Holiday Special | VHS |
| Original Trilogy | VHS Box Set (1995) | VHS |

---

## Roadmap

- [ ] User authentication (NextAuth or Clerk)
- [ ] Multiple collections per user
- [ ] Export/import library as JSON backup
- [ ] Bulk scan mode (rapid sequential scanning)
- [ ] Collection completeness tracking
- [ ] Watchlist vs. Owned status
- [ ] Sort by date added
- [ ] eBay/Discogs price lookup
- [ ] PWA offline support
