/**
 * COA-104: Weekly digests list proxy
 * GET /api/weekly-digests?status=draft — proxies to FastAPI with coach JWT
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

export async function GET(req: NextRequest) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const url = `${BACKEND}/api/v1/coach/weekly-digests${status ? `?status=${encodeURIComponent(status)}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
