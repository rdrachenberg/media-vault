import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(request: NextRequest) {
  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: "TMDB API key not configured" },
      { status: 503 }
    );
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query) {
    return NextResponse.json(
      { error: "Missing query parameter ?q=" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`,
      { next: { revalidate: 300 } } // cache 5 min
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `TMDB returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    // Only return what the client needs — strip unnecessary fields
    const results = (data.results || []).slice(0, 10).map((m: any) => ({
      id: m.id,
      title: m.title,
      release_date: m.release_date,
      poster_path: m.poster_path,
      overview: m.overview,
    }));

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "TMDB request failed" },
      { status: 500 }
    );
  }
}
