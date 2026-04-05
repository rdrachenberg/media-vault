import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// Step 1: Look up UPC to get product title
async function lookupUPC(upc: string): Promise<string | null> {
  // Try UPCitemdb (free, no key needed)
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
      headers: { "Accept": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.items?.[0]?.title) return data.items[0].title;
    }
  } catch { /* fallback below */ }

  // Fallback: try Open EAN database  
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`);
    if (res.ok) {
      const data = await res.json();
      if (data.product?.product_name) return data.product.product_name;
    }
  } catch { /* no match */ }

  return null;
}

// Step 2: Search TMDB by title, return best match with full details
async function searchTMDB(title: string): Promise<any | null> {
  if (!TMDB_API_KEY) return null;

  // Aggressively clean product titles from UPC databases
  // Examples: "Dvd - Michael Clayton & Sealed" → "Michael Clayton"
  //           "Star Wars Episode IV Blu-Ray 2-Disc Special Edition [New]" → "Star Wars Episode IV"
  function cleanProductTitle(raw: string): string {
    return raw
      // Remove leading format labels like "Dvd - ", "Blu-ray - ", "DVD:", etc.
      .replace(/^(blu[- ]?ray|dvd|4k|uhd|vhs|hd[- ]?dvd)\s*[-:]\s*/gi, "")
      // Remove trailing condition/state like "& Sealed", "- New", "(Used)", "/ New"
      .replace(/\s*[&/\-]\s*(sealed|new|used|opened|mint|like new|very good|good|acceptable)\s*$/gi, "")
      // Remove format mentions anywhere
      .replace(/\b(blu[- ]?ray|dvd|4k|uhd|digital|widescreen|fullscreen|hd[- ]?dvd|vhs|laserdisc)\b/gi, "")
      // Remove edition labels
      .replace(/\b(special|collector'?s?|limited|anniversary|deluxe|platinum|diamond|ultimate|theatrical|unrated|extended|director'?s?\s*cut)\s*(edition|ed\.?|version|ver\.?)?\b/gi, "")
      // Remove disc/pack info
      .replace(/\b(\d[- ]?disc|combo|pack|set|box\s*set|trilogy|collection|complete)\b/gi, "")
      // Remove bracketed/parenthesized text like [New], (Widescreen), [Blu-ray]
      .replace(/\[.*?\]|\(.*?\)/g, "")
      // Remove region codes
      .replace(/\b(region\s*[0-9a-z]+)\b/gi, "")
      // Clean up leftover punctuation and whitespace
      .replace(/\s*[-–—:,/&]\s*$/g, "")  // trailing separators
      .replace(/^\s*[-–—:,/&]\s*/g, "")  // leading separators
      .replace(/\s+/g, " ")
      .trim();
  }

  // Try progressively simpler search queries
  const cleanTitle = cleanProductTitle(title);
  const searchQueries = [
    cleanTitle,
    // Drop anything after a colon or dash (often subtitle/edition)
    cleanTitle.split(/[-–—:]/)[0].trim(),
    // First 3 words only
    cleanTitle.split(/\s+/).slice(0, 3).join(" "),
  ].filter((q, i, arr) => q.length > 2 && arr.indexOf(q) === i); // dedupe, skip empty

  let movieId: number | null = null;

  for (const query of searchQueries) {
    const searchRes = await fetch(
      `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
    );
    if (!searchRes.ok) continue;
    const searchData = await searchRes.json();
    if (searchData.results?.length) {
      movieId = searchData.results[0].id;
      break;
    }
  }

  if (!movieId) return null;

  // Get full details for the matched movie
  const detailRes = await fetch(
    `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
  );
  if (!detailRes.ok) return null;
  const d = await detailRes.json();

  const directors = (d.credits?.crew || [])
    .filter((c: any) => c.job === "Director")
    .map((c: any) => c.name)
    .join(", ");
  const cast = (d.credits?.cast || [])
    .slice(0, 4)
    .map((c: any) => c.name)
    .join(", ");

  return {
    found: true,
    tmdb_id: d.id,
    title: d.title,
    year: (d.release_date || "").slice(0, 4),
    director: directors,
    runtime: d.runtime || 0,
    genre: (d.genres || [])[0]?.name || "",
    rating: d.vote_average ? `${d.vote_average.toFixed(1)}/10` : "NR",
    synopsis: d.overview || "",
    cast,
    poster_url: d.poster_path ? `${TMDB_IMG}${d.poster_path}` : "",
    collection: d.belongs_to_collection?.name || "Standalone",
  };
}

export async function GET(request: NextRequest) {
  const upc = request.nextUrl.searchParams.get("upc");
  if (!upc) {
    return NextResponse.json({ error: "Missing ?upc= parameter" }, { status: 400 });
  }

  // Step 1: UPC → product title
  const productTitle = await lookupUPC(upc);

  if (!productTitle) {
    return NextResponse.json({
      found: false,
      upc,
      suggestion: `UPC ${upc} not found in product databases. Try searching by movie title instead.`,
    });
  }

  // Step 2: Product title → TMDB movie details
  const movie = await searchTMDB(productTitle);

  if (!movie) {
    return NextResponse.json({
      found: false,
      upc,
      product_title: productTitle,
      suggestion: `Found product "${productTitle}" but couldn't match it to a movie in TMDB. Try searching TMDB by title.`,
    });
  }

  return NextResponse.json({ ...movie, upc, product_title: productTitle });
}