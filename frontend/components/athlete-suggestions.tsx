"use client";

import { useState } from "react";
import type { Suggestion } from "@/app/lib/types";

interface Props {
  suggestions: Suggestion[];
  athleteId: string;
}

export function AthleteSuggestions({ suggestions: initial, athleteId }: Props) {
  const [suggestions, setSuggestions] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  async function act(id: string, action: "approved" | "ignored", reply?: string) {
    setLoading(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, coach_reply: reply }),
      });
      if (res.ok) {
        setSuggestions((s) => s.filter((x) => x.id !== id));
        setEditingId(null);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-amber-300">⚡</span>
        <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-widest">
          AI Recommendations — {suggestions.length} pending
        </h2>
      </div>

      <div className="space-y-3">
        {suggestions.map((s) => {
          const isEditing = editingId === s.id;
          const isLoading = loading === s.id;
          const timeAgo = formatTimeAgo(s.created_at);

          return (
            <div
              key={s.id}
              className="rounded-xl border border-line bg-surface/80 p-4"
            >
              {/* Athlete message */}
              {s.athlete_message && (
                <div className="mb-3 rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-400 mb-1">Athlete said:</p>
                  <p className="text-sm text-slate-300 italic">"{s.athlete_message}"</p>
                </div>
              )}

              {/* AI draft reply */}
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-1">AI draft reply:</p>
                {isEditing ? (
                  <textarea
                    className="w-full rounded-lg border border-line bg-white/5 px-3 py-2 text-sm text-white resize-none focus:border-indigo-500 focus:outline-none"
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-white leading-relaxed">
                    {s.suggestion_text ?? "—"}
                  </p>
                )}
              </div>

              {/* Timestamp + actions */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-slate-500">{timeAgo}</span>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => act(s.id, "approved", editText)}
                        disabled={isLoading || !editText.trim()}
                        className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 transition"
                      >
                        {isLoading ? "Sending…" : "Send edited reply"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => act(s.id, "ignored")}
                        disabled={isLoading}
                        className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white disabled:opacity-40 transition"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => { setEditingId(s.id); setEditText(s.suggestion_text ?? ""); }}
                        disabled={isLoading}
                        className="rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => act(s.id, "approved", s.suggestion_text ?? "")}
                        disabled={isLoading}
                        className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 transition"
                      >
                        {isLoading ? "Approving…" : "✓ Approve & Send"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
