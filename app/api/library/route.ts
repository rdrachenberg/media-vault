import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

// GET /api/library — fetch all library items
export async function GET() {
  try {
    const collection = await getCollection();
    const items = await collection.find({}).sort({ added_at: -1 }).toArray();
    // Strip MongoDB _id for client consumption
    const cleaned = items.map(({ _id, ...rest }) => rest);
    return NextResponse.json({ items: cleaned });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch library" },
      { status: 500 }
    );
  }
}

// POST /api/library — add a new item
export async function POST(request: NextRequest) {
  try {
    const item = await request.json();

    if (!item.title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const collection = await getCollection();

    // Check for duplicate UPC
    if (item.upc) {
      const existing = await collection.findOne({ upc: item.upc });
      if (existing) {
        return NextResponse.json(
          { error: "Item with this UPC already exists" },
          { status: 409 }
        );
      }
    }

    // Ensure UPC exists (generate if not provided)
    const doc = {
      upc: item.upc || Date.now().toString(),
      title: item.title,
      year: item.year || new Date().getFullYear(),
      format: item.format || "DVD",
      director: item.director || "Unknown",
      runtime: item.runtime || 0,
      genre: item.genre || "",
      rating: item.rating || "NR",
      synopsis: item.synopsis || "",
      cast: item.cast || "",
      poster_url: item.poster_url || "",
      collection: item.collection || "Standalone",
      tmdb_id: item.tmdb_id || null,
      added_at: new Date().toISOString(),
    };

    await collection.insertOne(doc);
    const { _id, ...cleaned } = doc as any;
    return NextResponse.json(cleaned, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to add item" },
      { status: 500 }
    );
  }
}