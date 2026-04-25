"use client";

import { useState } from "react";
import type { Suggestion } from "@/app/lib/types";

interface Props {
  suggestion: Suggestion;
  onClose: () => void;
  onSubmit: (id: string, action: "approved" | "ignored" | "modified", finalMessage?: string) => Promise<void>;
  onPlanAction?: (id: string, planAction: "approved" | "rejected") => Promise<void>;
}

const CLASS_LABELS: Record<string, { label: string; color: string }> = {
  check_in:       { label: "Check-in",       color: "bg-sky-400/10 text-sky-300" },
  plan_question:  { label: "Plan question",  color: "bg-violet-400/10 text-violet-300" },
  flag:           { label: "Flag",           color: "bg-red-400/10 text-red-300" },
  noise:          { label: "Noise",          color: "bg-slate-400/10 text-slate-400" },
};

function ConfidencePips({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const filled = Math.round(value * 5);
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`inline-block h-1.5 w-3 rounded-full ${i < filled ? "bg-sky-400" : "bg-white/10"}`}
          />
        ))}
      </span>
      <span className="text-xs text-slate-400">{pct}%</span>
    </span>
  );
}

export function SuggestionReviewModal({ suggestion: s, onClose, onSubmit, onPlanAction }: Props) {
  const displayText = s.message_personalized ?? s.suggestion_text ?? "";
  const [editedMessage, setEditedMessage] = useState(displayText);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState<"approved" | "ignored" | "modified" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState<"approved" | "rejected" | null>(null);
  const [planDone, setPlanDone] = useState<"approved" | "rejected" | null>(
    s.plan_modification_status === "approved" || s.plan_modification_status === "rejected"
      ? s.plan_modification_status
      : null
  );

  // COA-81: Plan modification inline edit state
  const initialPlanPayload = s.plan_modification_payload;
  const [planPayload, setPlanPayload] = useState(initialPlanPayload);
  const [planHasOriginal, setPlanHasOriginal] = useState(!!s.plan_modification_original);
  const [isPlanEditing, setIsPlanEditing] = useState(false);
  const [planEditValues, setPlanEditValues] = useState({
    change_type: initialPlanPayload?.change_type ?? "",
    change_value: initialPlanPayload?.change_value ?? "",
    reasoning: initialPlanPayload?.reasoning ?? "",
  });
  const [planEditLoading, setPlanEditLoading] = useState(false);
  const [planEditError, setPlanEditError] = useState<string | null>(null);
  const [planEdited, setPlanEdited] = useState(!!s.plan_modification_original);

  async function handleSavePlanEdit() {
    if (!planEditValues.change_type.trim() || !planEditValues.change_value.trim()) {
      setPlanEditError("Change type and value are required.");
      return;
    }
    setPlanEditLoading(true);
    setPlanEditError(null);
    try {
      const res = await fetch(`/api/suggestions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit_plan_mod: true,
          change_type: planEditValues.change_type.trim(),
          change_value: planEditValues.change_value.trim(),
          reasoning: planEditValues.reasoning.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Save failed");
      }
      const data = await res.json();
      // Update local display with saved values
      setPlanPayload(data.plan_modification_payload);
      if (!planHasOriginal && data.plan_modification_original) {
        setPlanHasOriginal(true);
      }
      setPlanEdited(true);
      setIsPlanEditing(false);
    } catch (e) {
      setPlanEditError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPlanEditLoading(false);
    }
  }

  const hasChanges = editedMessage.trim() !== displayText.trim();
  const classInfo = s.message_class ? CLASS_LABELS[s.message_class] : null;

  async function handleAction(action: "approved" | "ignored" | "modified") {
    setLoading(action);
    setError(null);
    try {
      await onSubmit(s.id, action, action === "modified" ? editedMessage : undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0f1117] shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-sm font-bold text-sky-300">
              {(s.athlete_display_name ?? "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-base font-semibold text-white">{s.athlete_display_name ?? "Unknown athlete"}</p>
              <p className="text-xs text-slate-500">
                {new Date(s.created_at).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Athlete message */}
          {s.athlete_message && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-slate-500">
                Athlete message
              </p>
              <div className="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3">
                <p className="text-sm leading-relaxed text-slate-200 italic">"{s.athlete_message}"</p>
              </div>
            </div>
          )}

          {/* Classification row */}
          {(classInfo || s.classification_confidence != null) && (
            <div className="flex flex-wrap items-center gap-3">
              {classInfo && (
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${classInfo.color}`}>
                  {classInfo.label}
                </span>
              )}
              {s.classification_confidence != null && (
                <ConfidencePips value={s.classification_confidence} />
              )}
            </div>
          )}

          {/* AI reasoning */}
          {s.message_reasoning && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-widest text-slate-500 hover:text-slate-300 transition select-none">
                AI reasoning
                <span className="ml-1 text-slate-600 group-open:rotate-90 inline-block transition-transform">›</span>
              </summary>
              <div className="mt-2 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <p className="text-xs leading-relaxed text-slate-400">{s.message_reasoning}</p>
              </div>
            </details>
          )}

          {/* Raw draft vs personalised */}
          {s.message_draft && s.message_personalized && s.message_draft !== s.message_personalized && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-widest text-slate-500 hover:text-slate-300 transition select-none">
                Raw AI draft (before persona)
                <span className="ml-1 text-slate-600 group-open:rotate-90 inline-block transition-transform">›</span>
              </summary>
              <div className="mt-2 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <p className="text-xs leading-relaxed text-slate-400">{s.message_draft}</p>
              </div>
            </details>
          )}

          {/* Plan modification — COA-81: inline edit mode */}
          {planPayload?.warranted && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium uppercase tracking-widest text-amber-400/70">
                  Suggested plan change
                </p>
                {!isPlanEditing && planDone === null && (
                  <button
                    onClick={() => {
                      setPlanEditValues({
                        change_type: planPayload.change_type ?? "",
                        change_value: planPayload.change_value ?? "",
                        reasoning: (planPayload as Record<string, unknown>).coach_reasoning as string
                          ?? planPayload.reasoning ?? "",
                      });
                      setPlanEditError(null);
                      setIsPlanEditing(true);
                    }}
                    className="text-xs text-amber-400/80 hover:text-amber-300 transition"
                  >
                    ✎ Edit
                  </button>
                )}
              </div>

              {isPlanEditing ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                      Change type
                    </label>
                    <input
                      type="text"
                      value={planEditValues.change_type}
                      onChange={(e) => setPlanEditValues(v => ({ ...v, change_type: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-400/40 transition placeholder-slate-600"
                      placeholder="e.g. reduce_duration"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                      Change value
                    </label>
                    <input
                      type="text"
                      value={planEditValues.change_value}
                      onChange={(e) => setPlanEditValues(v => ({ ...v, change_value: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-400/40 transition placeholder-slate-600"
                      placeholder="e.g. 60 minutes"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                      Your reasoning (optional)
                    </label>
                    <textarea
                      value={planEditValues.reasoning}
                      onChange={(e) => setPlanEditValues(v => ({ ...v, reasoning: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-400/40 resize-none transition placeholder-slate-600"
                      placeholder="Why are you adjusting this?"
                    />
                  </div>
                  {planEditError && (
                    <p className="text-xs text-red-400">{planEditError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={planEditLoading}
                      onClick={handleSavePlanEdit}
                      className="flex-1 rounded-xl bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/30 transition disabled:opacity-40"
                    >
                      {planEditLoading ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      disabled={planEditLoading}
                      onClick={() => { setIsPlanEditing(false); setPlanEditError(null); }}
                      className="rounded-xl bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 transition disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 space-y-1">
                  <p className="text-sm font-medium text-amber-200">
                    {planPayload.change_type}:{" "}
                    <span className="font-normal text-slate-300">{planPayload.change_value}</span>
                  </p>
                  {((planPayload as Record<string, unknown>).coach_reasoning as string | undefined
                    ?? planPayload.reasoning) && (
                    <p className="text-xs text-slate-400">
                      {(planPayload as Record<string, unknown>).coach_reasoning as string
                        ?? planPayload.reasoning}
                    </p>
                  )}
                  {planEdited && (
                    <p className="text-[11px] text-amber-400/60 pt-0.5">✎ Edited from AI original</p>
                  )}
                </div>
              )}

              {!isPlanEditing && onPlanAction && planDone === null && (
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={!!planLoading}
                    onClick={async () => {
                      setPlanLoading("approved");
                      try {
                        await onPlanAction(s.id, "approved");
                        setPlanDone("approved");
                      } catch {
                        // error surfaced by parent if needed
                      } finally {
                        setPlanLoading(null);
                      }
                    }}
                    className="flex-1 rounded-xl bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/30 transition disabled:opacity-40"
                  >
                    {planLoading === "approved" ? "Applying…" : "✓ Apply change"}
                  </button>
                  <button
                    disabled={!!planLoading}
                    onClick={async () => {
                      setPlanLoading("rejected");
                      try {
                        await onPlanAction(s.id, "rejected");
                        setPlanDone("rejected");
                      } catch {
                        // error surfaced by parent if needed
                      } finally {
                        setPlanLoading(null);
                      }
                    }}
                    className="rounded-xl bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 transition disabled:opacity-40"
                  >
                    {planLoading === "rejected" ? "…" : "✗ Reject"}
                  </button>
                </div>
              )}
              {planDone === "approved" && (
                <p className="mt-1.5 text-xs text-emerald-400">✓ Workout updated</p>
              )}
              {planDone === "rejected" && (
                <p className="mt-1.5 text-xs text-slate-500">Plan change rejected</p>
              )}
            </div>
          )}

          {/* Editable reply */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
                Message to athlete
              </p>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-sky-400 hover:text-sky-300 transition"
                >
                  Edit
                </button>
              )}
              {isEditing && hasChanges && (
                <button
                  onClick={() => { setEditedMessage(displayText); setIsEditing(false); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Reset
                </button>
              )}
            </div>

            {isEditing ? (
              <textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-sky-500/30 bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-200 outline-none focus:border-sky-500/60 resize-none transition placeholder-slate-600"
                placeholder="Type your reply…"
              />
            ) : (
              <div
                className="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 cursor-text"
                onClick={() => setIsEditing(true)}
              >
                <p className="text-sm leading-relaxed text-slate-200">{editedMessage || <span className="text-slate-600 italic">No message text</span>}</p>
              </div>
            )}

            {hasChanges && (
              <p className="mt-1.5 text-xs text-amber-400/80">
                ✎ You've edited this message — approving will send your version.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-white/5 shrink-0">
          <button
            disabled={!!loading}
            onClick={() => handleAction(hasChanges ? "modified" : "approved")}
            className="flex-1 rounded-2xl bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {loading === "approved" || loading === "modified"
              ? "Sending…"
              : hasChanges
              ? "✓ Send edited reply"
              : "✓ Approve & Send"}
          </button>
          <button
            disabled={!!loading}
            onClick={() => handleAction("ignored")}
            className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/10 disabled:opacity-40"
          >
            {loading === "ignored" ? "…" : "Ignore"}
          </button>
        </div>

      </div>
    </div>
  );
}
