import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key not configured" },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Missing query field" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You are a movie database assistant. Search the web for accurate movie info. Return ONLY valid JSON:
{"title":"","year":2024,"director":"","runtime":120,"genre":"","rating":"","synopsis":"","cast":"","poster_url":"","collection":"","found":true}
For poster_url find a TMDB image URL (https://image.tmdb.org/t/p/w500/...). If not found: {"found":false,"suggestion":"reason"}. ONLY JSON, no markdown.`,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content: `Find movie info and poster for: "${query}"`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Anthropic API ${res.status}: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const textBlocks = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text);
    const fullText = textBlocks.join("\n");
    const cleaned = fullText.replace(/```json\s?|```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else
        return NextResponse.json(
          { error: "Could not parse AI response" },
          { status: 500 }
        );
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "AI lookup failed" },
      { status: 500 }
    );
  }
}
