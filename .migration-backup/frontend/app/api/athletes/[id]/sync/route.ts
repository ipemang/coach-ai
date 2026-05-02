import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { provider } = await req.json() as { provider: "oura" | "strava" };

  if (!["oura", "strava"].includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/v1/coach/athletes/${id}/sync-${provider}`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.detail ?? "Sync failed" }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
