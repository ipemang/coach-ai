/**
 * COA-104: Weekly digest update / send / dismiss proxy
 * PATCH /api/weekly-digests/[id]          — edit summary_text
 * POST  /api/weekly-digests/[id]?action=send    — send via WhatsApp
 * POST  /api/weekly-digests/[id]?action=dismiss — dismiss without sending
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

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const res = await fetch(`${BACKEND}/api/v1/coach/weekly-digests/${params.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action") ?? "send";
  const endpoint = action === "dismiss"
    ? `${BACKEND}/api/v1/coach/weekly-digests/${params.id}/dismiss`
    : `${BACKEND}/api/v1/coach/weekly-digests/${params.id}/send`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  return NextResponse.json(await res.json(), { status: res.status });
}
