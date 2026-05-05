/**
 * COA-75: Resend plan link proxy.
 *
 * Calls the backend resend-plan-link endpoint, which regenerates the athlete's
 * plan_access token and sends a new /my-plan link via WhatsApp.
 * F-C5: Now requires and forwards the coach's Authorization header.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // F-C5: Backend requires coach auth — forward the bearer token.
  // Previously omitted, causing all resend calls to return 401 from the backend.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(
      `${BACKEND_URL}/api/v1/coach/athletes/${id}/resend-plan-link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      },
    );
  } catch (err) {
    console.error("[resend-plan-link] Backend request failed:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
