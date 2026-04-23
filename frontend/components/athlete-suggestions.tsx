"use client";

import { useState, useEffect, useRef } from "react";
import type { Suggestion } from "@/app/lib/types";
import { createBrowserSupabase } from "@/app/lib/supabase";

interface Props {
  suggestions: Suggestion[];
  athleteId: string;
}

export function AthleteSuggestions({ suggestions: initial, athleteId }: Props) {
  const [suggestions, setSuggestions] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabase>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    channelRef.current = supabase
      .channel(`athlete-suggestions-${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "suggestions",
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.status !== "pending") return;
          const s: Suggestion = {
            id: row.id as string,
            athlete_id: row.athlete_id as string | null,
            athlete_display_name: row.athlete_display_name as string | null,
            suggestion_text: row.suggestion_text as string | null,
            status: "pending",
            coach_reply: null,
            created_at: row.created_at as string,
            updated_at: row.updated_at as string,
            athlete_message: null,
          };
          setSuggestions((prev) =>
            prev.some((x) => x.id === s.id) ? prev : [s, ...prev]
          );
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [athleteId]);

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
    <div
      className="ca-panel"
      style={{
        borderLeft: "3px solid var(--terracotta)",
        padding: "1.25rem 1.5rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: "1.25rem",
        }}
      >
        <span style={{ fontSize: 16 }}>⚡</span>
        <span
          className="ca-eyebrow ca-eyebrow-terra"
          style={{ fontSize: 11 }}
        >
          AI Recommendations — {suggestions.length} pending
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {suggestions.map((s) => {
          const isEditing = editingId === s.id;
          const isLoading = loading === s.id;
          const timeAgo = formatTimeAgo(s.created_at);

          return (
            <div
              key={s.id}
              className="tessera ca-rise"
              style={{ padding: "1rem 1.125rem" }}
            >
              {/* Athlete message bubble */}
              {s.athlete_message && (
                <div
                  style={{
                    marginBottom: "0.875rem",
                    padding: "0.625rem 0.875rem",
                    background: "var(--linen-deep)",
                    borderLeft: "2px solid var(--ochre)",
                    borderRadius: 2,
                  }}
                >
                  <p
                    className="ca-eyebrow"
                    style={{ marginBottom: 4, fontSize: 10 }}
                  >
                    Athlete said:
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-soft)",
                      fontStyle: "italic",
                      margin: 0,
                    }}
                  >
                    &ldquo;{s.athlete_message}&rdquo;
                  </p>
                </div>
              )}

              {/* AI draft */}
              <div style={{ marginBottom: "0.875rem" }}>
                <p
                  className="ca-eyebrow ca-eyebrow-aegean"
                  style={{ marginBottom: 6, fontSize: 10 }}
                >
                  AI draft reply:
                </p>
                {isEditing ? (
                  <textarea
                    style={{
                      width: "100%",
                      padding: "0.625rem 0.75rem",
                      background: "var(--parchment)",
                      border: "1px solid var(--rule)",
                      borderRadius: 2,
                      fontSize: 13,
                      color: "var(--ink)",
                      fontFamily: "var(--body)",
                      lineHeight: 1.5,
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {s.suggestion_text ?? "—"}
                  </p>
                )}
              </div>

              {/* Actions row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span
                  className="ca-mono"
                  style={{ fontSize: 11, color: "var(--ink-mute)" }}
                >
                  {timeAgo}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => setEditingId(null)}
                        className="ca-btn ca-btn-ghost"
                        style={{ padding: "5px 12px", fontSize: 12 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => act(s.id, "approved", editText)}
                        disabled={isLoading || !editText.trim()}
                        className="ca-btn ca-btn-primary"
                        style={{
                          padding: "5px 14px",
                          fontSize: 12,
                          opacity: isLoading || !editText.trim() ? 0.45 : 1,
                        }}
                      >
                        {isLoading ? "Sending…" : "Send edited reply"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => act(s.id, "ignored")}
                        disabled={isLoading}
                        className="ca-btn ca-btn-ghost"
                        style={{
                          padding: "5px 12px",
                          fontSize: 12,
                          opacity: isLoading ? 0.45 : 1,
                        }}
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setEditText(s.suggestion_text ?? "");
                        }}
                        disabled={isLoading}
                        className="ca-btn"
                        style={{
                          padding: "5px 12px",
                          fontSize: 12,
                          opacity: isLoading ? 0.45 : 1,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => act(s.id, "approved", s.suggestion_text ?? "")}
                        disabled={isLoading}
                        className="ca-btn ca-btn-primary"
                        style={{
                          padding: "5px 14px",
                          fontSize: 12,
                          opacity: isLoading ? 0.45 : 1,
                        }}
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
