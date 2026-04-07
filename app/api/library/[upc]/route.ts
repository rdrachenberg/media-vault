import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

// DELETE /api/library/[upc] — remove an item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  try {
    const { upc } = await params;
    const collection = await getCollection();
    const result = await collection.deleteOne({ upc });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ deleted: upc });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete item" },
      { status: 500 }
    );
  }
}

// PATCH /api/library/[upc] — update an item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  try {
    const { upc } = await params;
    const updates = await request.json();

    // Don't allow changing the UPC itself
    delete updates.upc;
    delete updates._id;

    const collection = await getCollection();
    const result = await collection.updateOne(
      { upc },
      { $set: { ...updates, updated_at: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ updated: upc });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update item" },
      { status: 500 }
    );
  }
}
