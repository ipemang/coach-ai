/**
 * COA-118: Publish a draft training report
 * POST /api/reports/[reportId]/publish
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

type Ctx = { params: { reportId: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BACKEND}/api/v1/coach/reports/${params.reportId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
