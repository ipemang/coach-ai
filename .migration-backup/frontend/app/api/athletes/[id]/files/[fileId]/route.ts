/**
 * COA-66: Per-file document vault operations
 * PATCH  /api/athletes/[id]/files/[fileId]  — toggle ai_accessible / set document_type
 * DELETE /api/athletes/[id]/files/[fileId]  — delete a file
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

type Ctx = { params: { id: string; fileId: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const res = await fetch(
    `${BACKEND}/api/v1/coach/athletes/${params.id}/files/${params.fileId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BACKEND}/api/v1/coach/athletes/${params.id}/files/${params.fileId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
