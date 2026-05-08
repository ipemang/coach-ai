"use client";

import { useState, useEffect, useRef } from "react";

interface AthleteFile {
  id: string;
  original_filename: string;
  file_type: string;
  category: string | null;
  description: string | null;
  document_type: string | null;
  uploaded_by: string | null;
  ai_accessible: boolean;
  status: string;
  size_bytes: number | null;
  chunk_count: number | null;
  created_at: string;
}

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  dexa:          { label: "DEXA Scan",       color: "var(--terracotta-deep)" },
  blood_work:    { label: "Blood Work",       color: "#c0556a" },
  doctor_notes:  { label: "Doctor Notes",     color: "#8b5cf6" },
  training_plan: { label: "Training Plan",    color: "var(--aegean-deep)" },
  race_results:  { label: "Race Results",     color: "#d97706" },
  other:         { label: "Other",            color: "var(--ink-soft)" },
};

const DOC_TYPE_OPTIONS = [
  { value: "", label: "Select type…" },
  { value: "dexa", label: "DEXA Scan" },
  { value: "blood_work", label: "Blood Work / Lab Results" },
  { value: "doctor_notes", label: "Doctor Notes" },
  { value: "training_plan", label: "Training Plan" },
  { value: "race_results", label: "Race Results" },
  { value: "other", label: "Other" },
];

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  athleteId: string;
}

