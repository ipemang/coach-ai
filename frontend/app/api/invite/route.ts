import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json().catch(() => ({}));
  const coachId = body.coach_id || process.env.COACH_ID;
  const organizationId = body.organization_id || process.env.ORGANIZATION_ID || "1";

  if (!coachId) {
    return NextResponse.json({ error: "coach_id required" }, { status: 400 });
  }

  // Fetch coach's WhatsApp number for notifications
  const { data: coachRow } = await supabase
    .from("coaches")
    .select("id, whatsapp_number")
    .eq("id", coachId)
    .single();

  // Generate a secure random token
  const token = crypto.randomBytes(24).toString("hex");

  // Expires in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("athlete_connect_tokens").insert({
    token,
    purpose: "onboard",
    coach_id: coachId,
    organization_id: organizationId,
    coach_whatsapp_number: coachRow?.whatsapp_number ?? null,
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const backendUrl = process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";
  const inviteUrl = `${backendUrl}/onboard?token=${token}`;

  return NextResponse.json({
    token,
    invite_url: inviteUrl,
    expires_at: expiresAt,
  });
}
