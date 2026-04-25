/**
 * COA-104: Weekly digest generation proxy
 * POST /api/weekly-digests/generate?force=true — proxies to FastAPI
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const BACKEND = (process.env.BACKEND_URL ?? "").replace(/\/+$/, "");

function serverSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const weekEnding = req.nextUrl.searchParams.get("week_ending");

  let url = `${BACKEND}/api/v1/coach/weekly-digests/generate?force=${force}`;
  if (weekEnding) url += `&week_ending=${encodeURIComponent(weekEnding)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
