/**
 * COA-106: Session notes proxy
 * GET  /api/athletes/[id]/notes          — list notes for athlete
 * POST /api/athletes/[id]/notes          — save a note (body: {note_text, workout_id?})
 *                                          ?send=true also fires via WhatsApp
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

  const res = await fetch(`${BACKEND}/api/v1/coach/athletes/${params.id}/notes`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const send = req.nextUrl.searchParams.get("send") === "true";
  const body = await req.json();

  const res = await fetch(`${BACKEND}/api/v1/coach/athletes/${params.id}/notes?send=${send}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
