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
  const { action, coach_reply } = body as {
    action: "approved" | "ignored" | "modified";
    coach_reply?: string;
  };

  if (!["approved", "ignored", "modified"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Normalise: "modified" is stored as "approved" in Supabase (it was approved, just edited)
  const dbStatus = action === "modified" ? "approved" : action;

  // Step 1: Update the suggestion in Supabase
  const update: Record<string, unknown> = {
    status: dbStatus,
    updated_at: new Date().toISOString(),
    coach_decision: action,
  };
  if (coach_reply) {
    update.coach_reply = coach_reply;
    // If modified, also store the edited text so the audit trail is clear
    if (action === "modified") update.coach_edited_payload = coach_reply;
  }

  const { error } = await supabase
    .from("suggestions")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 2: Call backend /decide to log the decision for the feedback loop (COA-64)
  // Non-fatal — DB update already succeeded, don't block the response on this
  let decideLogged = false;
  try {
    const decidePayload: Record<string, unknown> = {
      action: action === "modified" ? "modified" : action === "approved" ? "approved" : "rejected",
      decision_type: "message",
    };
    if (action === "modified" && coach_reply) {
      decidePayload.final_message = coach_reply;
    }
    if (action === "ignored") {
      decidePayload.rejection_reason = "coach_dismissed";
    }

    const decideRes = await fetch(
      `${BACKEND_URL}/api/v1/coach/suggestions/${id}/decide`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decidePayload),
      }
    );
    decideLogged = decideRes.ok;
    if (!decideRes.ok) {
      console.warn("[suggestions] /decide call failed:", await decideRes.text());
    }
  } catch (err) {
    console.warn("[suggestions] /decide error (non-fatal):", err);
  }

  // Step 3: If approved or modified, send the WhatsApp message to the athlete
  let whatsappSent = false;
  let whatsappError: string | null = null;

  if (action === "approved" || action === "modified") {
    try {
      const { data: suggestion } = await supabase
        .from("suggestions")
        .select("athlete_id, suggestion_text, message_personalized, coach_reply, athletes(phone_number)")
        .eq("id", id)
        .single();

      if (suggestion) {
        const phone =
          (suggestion.athletes as { phone_number?: string } | null)?.phone_number;

        // Priority: coach_reply (edited) → message_personalized (AI persona) → suggestion_text (fallback)
        const messageText =
          (suggestion as Record<string, unknown>).coach_reply as string |
          (suggestion as Record<string, unknown>).message_personalized as string |
          (suggestion as Record<string, unknown>).suggestion_text as string |
          null;

        if (phone && messageText && !phone.startsWith("web:")) {
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
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    status: dbStatus,
    action,
    decideLogged,
    whatsappSent,
    whatsappError,
  });
}
