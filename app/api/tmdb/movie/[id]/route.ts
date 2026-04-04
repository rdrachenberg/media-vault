import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: "TMDB API key not configured" },
      { status: 503 }
    );
  }

  const { id: movieId } = await params;
  if (!movieId || isNaN(Number(movieId))) {
    return NextResponse.json(
      { error: "Invalid movie ID" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `TMDB returned ${res.status}` },
        { status: res.status }
      );
    }

    const d = await res.json();
    const directors = (d.credits?.crew || [])
      .filter((c: any) => c.job === "Director")
      .map((c: any) => c.name)
      .join(", ");
    const cast = (d.credits?.cast || [])
      .slice(0, 4)
      .map((c: any) => c.name)
      .join(", ");

    return NextResponse.json({
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
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "TMDB request failed" },
      { status: 500 }
    );
  }
}