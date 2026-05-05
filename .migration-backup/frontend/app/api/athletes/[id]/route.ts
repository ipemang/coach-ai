import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * F-C2: Verify the bearer token and return the authenticated user.
 * Returns null if the token is missing or invalid.
 */
async function verifyCoachToken(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  // Use the anon key to validate the token — this checks against Supabase Auth
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // F-C2: Require a valid bearer token — previously any caller could update any athlete.
  const user = await verifyCoachToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const supabase = adminClient();

  // Confirm this athlete belongs to the calling coach (ownership check)
  const { data: athlete, error: ownerErr } = await supabase
    .from("athletes")
    .select("id, coach_id")
    .eq("id", id)
    .single();

  if (ownerErr || !athlete) {
    return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
  }

  // Coaches are linked via the coaches table by auth_user_id
  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!coach || coach.id !== athlete.coach_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = ["stable_profile", "current_state", "full_name", "timezone_name"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const { data, error } = await supabase
    .from("athletes")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ athlete: data });
}
