import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { id } = await params;
  const body = await req.json();
  const { action, coach_reply } = body as { action: "approved" | "ignored"; coach_reply?: string };

  if (!["approved", "ignored"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Step 1: Update the suggestion in Supabase
  const update: Record<string, unknown> = {
    status: action,
    updated_at: new Date().toISOString(),
  };
  if (coach_reply) update.coach_reply = coach_reply;

  const { error } = await supabase
    .from("suggestions")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 2: If approved, call backend to send the WhatsApp message to the athlete
  let whatsappSent = false;
  let whatsappError: string | null = null;

  if (action === "approved") {
    try {
      // Fetch the suggestion to get the athlete phone number and message text
      const { data: suggestion } = await supabase
        .from("suggestions")
        .select("athlete_id, suggestion_text, coach_reply, athletes(phone_number)")
        .eq("id", id)
        .single();

      if (suggestion) {
        const phone =
          (suggestion.athletes as { phone_number?: string } | null)?.phone_number;
        const messageText =
          (suggestion as { coach_reply?: string; suggestion_text?: string }).coach_reply ||
          (suggestion as { suggestion_text?: string }).suggestion_text;

        if (phone && messageText && !phone.startsWith("web:")) {
          // Call the backend send endpoint — it handles WhatsApp delivery
          const backendRes = await fetch(
            `${BACKEND_URL}/api/v1/coach/suggestions/${id}/send`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone_number: phone,
                message: messageText,
              }),
            }
          );
          whatsappSent = backendRes.ok;
          if (!backendRes.ok) {
            const errBody = await backendRes.text();
            whatsappError = errBody;
            console.warn("[suggestions] Backend send failed:", errBody);
          }
        }
      }
    } catch (err) {
      whatsappError = String(err);
      console.warn("[suggestions] WhatsApp send error:", err);
      // Non-fatal — DB update already succeeded
    }
  }

  return NextResponse.json({ ok: true, id, status: action, whatsappSent, whatsappError });
}
