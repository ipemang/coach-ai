/**
 * COA-79: Confirm and persist coach methodology profile proxy.
 *
 * Takes the coach-reviewed/edited playbook and persona_system_prompt, persists
 * them to the methodologies table and updates coaches.methodology_playbook.
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
      `${BACKEND_URL}/api/v1/coach/onboarding/confirm-profile`,
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
    console.error("[onboarding/confirm-profile] Backend request failed:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
