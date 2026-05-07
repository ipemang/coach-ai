import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COACH_ID = process.env.COACH_ID!;

// B-NEW-08: Verify the bearer token before allowing the toggle.
async function verifyToken(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  const anonClient = createClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  // B-NEW-08: Require auth — previously unauthenticated.
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch current value
  const { data } = await supabase
    .from("coaches")
    .select("ai_autonomy_override")
    .eq("id", COACH_ID)
    .single();

  const current = !!data?.ai_autonomy_override;
  const next = !current;

  const { error } = await supabase
    .from("coaches")
    .update({ ai_autonomy_override: next })
    .eq("id", COACH_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ai_autonomy_override: next });
}
