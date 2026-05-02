"use client";

/**
 * COA-118: Training reports panel for the coach athlete detail page.
 * Shows draft + published reports; lets coach generate, edit, and publish.
 */

import { useState, useEffect, useCallback } from "react";

interface TrainingReport {
  id: string;
  athlete_id: string;
  coach_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  title: string;
  summary_text: string | null;
  full_text: string | null;
  highlights: string[];
  watchouts: string[];
  status: string;
  published_at: string | null;
  created_at: string;
}

interface Props {
  athleteId: string;
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusChip({ status }: { status: string }) {
  if (status === "published") {
    return (
      <span className="ca-chip ca-chip-aegean" style={{ fontSize: 10 }}>
        ✓ Published
      </span>
    );
  }
  return (
    <span className="ca-chip ca-chip-ochre" style={{ fontSize: 10 }}>
      ✎ Draft
    </span>
  );
}

export function AthleteReportsPanel({ athleteId }: Props) {
  const [reports, setReports] = useState<TrainingReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [openReport, setOpenReport] = useState<TrainingReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<TrainingReport>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/reports`);
      if (res.ok) setReports(await res.json());
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_type: "weekly" }),
      });
      const data = await res.json();
      if (res.ok) {
        setReports((prev) => [data, ...prev]);
        setOpenReport(data);
        showToast("Draft report generated");
      } else {
        showToast(data?.detail ?? "Generation failed", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!openReport) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${openReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data as TrainingReport;
        setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setOpenReport(updated);
        setEditing(false);
        showToast("Saved");
      } else {
        showToast(data?.detail ?? "Save failed", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(report: TrainingReport) {
    if (!confirm(`Publish "${report.title}" to ${report.period_start}? The athlete will be notified via WhatsApp.`)) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const updated = data as TrainingReport;
        setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        if (openReport?.id === updated.id) setOpenReport(updated);
        showToast("Report published — athlete notified");
      } else {
        showToast(data?.detail ?? "Publish failed", false);
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setPublishing(false);
    }
  }

  function openEditor(report: TrainingReport) {
    setOpenReport(report);
    setEditDraft({
      title: report.title,
      summary_text: report.summary_text ?? "",
      full_text: report.full_text ?? "",
      highlights: report.highlights,
      watchouts: report.watchouts,
    });
    setEditing(true);
  }

  const drafts = reports.filter((r) => r.status === "draft");
  const published = reports.filter((r) => r.status === "published");

  return (
    <>
      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: "10px 18px",
            borderRadius: 4,
            background: toast.ok ? "var(--ink)" : "var(--terracotta-deep)",
            color: "var(--parchment, #fff)",
            fontFamily: "var(--mono, monospace)",
            fontSize: 12,
            letterSpacing: "0.04em",
            boxShadow: "0 4px 24px -8px rgba(0,0,0,0.35)",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Panel ──────────────────────────────────────────────────── */}
      <div className="ca-panel" style={{ padding: "1.25rem 1.5rem" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
          }}
        >
          <p className="ca-eyebrow" style={{ color: "var(--terracotta-deep)", margin: 0 }}>
            Training Reports
          </p>
          <button
            className="ca-btn ca-btn-sm"
            onClick={handleGenerate}
            disabled={generating}
            style={{ fontSize: 12 }}
          >
            {generating ? "Generating…" : "+ Generate draft"}
          </button>
        </div>

        {loading && (
          <p
            style={{
              fontSize: 12,
              color: "var(--ink-mute)",
              fontFamily: "var(--mono)",
              textAlign: "center",
              padding: "1rem 0",
            }}
          >
            Loading…
          </p>
        )}

        {!loading && reports.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "1.5rem 0",
              border: "1px dashed var(--rule)",
              borderRadius: 4,
            }}
          >
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-mute)",
                fontFamily: "var(--mono)",
                margin: 0,
              }}
            >
              No reports yet
            </p>
            <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 4 }}>
              Generate a draft from last week&apos;s data
            </p>
          </div>
        )}

        {/* Drafts */}
        {drafts.length > 0 && (
          <div style={{ marginBottom: published.length > 0 ? "1.25rem" : 0 }}>
            <p
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                marginBottom: 8,
              }}
            >
              Drafts
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {drafts.map((r) => (
                <div
                  key={r.id}
                  className="ca-panel"
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--amber-wash, #fffbf0)",
                    borderColor: "var(--amber-soft, #f5d87a)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--ink)",
                          margin: "0 0 3px",
                          lineHeight: 1.3,
                        }}
                      >
                        {r.title || "Untitled report"}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                          color: "var(--ink-mute)",
                          margin: 0,
                        }}
                      >
                        {fmtDate(r.period_start)} – {fmtDate(r.period_end)} · {r.period_type}
                      </p>
                    </div>
                    <StatusChip status={r.status} />
                  </div>
                  {r.summary_text && (
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--ink-soft)",
                        lineHeight: 1.5,
                        margin: "0 0 8px",
                        fontStyle: "italic",
                      }}
                    >
                      {r.summary_text.length > 120
                        ? r.summary_text.slice(0, 120) + "…"
                        : r.summary_text}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="ca-btn ca-btn-sm"
                      onClick={() => openEditor(r)}
                      style={{ fontSize: 11 }}
                    >
                      ✎ Edit
                    </button>
                    <button
                      className="ca-btn ca-btn-sm ca-btn-primary"
                      onClick={() => handlePublish(r)}
                      disabled={publishing}
                      style={{ fontSize: 11 }}
                    >
                      {publishing ? "Publishing…" : "↑ Publish"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Published */}
        {published.length > 0 && (
          <div>
            {drafts.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid var(--rule)",
                  marginBottom: "1rem",
                }}
              />
            )}
            <p
              style={{
                fontSize: 10,
                fontFamily: "var(--mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                marginBottom: 8,
              }}
            >
              Published
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {published.map((r) => (
                <div
                  key={r.id}
                  onClick={() => { setOpenReport(r); setEditing(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "0.6rem 0.75rem",
                    borderRadius: 3,
                    background: "var(--surface-tint, rgba(0,0,0,0.02))",
                    cursor: "pointer",
                    transition: "background 120ms",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "var(--linen, #f5f0e8)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "var(--surface-tint, rgba(0,0,0,0.02))")
                  }
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--ink)",
                        margin: "0 0 2px",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.title || "Untitled"}
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--ink-mute)",
                        margin: 0,
                      }}
                    >
                      {fmtDate(r.period_start)}
                    </p>
                  </div>
                  <StatusChip status={r.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Report modal ──────────────────────────────────────────── */}
      {openReport && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(24,20,16,0.4)",
            backdropFilter: "blur(6px)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => { setOpenReport(null); setEditing(false); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--parchment, #faf8f3)",
              width: "min(760px, 94vw)",
              maxHeight: "90vh",
              overflow: "auto",
              borderRadius: 4,
              border: "1px solid var(--rule)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                padding: "20px 28px",
                borderBottom: "1px solid var(--rule-soft)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-mute)",
                    }}
                  >
                    {fmtDate(openReport.period_start)} – {fmtDate(openReport.period_end)}
                  </span>
                  <StatusChip status={openReport.status} />
                </div>
                {editing ? (
                  <input
                    value={editDraft.title ?? ""}
                    onChange={(e) =>
                      setEditDraft((p) => ({ ...p, title: e.target.value }))
                    }
                    style={{
                      fontFamily: "var(--display, Georgia, serif)",
                      fontSize: 22,
                      fontWeight: 400,
                      color: "var(--ink)",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--rule)",
                      outline: "none",
                      width: "100%",
                      padding: "2px 0",
                      letterSpacing: "-0.02em",
                    }}
                    placeholder="Report title"
                  />
                ) : (
                  <h2
                    style={{
                      fontFamily: "var(--display, Georgia, serif)",
                      fontSize: 22,
                      fontWeight: 400,
                      color: "var(--ink)",
                      margin: 0,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {openReport.title || "Untitled report"}
                  </h2>
                )}
              </div>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "var(--ink-mute)",
                  padding: "0 4px",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                onClick={() => { setOpenReport(null); setEditing(false); }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Summary */}
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                    marginBottom: 6,
                  }}
                >
                  Summary
                </p>
                {editing ? (
                  <textarea
                    value={editDraft.summary_text ?? ""}
                    onChange={(e) =>
                      setEditDraft((p) => ({ ...p, summary_text: e.target.value }))
                    }
                    rows={3}
                    style={{
                      width: "100%",
                      fontFamily: "var(--display, Georgia, serif)",
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: "var(--ink)",
                      border: "1px solid var(--rule)",
                      borderRadius: 3,
                      padding: "8px 12px",
                      background: "var(--linen)",
                      outline: "none",
                      resize: "vertical",
                    }}
                    placeholder="One-paragraph summary…"
                  />
                ) : (
                  openReport.summary_text && (
                    <p
                      style={{
                        fontFamily: "var(--display, Georgia, serif)",
                        fontSize: 15,
                        lineHeight: 1.65,
                        color: "var(--ink)",
                        margin: 0,
                        fontStyle: "italic",
                        borderLeft: "2px solid var(--terracotta-deep)",
                        paddingLeft: 14,
                      }}
                    >
                      {openReport.summary_text}
                    </p>
                  )
                )}
              </div>

              {/* Full text */}
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                    marginBottom: 6,
                  }}
                >
                  Full report
                </p>
                {editing ? (
                  <textarea
                    value={editDraft.full_text ?? ""}
                    onChange={(e) =>
                      setEditDraft((p) => ({ ...p, full_text: e.target.value }))
                    }
                    rows={10}
                    style={{
                      width: "100%",
                      fontFamily: "var(--body, Inter, sans-serif)",
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "var(--ink)",
                      border: "1px solid var(--rule)",
                      borderRadius: 3,
                      padding: "10px 12px",
                      background: "var(--linen)",
                      outline: "none",
                      resize: "vertical",
                    }}
                    placeholder="Full report text…"
                  />
                ) : (
                  openReport.full_text && (
                    <div style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink)" }}>
                      {openReport.full_text.split("\n").filter(Boolean).map((para, i) => (
                        <p key={i} style={{ margin: "0 0 10px" }}>
                          {para}
                        </p>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Highlights & watchouts side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--olive-deep, #3a5c2a)",
                      marginBottom: 6,
                    }}
                  >
                    ✓ Highlights
                  </p>
                  {editing ? (
                    <textarea
                      value={(editDraft.highlights ?? []).join("\n")}
                      onChange={(e) =>
                        setEditDraft((p) => ({
                          ...p,
                          highlights: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      rows={4}
                      style={{
                        width: "100%",
                        fontFamily: "var(--body, Inter, sans-serif)",
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: "var(--ink)",
                        border: "1px solid var(--rule)",
                        borderRadius: 3,
                        padding: "8px 10px",
                        background: "var(--olive-wash, #f4f8f0)",
                        outline: "none",
                        resize: "vertical",
                      }}
                      placeholder={"One highlight per line…"}
                    />
                  ) : (
                    <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 5 }}>
                      {openReport.highlights.map((h, i) => (
                        <li key={i} style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--terracotta-deep, #8a3a20)",
                      marginBottom: 6,
                    }}
                  >
                    ⚠ Watch-outs
                  </p>
                  {editing ? (
                    <textarea
                      value={(editDraft.watchouts ?? []).join("\n")}
                      onChange={(e) =>
                        setEditDraft((p) => ({
                          ...p,
                          watchouts: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      rows={4}
                      style={{
                        width: "100%",
                        fontFamily: "var(--body, Inter, sans-serif)",
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: "var(--ink)",
                        border: "1px solid var(--rule)",
                        borderRadius: 3,
                        padding: "8px 10px",
                        background: "var(--terracotta-wash, #fdf4f0)",
                        outline: "none",
                        resize: "vertical",
                      }}
                      placeholder={"One watch-out per line…"}
                    />
                  ) : (
                    <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 5 }}>
                      {openReport.watchouts.map((w, i) => (
                        <li key={i} style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div
              style={{
                padding: "16px 28px",
                borderTop: "1px solid var(--rule-soft)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              {openReport.status === "draft" && !editing && (
                <>
                  <button
                    className="ca-btn ca-btn-sm"
                    onClick={() => openEditor(openReport)}
                    style={{ fontSize: 12 }}
                  >
                    ✎ Edit draft
                  </button>
                  <button
                    className="ca-btn ca-btn-sm ca-btn-primary"
                    onClick={() => handlePublish(openReport)}
                    disabled={publishing}
                    style={{ fontSize: 12 }}
                  >
                    {publishing ? "Publishing…" : "↑ Publish to athlete"}
                  </button>
                </>
              )}
              {editing && (
                <>
                  <button
                    className="ca-btn ca-btn-sm"
                    onClick={() => setEditing(false)}
                    style={{ fontSize: 12 }}
                  >
                    Cancel
                  </button>
                  <button
                    className="ca-btn ca-btn-sm ca-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ fontSize: 12 }}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </>
              )}
              {openReport.status === "published" && (
                <button
                  className="ca-btn ca-btn-sm"
                  onClick={() => { setOpenReport(null); setEditing(false); }}
                  style={{ fontSize: 12 }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
