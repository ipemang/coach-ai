/**
 * COA-66: Athlete document vault — coach file management proxy
 * GET  /api/athletes/[id]/files       — list an athlete's files
 * POST /api/athletes/[id]/files       — coach uploads a file on behalf of athlete
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

  const res = await fetch(`${BACKEND}/api/v1/coach/athletes/${params.id}/files`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Forward multipart form data directly to backend
  const formData = await req.formData();

  const res = await fetch(`${BACKEND}/api/v1/coach/athletes/${params.id}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      // Do NOT set Content-Type — let fetch set it with the correct boundary
    },
    body: formData,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