export function AthleteDocumentVault({ athleteId }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<AthleteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [aiAccessible, setAiAccessible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-file toggling state
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function loadFiles() {
    setLoading(true);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail on load
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && files.length === 0 && !loading) {
      loadFiles();
    }
  }, [open]);

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      if (docType) form.append("document_type", docType);
      if (docDescription) form.append("description", docDescription);
      form.append("ai_accessible", String(aiAccessible));

      const res = await fetch(`/api/athletes/${athleteId}/files`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || body.error || "Upload failed");
      }
      const newFile = await res.json();
      setFiles(prev => [newFile, ...prev]);
      setShowUpload(false);
      setSelectedFile(null);
      setDocType("");
      setDocDescription("");
      setAiAccessible(true);
      showToast("Document uploaded");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleToggleAI(fileId: string, current: boolean) {
    setTogglingId(fileId);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_accessible: !current }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      const updated = await res.json();
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ai_accessible: updated.ai_accessible } : f));
      showToast(updated.ai_accessible ? "AI access enabled" : "AI access disabled");
    } catch {
      showToast("Could not update AI access");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    setDeletingId(fileId);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setFiles(prev => prev.filter(f => f.id !== fileId));
      showToast("Document deleted");
    } catch {
      showToast("Could not delete document");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleView(fileId: string) {
    setViewingId(fileId);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/files/${fileId}/url`);
      if (!res.ok) throw new Error("Could not generate URL");
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Could not generate preview link");
    } finally {
      setViewingId(null);
    }
  }

  return (
    <div
      className="ca-panel"
      style={{ padding: "1rem 1.5rem" }}
    >
      {/* Panel header — click to expand */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🗂</span>
          <p className="ca-eyebrow" style={{ margin: 0 }}>Document Vault</p>
          {files.length > 0 && (
            <span className="ca-chip" style={{ fontSize: 11 }}>{files.length}</span>
          )}
        </div>
        <span style={{ color: "var(--ink-mute)", fontSize: 14, transition: "transform 160ms",
          display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}>›</span>
      </button>

      {open && (
        <div style={{ marginTop: "1rem" }}>

          {/* Upload form toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
              Documents are never accessible via public URL. AI access is per-document.
            </p>
            <button
              onClick={() => setShowUpload(v => !v)}
              className="ca-btn ca-btn-primary"
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              {showUpload ? "Cancel" : "+ Upload"}
            </button>
          </div>

          {/* Upload form */}
          {showUpload && (
            <div
              style={{
                background: "var(--parchment)",
                border: "1px solid var(--rule)",
                borderRadius: 12,
                padding: "1rem",
                marginBottom: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {/* File picker */}
              <div>
                <label style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "var(--ink-mute)", display: "block", marginBottom: 4 }}>
                  File (PDF, TXT, MD, CSV — max 100 MB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.csv"
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                  style={{
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    width: "100%",
                  }}
                />
                {selectedFile && (
                  <p style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                    {selectedFile.name} · {formatBytes(selectedFile.size)}
                  </p>
                )}
              </div>

              {/* Document type */}
              <div>
                <label style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "var(--ink-mute)", display: "block", marginBottom: 4 }}>
                  Document type
                </label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  style={{
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "var(--parchment)",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    width: "100%",
                  }}
                >
                  {DOC_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "var(--ink-mute)", display: "block", marginBottom: 4 }}>
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={docDescription}
                  onChange={e => setDocDescription(e.target.value)}
                  placeholder="e.g. Q1 2026 DEXA scan"
                  style={{
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "transparent",
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    width: "100%",
                  }}
                />
              </div>

              {/* AI access toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={aiAccessible}
                  onChange={e => setAiAccessible(e.target.checked)}
                />
                <span style={{ fontSize: 13, color: "var(--ink)" }}>
                  Allow AI to read this document
                </span>
              </label>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="ca-btn ca-btn-primary"
                style={{ alignSelf: "flex-start", opacity: (!selectedFile || uploading) ? 0.5 : 1 }}
              >
                {uploading ? "Uploading…" : "Upload document"}
              </button>
            </div>
          )}

          {/* File list */}
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--ink-mute)", textAlign: "center", padding: "1rem 0" }}>
              Loading…
            </p>
          ) : files.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-mute)", textAlign: "center", padding: "1rem 0" }}>
              No documents yet. Upload a health doc, training plan, or race history.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {files.map(f => {
                const typeInfo = f.document_type ? DOC_TYPE_LABELS[f.document_type] : null;
                const uploadedAt = new Date(f.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                });
                return (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: "var(--parchment)",
                      borderRadius: 10,
                      border: "1px solid var(--rule)",
                    }}
                  >
                    {/* File icon */}
                    <span style={{ fontSize: 18, flexShrink: 0 }}>
                      {f.file_type === "pdf" ? "📄" : f.file_type === "csv" ? "📊" : "📝"}
                    </span>

                    {/* File info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", margin: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.original_filename}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 3, alignItems: "center" }}>
                        {typeInfo && (
                          <span style={{
                            fontSize: 10,
                            fontFamily: "var(--mono)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: typeInfo.color,
                            background: `${typeInfo.color}18`,
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}>
                            {typeInfo.label}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>
                          {uploadedAt}
                          {f.size_bytes ? ` · ${formatBytes(f.size_bytes)}` : ""}
                          {f.uploaded_by === "coach" ? " · uploaded by you" : ""}
                        </span>
                      </div>
                      {f.description && (
                        <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: "2px 0 0" }}>
                          {f.description}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {/* AI toggle */}
                      <button
                        onClick={() => handleToggleAI(f.id, f.ai_accessible)}
                        disabled={togglingId === f.id}
                        title={f.ai_accessible ? "AI access ON — click to disable" : "AI access OFF — click to enable"}
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                          padding: "3px 8px",
                          borderRadius: 6,
                          border: "1px solid",
                          cursor: "pointer",
                          opacity: togglingId === f.id ? 0.5 : 1,
                          background: f.ai_accessible ? "rgba(16,185,129,0.1)" : "transparent",
                          borderColor: f.ai_accessible ? "rgba(16,185,129,0.4)" : "var(--rule)",
                          color: f.ai_accessible ? "rgb(16,185,129)" : "var(--ink-mute)",
                          transition: "all 160ms",
                        }}
                      >
                        {togglingId === f.id ? "…" : f.ai_accessible ? "AI ✓" : "AI ✗"}
                      </button>

                      {/* View */}
                      <button
                        onClick={() => handleView(f.id)}
                        disabled={viewingId === f.id}
                        title="Open document (15-min link)"
                        style={{
                          fontSize: 14,
                          background: "none",
                          border: "1px solid var(--rule)",
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          color: "var(--aegean-deep)",
                          opacity: viewingId === f.id ? 0.5 : 1,
                        }}
                      >
                        {viewingId === f.id ? "…" : "↗"}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(f.id, f.original_filename)}
                        disabled={deletingId === f.id}
                        title="Delete document"
                        style={{
                          fontSize: 14,
                          background: "none",
                          border: "1px solid transparent",
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          color: "var(--ink-mute)",
                          opacity: deletingId === f.id ? 0.5 : 1,
                          transition: "color 160ms",
                        }}
                        onMouseOver={e => (e.currentTarget.style.color = "var(--terracotta-deep)")}
                        onMouseOut={e => (e.currentTarget.style.color = "var(--ink-mute)")}
                      >
                        {deletingId === f.id ? "…" : "✕"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* AI access legend */}
          <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: "0.75rem" }}>
            🔒 Files are stored encrypted. AI only reads documents marked "AI ✓".
          </p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "var(--ink)",
          color: "var(--parchment)",
          borderRadius: 10,
          padding: "10px 18px",
          fontSize: 13,
          zIndex: 200,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
