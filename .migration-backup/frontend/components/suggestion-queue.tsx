"use client";

import { useState, useEffect, useRef } from "react";
import type { Suggestion } from "@/app/lib/types";
import { createBrowserSupabase } from "@/app/lib/supabase";
import { SuggestionReviewModal } from "./suggestion-review-modal";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(text: string | null, max = 160): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

const CLASS_BADGE: Record<string, string> = {
  check_in:      "bg-sky-400/10 text-sky-300",
  plan_question: "bg-violet-400/10 text-violet-300",
  flag:          "bg-red-400/10 text-red-300",
  noise:         "bg-slate-400/10 text-slate-400",
};
const CLASS_LABEL: Record<string, string> = {
  check_in:      "Check-in",
  plan_question: "Plan Q",
  flag:          "Flag",
  noise:         "Noise",
};

interface SuggestionCardProps {
  suggestion: Suggestion;
  onOpen: (s: Suggestion) => void;
  onQuickAction: (id: string, action: "approved" | "ignored") => void;
  loading: boolean;
}

function SuggestionCard({ suggestion: s, onOpen, onQuickAction, loading }: SuggestionCardProps) {
  const previewText = s.message_personalized ?? s.suggestion_text;
  const badgeClass = s.message_class ? CLASS_BADGE[s.message_class] : null;
  const badgeLabel = s.message_class ? CLASS_LABEL[s.message_class] : null;
  const hasPlanMod = s.plan_modification_payload?.warranted;

  return (
    <article
      className="group rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:bg-white/[0.07] cursor-pointer"
      onClick={() => onOpen(s)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-300">
            {(s.athlete_display_name ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{s.athlete_display_name ?? "Unknown athlete"}</p>
            <p className="text-xs text-slate-500">{timeAgo(s.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badgeClass && badgeLabel && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
              {badgeLabel}
            </span>
          )}
          {hasPlanMod && (
            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              Plan change
            </span>
          )}
          <span className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
            Pending
          </span>
        </div>
      </div>

      {/* Athlete message */}
      {s.athlete_message && (
        <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
          <p className="text-xs text-slate-400">Athlete said</p>
          <p className="mt-1 text-sm text-slate-200 italic">"{truncate(s.athlete_message, 120)}"</p>
        </div>
      )}

      {/* AI draft preview */}
      <div className="mt-3">
        <p className="text-xs text-slate-400">AI draft reply</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">{truncate(previewText, 160)}</p>
      </div>

      {/* Actions — stop propagation so card click doesn't re-fire */}
      <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          disabled={loading}
          onClick={() => onQuickAction(s.id, "approved")}
          className="flex-1 rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
        >
          ✓ Approve & Send
        </button>
        <button
          disabled={loading}
          onClick={() => onOpen(s)}
          className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-40"
        >
          Review
        </button>
        <button
          disabled={loading}
          onClick={() => onQuickAction(s.id, "ignored")}
          className="rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/10 disabled:opacity-40"
        >
          Ignore
        </button>
      </div>
    </article>
  );
}

export function SuggestionQueue({ suggestions: initial }: { suggestions: Suggestion[] }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [reviewing, setReviewing] = useState<Suggestion | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabase>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    channelRef.current = supabase
      .channel("suggestion-queue-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "suggestions",
          filter: "status=eq.pending",
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newSuggestion: Suggestion = {
            id: row.id as string,
            athlete_id: row.athlete_id as string | null,
            athlete_display_name: row.athlete_display_name as string | null,
            suggestion_text: row.suggestion_text as string | null,
            message_personalized: row.message_personalized as string | null,
            message_draft: row.message_draft as string | null,
            message_class: row.message_class as string | null,
            classification_confidence: row.classification_confidence as number | null,
            message_reasoning: row.message_reasoning as string | null,
            plan_modification_payload: row.plan_modification_payload as Suggestion["plan_modification_payload"],
            status: "pending",
            coach_reply: null,
            created_at: row.created_at as string,
            updated_at: row.updated_at as string,
            athlete_message: null,
          };
          setSuggestions((prev) => {
            if (prev.some((s) => s.id === newSuggestion.id)) return prev;
            return [newSuggestion, ...prev];
          });
          setPulse(true);
          setTimeout(() => setPulse(false), 1500);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  async function callApi(
    id: string,
    action: "approved" | "ignored" | "modified",
    finalMessage?: string,
    rejectionReason?: string
  ) {
    const res = await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        coach_reply: finalMessage,
        ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleQuickAction(id: string, action: "approved" | "ignored") {
    setLoadingId(id);
    setError(null);
    try {
      await callApi(id, action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleModalSubmit(
    id: string,
    action: "approved" | "ignored" | "modified",
    finalMessage?: string,
    rejectionReason?: string
  ) {
    await callApi(id, action, finalMessage, rejectionReason);
  }

  async function handlePlanAction(id: string, planAction: "approved" | "rejected", reason?: string) {
    const res = await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_action: planAction,
        ...(reason ? { plan_rejection_reason: reason } : {}),
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    // Suggestion stays in queue — message approval is a separate action
  }

  return (
    <>
      {reviewing && (
        <SuggestionReviewModal
          suggestion={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={handleModalSubmit}
          onPlanAction={handlePlanAction}
        />
      )}

      <section className={`rounded-3xl border bg-surface/90 p-6 shadow-panel backdrop-blur transition-all duration-500 ${pulse ? "border-sky-400/60 shadow-sky-500/10" : "border-line"}`}>
        <div className="flex items-center justify-between border-b border-line pb-5">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-sky-300">Approval Queue</p>
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Pending AI suggestions</h2>
            <p className="mt-2 text-sm text-slate-300">
              {suggestions.length === 0
                ? "All clear — no pending suggestions."
                : `${suggestions.length} draft ${suggestions.length === 1 ? "reply" : "replies"} waiting for your approval.`}
            </p>
          </div>
          <div className="rounded-2xl bg-accent-soft px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-sky-200/80">Queue</p>
            <p className={`mt-1 text-2xl font-bold transition-colors duration-500 ${pulse ? "text-sky-300" : "text-white"}`}>{suggestions.length}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl">✓</div>
              <p className="mt-3 text-lg font-semibold text-white">All caught up</p>
              <p className="mt-1 text-sm text-slate-400">New suggestions will appear here as athletes check in.</p>
            </div>
          ) : (
            suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onOpen={setReviewing}
                onQuickAction={handleQuickAction}
                loading={loadingId === s.id}
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}
