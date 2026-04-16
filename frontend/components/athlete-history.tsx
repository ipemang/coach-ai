"use client";

import { useState } from "react";
import type { CheckIn, Suggestion } from "@/app/lib/types";

interface Props {
  checkins: CheckIn[];
  suggestions: Suggestion[];
}

export function AthleteHistory({ checkins, suggestions }: Props) {
  const [tab, setTab] = useState<"checkins" | "all_suggestions">("checkins");

  const completed = suggestions.filter((s) => s.status !== "pending");

  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-5 shadow-panel">
      <div className="mb-4 flex items-center gap-4 border-b border-line pb-3">
        <button
          onClick={() => setTab("checkins")}
          className={`text-xs font-semibold uppercase tracking-widest transition pb-3 -mb-3 border-b-2 ${
            tab === "checkins"
              ? "border-sky-400 text-sky-300"
              : "border-transparent text-slate-500 hover:text-white"
          }`}
        >
          Check-ins ({checkins.length})
        </button>
        <button
          onClick={() => setTab("all_suggestions")}
          className={`text-xs font-semibold uppercase tracking-widest transition pb-3 -mb-3 border-b-2 ${
            tab === "all_suggestions"
              ? "border-sky-400 text-sky-300"
              : "border-transparent text-slate-500 hover:text-white"
          }`}
        >
          Coach Replies ({completed.length})
        </button>
      </div>

      {tab === "checkins" && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {checkins.length === 0 && (
            <p className="text-xs text-slate-500 italic">No check-ins yet.</p>
          )}
          {checkins.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs rounded-full px-2 py-0.5 ${
                  c.message_type === "voice"
                    ? "bg-purple-500/15 text-purple-300"
                    : "bg-white/5 text-slate-400"
                }`}>
                  {c.message_type === "voice" ? "🎙️ Voice" : "💬 Text"}
                </span>
                <span className="text-xs text-slate-500">{formatDate(c.created_at)}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {c.message_text || <span className="italic text-slate-600">No content</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "all_suggestions" && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {completed.length === 0 && (
            <p className="text-xs text-slate-500 italic">No sent replies yet.</p>
          )}
          {completed.map((s) => (
            <div key={s.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs rounded-full px-2 py-0.5 ${
                  s.status === "approved"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : s.status === "ignored"
                    ? "bg-white/5 text-slate-500"
                    : "bg-sky-500/15 text-sky-300"
                }`}>
                  {s.status}
                </span>
                <span className="text-xs text-slate-500">{formatDate(s.created_at)}</span>
              </div>
              {s.athlete_message && (
                <p className="text-xs text-slate-500 italic mb-1.5">
                  Athlete: "{s.athlete_message}"
                </p>
              )}
              <p className="text-sm text-slate-300 leading-relaxed">
                {s.coach_reply || s.suggestion_text || "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
