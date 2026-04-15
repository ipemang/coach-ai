import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { action, coach_reply } = body as { action: "approved" | "ignored"; coach_reply?: string };

  if (!["approved", "ignored"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status: action,
    updated_at: new Date().toISOString(),
  };
  if (coach_reply) update.coach_reply = coach_reply;

  const { error } = await supabase
    .table("suggestions")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, status: action });
}
