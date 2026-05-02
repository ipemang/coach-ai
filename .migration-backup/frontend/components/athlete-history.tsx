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
    <div className="ca-panel" style={{ padding: "0" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--rule)",
          padding: "0 1.25rem",
        }}
      >
        <button
          className={`ca-tab${tab === "checkins" ? " active" : ""}`}
          onClick={() => setTab("checkins")}
        >
          Check-ins ({checkins.length})
        </button>
        <button
          className={`ca-tab${tab === "all_suggestions" ? " active" : ""}`}
          onClick={() => setTab("all_suggestions")}
        >
          Coach Replies ({completed.length})
        </button>
      </div>

      {/* Content */}
      <div
        className="ca-scroll"
        style={{
          padding: "1rem 1.25rem",
          maxHeight: 420,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.625rem",
        }}
      >
        {tab === "checkins" && (
          <>
            {checkins.length === 0 && (
              <Empty>No check-ins yet.</Empty>
            )}
            {checkins.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: "0.75rem 0.875rem",
                  background: "var(--parchment)",
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    className={`ca-chip${c.message_type === "voice" ? " ca-chip-ochre" : ""}`}
                    style={{ padding: "1px 7px", fontSize: 9.5 }}
                  >
                    {c.message_type === "voice" ? "🎙 Voice" : "💬 Text"}
                  </span>
                  <span
                    className="ca-mono"
                    style={{ fontSize: 10, color: "var(--ink-mute)" }}
                  >
                    {formatDate(c.created_at)}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  {c.message_text || (
                    <span style={{ fontStyle: "italic", color: "var(--ink-mute)" }}>
                      No content
                    </span>
                  )}
                </p>
              </div>
            ))}
          </>
        )}

        {tab === "all_suggestions" && (
          <>
            {completed.length === 0 && (
              <Empty>No sent replies yet.</Empty>
            )}
            {completed.map((s) => {
              const chipClass =
                s.status === "approved"
                  ? "ca-chip ca-chip-aegean"
                  : s.status === "ignored"
                  ? "ca-chip"
                  : "ca-chip ca-chip-ochre";

              return (
                <div
                  key={s.id}
                  style={{
                    padding: "0.75rem 0.875rem",
                    background: "var(--parchment)",
                    border: "1px solid var(--rule-soft)",
                    borderRadius: 2,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span className={chipClass} style={{ padding: "1px 7px", fontSize: 9.5 }}>
                      {s.status}
                    </span>
                    <span
                      className="ca-mono"
                      style={{ fontSize: 10, color: "var(--ink-mute)" }}
                    >
                      {formatDate(s.created_at)}
                    </span>
                  </div>

                  {s.athlete_message && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--ink-mute)",
                        fontStyle: "italic",
                        marginBottom: 6,
                      }}
                    >
                      Athlete: &ldquo;{s.athlete_message}&rdquo;
                    </p>
                  )}

                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-soft)",
                      lineHeight: 1.55,
                      margin: 0,
                    }}
                  >
                    {s.coach_reply || s.suggestion_text || "—"}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        color: "var(--ink-mute)",
        fontStyle: "italic",
        padding: "0.25rem 0",
      }}
    >
      {children}
    </p>
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
