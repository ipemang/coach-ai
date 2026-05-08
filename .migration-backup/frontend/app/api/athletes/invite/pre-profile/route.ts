/**
 * GET /api/athletes/invite/pre-profile?token=<invite_token>
 *
 * Returns the coach-supplied pre_profile for an invite token so the athlete
 * onboarding page can pre-populate form fields.
 *
 * The token itself is the credential — no auth header required.
 * We only return non-sensitive fields (no coach_notes).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("athlete_connect_tokens")
    .select("pre_profile, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ pre_profile: {} });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ pre_profile: {} });
  }

  // Strip coach_notes — those are internal only
  const { coach_notes: _, ...athleteVisible } = (data.pre_profile as Record<string, unknown>) ?? {};
  void _;

  return NextResponse.json({ pre_profile: athleteVisible });
}
