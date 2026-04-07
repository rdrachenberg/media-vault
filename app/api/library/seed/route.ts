import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { STAR_WARS_SEED } from "@/lib/seed-data";

// POST /api/library/seed — seed the library with Star Wars collection
export async function POST() {
  try {
    const collection = await getCollection();
    const count = await collection.countDocuments();

    if (count > 0) {
      return NextResponse.json({
        message: `Library already has ${count} items. Seed skipped.`,
        seeded: false,
        count,
      });
    }

    // Add timestamps to seed data
    const docs = STAR_WARS_SEED.map((item) => ({
      ...item,
      added_at: new Date().toISOString(),
    }));

    await collection.insertMany(docs);

    return NextResponse.json({
      message: `Seeded ${docs.length} Star Wars titles.`,
      seeded: true,
      count: docs.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to seed library" },
      { status: 500 }
    );
  }
}
