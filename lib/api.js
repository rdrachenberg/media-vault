// All API calls go through our Next.js backend routes.
// Keys and DB connections never touch the browser.

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

// ── Library CRUD ────────────────────────────────────────────────────────────

export async function fetchLibrary() {
  const res = await fetch("/api/library");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load library (${res.status})`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function addToLibrary(item) {
  const res = await fetch("/api/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to add item (${res.status})`);
  }
  return res.json();
}

export async function removeFromLibrary(upc) {
  const res = await fetch(`/api/library/${encodeURIComponent(upc)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to remove item (${res.status})`);
  }
  return res.json();
}

export async function updateInLibrary(upc, updates) {
  const res = await fetch(`/api/library/${encodeURIComponent(upc)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update item (${res.status})`);
  }
  return res.json();
}

export async function seedLibrary() {
  const res = await fetch("/api/library/seed", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to seed library (${res.status})`);
  }
  return res.json();
}

// ── TMDB ────────────────────────────────────────────────────────────────────

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

// ── UPC Lookup ──────────────────────────────────────────────────────────────

export async function lookupUPC(upc) {
  const res = await fetch(`/api/upc?upc=${encodeURIComponent(upc)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `UPC lookup failed (${res.status})`);
  }
  return res.json();
}

// ── AI Search ───────────────────────────────────────────────────────────────

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
