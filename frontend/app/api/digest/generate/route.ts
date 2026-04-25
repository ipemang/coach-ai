/**
 * COA-102: Daily digest — generate via FastAPI LLM pipeline.
 *
 * Proxies to the FastAPI backend which uses LLMClient to generate the briefing
 * and caches the result in coaches.daily_digest. Requires the caller to pass a
 * valid Supabase session token in the Authorization header.
 *
 * Query params forwarded: ?force=true to bypass the 6-hour staleness check.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const force = req.nextUrl.searchParams.get("force") === "true";

  let res: Response;
  try {
    res = await fetch(
      `${BACKEND_URL}/api/v1/coach/digest/generate?force=${force}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      },
    );
  } catch (err) {
    console.error("[digest/generate] Backend request failed:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
