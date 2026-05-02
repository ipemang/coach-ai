"use client";

/**
 * COA-106: Session note panel for the athlete detail page.
 *
 * Allows the coach to:
 * 1. Click "AI draft" to generate a note from the latest completed workout + biometrics
 * 2. Edit the draft inline
 * 3. Save without sending, or send directly to athlete via WhatsApp
 * 4. View previous notes (last 10)
 */

import { useState, useEffect } from "react";

interface NoteRow {
  id: string;
  note_text: string;
  source: string;
  sent_via_whatsapp: boolean;
  sent_at: string | null;
  created_at: string;
}

export function SessionNotePanel({ athleteId }: { athleteId: string }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendLoading, setSendLoading] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function loadNotes() {
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/notes`);
      if (res.ok) {
        const json = await res.json();
        setNotes(json.notes ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setNotesLoading(false);
    }
  }

  useEffect(() => {
    if (expanded) loadNotes();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAIDraft() {
    setDrafting(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/notes/draft`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setText(json.draft ?? "");
      } else {
        showToast("Draft generation failed. Write manually.");
      }
    } catch {
      showToast("Draft generation failed. Write manually.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave(send: boolean) {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/athletes/${athleteId}/notes${send ? "?send=true" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note_text: text.trim() }),
        }
      );
      if (res.ok) {
        showToast(send ? "Note sent to athlete via WhatsApp ✓" : "Note saved ✓");
        setText("");
        loadNotes();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Failed to save note");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSendExisting(noteId: string) {
    setSendLoading(noteId);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/notes/${noteId}/send`, { method: "POST" });
      if (res.ok) {
        showToast("Sent via WhatsApp ✓");
        loadNotes();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Send failed");
      }
    } finally {
      setSendLoading(null);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return ""; }
  }

  return (
    <div
      className="ca-panel"
      style={{ overflow: "hidden", position: "relative" }}
    >
      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute", top: 10, right: 12, background: "var(--aegean-deep)",
          color: "oklch(0.97 0.02 210)", fontSize: 11, padding: "5px 12px",
          borderRadius: 4, zIndex: 10, fontFamily: "var(--mono)", letterSpacing: "0.04em",
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: "100%", padding: "14px 18px", display: "flex", alignItems: "center",
          justifyContent: "space-between", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>✏️</span>
          <span className="ca-eyebrow" style={{ fontSize: 10 }}>Session notes</span>
          {notes.length > 0 && (
            <span className="ca-chip" style={{ fontSize: 9 }}>{notes.length}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--rule)", padding: "14px 18px" }}>
          {/* Compose area */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="ca-eyebrow" style={{ fontSize: 9 }}>New note</span>
              <button
                onClick={handleAIDraft}
                disabled={drafting}
                className="ca-btn"
                style={{ fontSize: 10, padding: "4px 12px", display: "flex", alignItems: "center", gap: 5 }}
              >
                {drafting ? (
                  <>
                    <span style={{ width: 10, height: 10, border: "1.5px solid var(--rule)", borderTopColor: "var(--aegean-deep)", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                    Drafting…
                  </>
                ) : "⚡ AI draft"}
              </button>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Write a post-workout note for this athlete, or click AI draft…"
              rows={4}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "var(--serif)", fontStyle: text ? "italic" : "normal",
                fontSize: 13, lineHeight: 1.6,
                color: "var(--ink)", background: "var(--parchment)",
                border: "1px solid var(--rule)", borderRadius: 2,
                padding: "10px 12px", resize: "vertical",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                onClick={() => handleSave(false)}
                disabled={saving || !text.trim()}
                className="ca-btn"
                style={{ fontSize: 10, padding: "6px 14px" }}
              >
                {saving ? "Saving…" : "Save (no send)"}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !text.trim()}
                className="ca-btn ca-btn-primary"
                style={{ fontSize: 10, padding: "6px 16px" }}
              >
                {saving ? "Sending…" : "Send to athlete →"}
              </button>
            </div>
          </div>

          {/* Previous notes */}
          {notesLoading && (
            <div style={{ fontSize: 11, color: "var(--ink-mute)", textAlign: "center", padding: "8px 0" }}>
              Loading notes…
            </div>
          )}

          {!notesLoading && notes.length > 0 && (
            <div>
              <span className="ca-eyebrow" style={{ fontSize: 9, display: "block", marginBottom: 8 }}>
                Previous notes
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {notes.map(n => (
                  <div
                    key={n.id}
                    style={{
                      padding: "10px 12px",
                      background: "var(--parchment)",
                      border: "1px solid var(--rule)",
                      borderLeft: n.sent_via_whatsapp ? "2px solid var(--aegean-deep)" : "2px solid var(--rule)",
                      borderRadius: 2,
                    }}
                  >
                    <p style={{
                      margin: 0, fontSize: 12.5,
                      fontFamily: "var(--serif)", fontStyle: "italic",
                      color: "var(--ink-soft)", lineHeight: 1.55,
                    }}>
                      {n.note_text}
                    </p>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>
                        {formatDate(n.created_at)}
                        {n.sent_via_whatsapp
                          ? " · sent via WhatsApp"
                          : " · saved"}
                      </span>
                      {!n.sent_via_whatsapp && (
                        <button
                          onClick={() => handleSendExisting(n.id)}
                          disabled={sendLoading === n.id}
                          className="ca-btn"
                          style={{ fontSize: 9, padding: "3px 8px" }}
                        >
                          {sendLoading === n.id ? "Sending…" : "Send →"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!notesLoading && notes.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--ink-mute)", margin: 0, paddingTop: 4 }}>
              No notes yet. Write one above or click AI draft.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
