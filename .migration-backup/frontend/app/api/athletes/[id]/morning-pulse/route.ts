/**
 * COA-103: Morning pulse config proxy.
 * GET  — fetch current questions + time + today's session
 * PATCH — update questions + time
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authHeader = req.headers.get("Authorization");
  // B-NEW-09: Reject requests with no Authorization header — previously a null
  // header was silently proxied, leaking data to unauthenticated callers.
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BACKEND_URL}/api/v1/coach/athletes/${id}/morning-pulse`,
    {
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    },
  ).catch(() => null);

  if (!res) return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authHeader = req.headers.get("Authorization");
  // B-NEW-09: Reject requests with no Authorization header.
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }

  const res = await fetch(
    `${BACKEND_URL}/api/v1/coach/athletes/${id}/morning-pulse`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    },
  ).catch(() => null);

  if (!res) return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
