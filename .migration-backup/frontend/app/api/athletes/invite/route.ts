/**
 * COA-53 / COA-78 / COA-110: Athlete invite proxy.
 *
 * Creates an onboard invite token scoped to the coach, optionally sends a
 * WhatsApp invite if a phone number is provided, and returns the invite URL
 * so the coach can share it manually.
 *
 * If `pre_profile` is included in the request body, it is stripped before
 * forwarding to the backend and then written directly to Supabase
 * `athlete_connect_tokens.pre_profile` once the token is known.
 *
 * Forwards the Supabase JWT from the browser so the backend can resolve
 * the coach's identity via require_roles("coach").
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Separate pre_profile from the backend-bound fields
  const { pre_profile, ...backendBody } = rawBody;

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/v1/athlete/auth/send-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(backendBody),
    });
  } catch (err) {
    console.error("[athletes/invite] Backend request failed:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;

  // If the backend returned an invite_url and we have pre_profile data,
  // extract the token from the URL and write it to Supabase.
  if (res.ok && pre_profile && data.invite_url) {
    try {
      const inviteUrl = new URL(data.invite_url as string);
      const token = inviteUrl.searchParams.get("token");
      if (token) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabase
          .from("athlete_connect_tokens")
          .update({ pre_profile })
          .eq("token", token);
      }
    } catch (err) {
      // Non-fatal — invite still works, just without pre-population
      console.warn("[athletes/invite] pre_profile write failed:", err);
    }
  }

  return NextResponse.json(data, { status: res.status });
}
