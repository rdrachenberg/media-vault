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

  // Clean up the product title — remove format info, edition text, etc.
  const cleanTitle = title
    .replace(/\b(blu[- ]?ray|dvd|4k|uhd|digital|widescreen|fullscreen)\b/gi, "")
    .replace(/\b(special|collector'?s?|limited|anniversary|deluxe)\s*(edition|ed\.?)\b/gi, "")
    .replace(/\b(2[- ]?disc|3[- ]?disc|combo|pack|set)\b/gi, "")
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&include_adult=false`
  );
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  if (!searchData.results?.length) return null;

  // Get full details for the top result
  const movieId = searchData.results[0].id;
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