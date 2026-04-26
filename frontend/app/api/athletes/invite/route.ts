/**
 * COA-53 / COA-78: Athlete invite proxy.
 *
 * Creates an onboard invite token scoped to the coach, optionally sends a
 * WhatsApp invite if a phone number is provided, and returns the invite URL
 * so the coach can share it manually.
 *
 * Forwards the Supabase JWT from the browser so the backend can resolve
 * the coach's identity via require_roles("coach").
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/v1/athlete/auth/send-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[athletes/invite] Backend request failed:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
