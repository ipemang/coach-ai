/**
 * COA-106: AI draft session note
 * POST /api/athletes/[id]/notes/draft?workout_id=...
 * Returns: { draft: string, athlete_id, workout_id }
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

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = serverSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workoutId = req.nextUrl.searchParams.get("workout_id");
  let url = `${BACKEND}/api/v1/coach/athletes/${params.id}/notes/draft`;
  if (workoutId) url += `?workout_id=${encodeURIComponent(workoutId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
