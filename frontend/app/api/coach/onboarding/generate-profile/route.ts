/**
 * COA-79: Generate coach methodology profile proxy.
 *
 * Takes the coach's free-text description, calls the backend AI pipeline,
 * returns a playbook preview + persona_system_prompt for the coach to review.
 * Does NOT persist — that happens via confirm-profile.
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
    res = await fetch(
      `${BACKEND_URL}/api/v1/coach/onboarding/generate-profile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    console.error("[onboarding/generate-profile] Backend request failed:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
