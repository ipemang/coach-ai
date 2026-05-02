/**
 * COA-106: Send an existing note via WhatsApp
 * POST /api/athletes/[id]/notes/[noteId]/send
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

type Ctx = { params: { id: string; noteId: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BACKEND}/api/v1/coach/athletes/${params.id}/notes/${params.noteId}/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
