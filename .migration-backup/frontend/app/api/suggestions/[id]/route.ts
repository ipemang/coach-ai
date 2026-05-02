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
  const { action, coach_reply, plan_action, edit_plan_mod, change_type, change_value, reasoning, rejection_reason, plan_rejection_reason } = body as {
    action?: "approved" | "ignored" | "modified";
    coach_reply?: string;
    plan_action?: "approved" | "rejected";
    // COA-65: rejection reasons
    rejection_reason?: string;
    plan_rejection_reason?: string;
    // COA-81: inline plan modification edit
    edit_plan_mod?: boolean;
    change_type?: string;
    change_value?: string;
    reasoning?: string;
  };

  // COA-81: Edit plan modification payload before approving
  if (edit_plan_mod) {
    if (!change_type || !change_value) {
      return NextResponse.json({ error: "change_type and change_value are required" }, { status: 400 });
    }

    // Fetch current payload to preserve original on first edit
    const { data: existing, error: fetchErr } = await supabase
      .from("suggestions")
      .select("plan_modification_payload, plan_modification_original")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: fetchErr?.message ?? "Not found" }, { status: 404 });
    }

    const currentPayload = (existing.plan_modification_payload ?? {}) as Record<string, unknown>;
    const updatedPayload = {
      ...currentPayload,
      change_type,
      change_value,
      ...(reasoning ? { coach_reasoning: reasoning } : {}),
    };

    const update: Record<string, unknown> = {
      plan_modification_payload: updatedPayload,
      updated_at: new Date().toISOString(),
    };

    // Preserve original AI payload on first edit only — never overwrite again
    if (!existing.plan_modification_original) {
      update.plan_modification_original = currentPayload;
    }

    const { error: updateErr } = await supabase
      .from("suggestions")
      .update(update)
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id,
      plan_modification_payload: updatedPayload,
      plan_modification_original: update.plan_modification_original ?? existing.plan_modification_original,
    });
  }

  // COA-65: Plan modification approval — independent of message approval
  if (plan_action) {
    if (!["approved", "rejected"].includes(plan_action)) {
      return NextResponse.json({ error: "Invalid plan_action" }, { status: 400 });
    }

    // Update plan_modification_status in Supabase
    const { error: pmError } = await supabase
      .from("suggestions")
      .update({ plan_modification_status: plan_action, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (pmError) {
      return NextResponse.json({ error: pmError.message }, { status: 500 });
    }

    // Call backend /decide to log + apply the workout change (non-fatal)
    let decideLogged = false;
    try {
      const decideRes = await fetch(
        `${BACKEND_URL}/api/v1/coach/suggestions/${id}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: plan_action,
            decision_type: "plan_modification",
            ...(plan_rejection_reason ? { rejection_reason: plan_rejection_reason } : {}),
          }),
        }
      );
      decideLogged = decideRes.ok;
      if (!decideRes.ok) {
        console.warn("[suggestions] plan /decide call failed:", await decideRes.text());
      }
    } catch (err) {
      console.warn("[suggestions] plan /decide error (non-fatal):", err);
    }

    return NextResponse.json({ ok: true, id, plan_modification_status: plan_action, decideLogged });
  }

  if (!action || !["approved", "ignored", "modified"].includes(action)) {
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
      decidePayload.rejection_reason = rejection_reason ?? "coach_dismissed";
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
        const s = suggestion as Record<string, unknown>;
        const messageText =
          (s.coach_reply as string | null) ||
          (s.message_personalized as string | null) ||
          (s.suggestion_text as string | null) ||
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
