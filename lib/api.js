// All API calls go through our Next.js backend routes.
// Keys never touch the browser.

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

export async function searchMovies(query) {
  const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Search failed (${res.status})`);
  }
  const data = await res.json();
  return (data.results || []).map((m) => ({
    ...m,
    poster_url: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : "",
  }));
}

export async function getMovieDetails(tmdbId) {
  const res = await fetch(`/api/tmdb/movie/${tmdbId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Details failed (${res.status})`);
  }
  return res.json();
}

export async function aiLookup(query, signal) {
  const res = await fetch("/api/ai/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI lookup failed (${res.status})`);
  }
  return res.json();
}
