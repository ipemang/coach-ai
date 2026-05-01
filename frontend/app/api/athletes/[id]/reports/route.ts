/**
 * COA-118: Training reports proxy — per-athlete
 * GET  /api/athletes/[id]/reports          — list reports for an athlete
 * POST /api/athletes/[id]/reports/generate — generate a new draft report
 *
 * Note: "generate" action is handled via query param ?action=generate so we
 * stay within a single [id]/reports route file.
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

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BACKEND}/api/v1/coach/athletes/${params.id}/reports?limit=20`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${BACKEND}/api/v1/coach/athletes/${params.id}/reports/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
