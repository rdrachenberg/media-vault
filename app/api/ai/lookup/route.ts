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
        system: `You are a movie database assistant. Search the web for accurate movie info. Return ONLY a valid JSON object. CRITICAL RULES:
1. NO HTML tags, NO <cite> tags, NO markdown — ONLY raw JSON
2. NO text before or after the JSON object
3. The JSON must have these exact fields:
{"title":"Full Title","year":2024,"director":"Name","runtime":120,"genre":"Genre","rating":"PG-13","synopsis":"2-3 sentences","cast":"Actor1, Actor2, Actor3","poster_url":"https://image.tmdb.org/t/p/w500/...","collection":"Franchise or Standalone","found":true}
4. For poster_url: search TMDB for the movie page and extract the poster image path
5. If movie not found: {"found":false,"suggestion":"reason"}
6. If given a UPC/barcode number, search the web to identify which movie/DVD/Blu-ray it belongs to, then return that movie's info`,
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
    
    // Strip markdown fences, HTML/XML tags (citations from web search), and whitespace
    const cleaned = fullText
      .replace(/```json\s?|```/g, "")
      .replace(/<[^>]*>/g, "")        // Strip ALL HTML/XML tags including <cite>, , etc.
      .replace(/&[a-z]+;/gi, "")      // Strip HTML entities
      .trim();

    let parsed: any;
    try {
      // Try parsing the full cleaned text
      parsed = JSON.parse(cleaned);
    } catch {
      // Extract the JSON object from surrounding text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          // Last resort: try to fix common issues (trailing commas, etc)
          const fixed = match[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
          parsed = JSON.parse(fixed);
        }
      } else {
        return NextResponse.json(
          { error: "Could not parse AI response" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "AI lookup failed" },
      { status: 500 }
    );
  }
}
