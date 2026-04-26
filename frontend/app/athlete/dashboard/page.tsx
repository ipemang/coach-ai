"use client";

/**
 * COA-98: Athlete dashboard.
 * Auth: requires athlete Supabase session with athlete_id in JWT.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://coach-ai-production-a5aa.up.railway.app";

interface AthleteProfile {
  id: string;
  full_name: string;
  email: string;
  primary_sport: string;
  fitness_level: string;
  ai_profile_summary: string;
  target_event_name: string;
  target_event_date: string;
  goal_description: string;
  onboarding_complete: boolean;
}

interface Workout {
  id: string;
  title: string;
  description: string;
  scheduled_date: string;
  workout_type: string;
  status: string;
  duration_minutes: number;
}

interface AthleteFile {
  id: string;
  original_filename: string;
  file_type: string;
  category: string;
  status: string;
  size_bytes: number;
  created_at: string;
}

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function formatBytes(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WORKOUT_ICONS: Record<string, string> = {
  run: "🏃", bike: "🚴", swim: "🏊", strength: "💪",
  brick: "⚡", rest: "😴", default: "🎯",
};

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      className="mosaic-bg"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ textAlign: "center" }}>
        <div className="ca-avatar" style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 16px" }}>
          <span>C</span>
        </div>
        <p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading your dashboard…</p>
      </div>
    </div>
  );
}

// ── Workout card ──────────────────────────────────────────────────────────────

function WorkoutCard({ w, compact }: { w: Workout; compact?: boolean }) {
  const icon = WORKOUT_ICONS[w.workout_type?.toLowerCase() ?? ""] ?? WORKOUT_ICONS.default;

  const statusColor = w.status === "completed"
    ? "var(--aegean-deep)"
    : w.status === "missed"
    ? "var(--terracotta-deep)"
    : "var(--ink-mute)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: compact ? "center" : "flex-start",
        gap: 12,
        padding: compact ? "0.625rem 0.875rem" : "0.875rem 1rem",
        background: w.status === "completed" ? "var(--aegean-wash)" : "var(--parchment)",
        border: `1px solid ${w.status === "completed" ? "var(--aegean-soft)" : "var(--rule-soft)"}`,
        borderRadius: 2,
        opacity: w.status === "completed" ? 0.75 : 1,
      }}
    >
      <div
        style={{
          width: compact ? 28 : 36,
          height: compact ? 28 : 36,
          borderRadius: 2,
          background: "var(--linen-deep)",
          border: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 14 : 18,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              fontFamily: "var(--body)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: compact ? "nowrap" : "normal",
            }}
          >
            {w.title}
          </span>
          <span
            className="ca-mono"
            style={{ fontSize: 10, color: statusColor, flexShrink: 0 }}
          >
            {w.status === "completed" ? "✓ Done" : formatDate(w.scheduled_date)}
          </span>
        </div>

        {!compact && w.description && (
          <p
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              margin: "4px 0 0",
              lineHeight: 1.55,
              whiteSpace: "pre-line",
            }}
          >
            {w.description.length > 120 ? w.description.slice(0, 120) + "…" : w.description}
          </p>
        )}

        {!compact && w.duration_minutes > 0 && (
          <span
            className="ca-mono"
            style={{ fontSize: 10, color: "var(--aegean-deep)", marginTop: 4, display: "block" }}
          >
            {w.duration_minutes} min
          </span>
        )}
      </div>
    </div>
  );
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ f, onDelete }: { f: AthleteFile; onDelete: (id: string) => void }) {
  const icon = f.file_type === "pdf" ? "📄" : f.file_type === "csv" ? "📊" : "📝";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0.75rem 0.875rem",
        background: "var(--parchment)",
        border: "1px solid var(--rule-soft)",
        borderRadius: 2,
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink)",
            margin: "0 0 2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {f.original_filename}
        </p>
        <p className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)", margin: 0 }}>
          {formatBytes(f.size_bytes)} · {formatDate(f.created_at)}
          {f.status === "processed" && " · ✓ Indexed"}
          {f.status === "pending" && " · Indexing…"}
        </p>
      </div>
      <button
        onClick={() => onDelete(f.id)}
        style={{
          background: "none",
          border: "none",
          color: "var(--rule)",
          cursor: "pointer",
          fontSize: 16,
          padding: "4px 6px",
          flexShrink: 0,
          transition: "color 140ms",
          lineHeight: 1,
        }}
        onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--terracotta)")}
        onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--rule)")}
        title="Delete file"
      >
        ×
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AthleteDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [files, setFiles] = useState<AthleteFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"plan" | "files">("plan");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function getToken() {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }

      const token = session.access_token;

      try {
        const statusRes = await fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (!statusData.onboarding_complete) {
            router.replace("/athlete/onboarding");
            return;
          }
        }
      } catch { /* continue */ }

      const athleteId = (() => {
        try {
          const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
          return JSON.parse(window.atob(b64 + "==".slice((b64.length % 4) || 4))).athlete_id as string;
        } catch { return null; }
      })();

      if (!athleteId) { router.replace("/athlete/onboarding"); return; }

      const sb = createBrowserSupabase();
      const [athleteRes, workoutsRes, filesRes] = await Promise.allSettled([
        sb.from("athletes").select("id, full_name, email, primary_sport, fitness_level, ai_profile_summary, target_event_name, target_event_date, goal_description, onboarding_complete").eq("id", athleteId).single(),
        sb.from("workouts").select("id, title, description, scheduled_date, workout_type, status, duration_minutes").eq("athlete_id", athleteId).order("scheduled_date", { ascending: true }).limit(10),
        fetch(`${BACKEND}/api/v1/athlete/files`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (athleteRes.status === "fulfilled" && athleteRes.value.data) setProfile(athleteRes.value.data as AthleteProfile);
      if (workoutsRes.status === "fulfilled" && workoutsRes.value.data) setWorkouts(workoutsRes.value.data as Workout[]);
      if (filesRes.status === "fulfilled" && (filesRes.value as Response).ok) {
        const fileData = await (filesRes.value as Response).json();
        setFiles(fileData);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(null);
    const token = await getToken();
    if (!token) { setUploadError("Session expired."); setUploading(false); return; }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${BACKEND}/api/v1/athlete/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? "Upload failed");
      }
      const newFile = await res.json();
      setFiles((prev) => [newFile, ...prev]);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteFile(fileId: string) {
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`${BACKEND}/api/v1/athlete/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch { /* non-fatal */ }
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <LoadingScreen />;

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "Athlete";
  const upcomingWorkouts = workouts.filter((w) => w.status !== "completed").slice(0, 5);
  const completedWorkouts = workouts.filter((w) => w.status === "completed");
  const initials = (profile?.full_name ?? "A").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh" }}>

      {/* Nav */}
      <nav
        style={{
          background: "var(--linen)",
          borderBottom: "1px solid var(--rule)",
          padding: "0 1.5rem",
          height: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="ca-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
            <span>C</span>
          </div>
          <span
            className="ca-display"
            style={{ fontSize: 16, color: "var(--ink)", letterSpacing: "-0.01em" }}
          >
            Andes<span style={{ color: "var(--terracotta-deep)" }}>.</span>IA
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="ca-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
            <span>{initials}</span>
          </div>
          <span
            className="ca-mono"
            style={{ fontSize: 11, color: "var(--ink-soft)" }}
          >
            {profile?.full_name ?? ""}
          </span>
          <button
            onClick={handleSignOut}
            className="ca-btn ca-btn-ghost"
            style={{ padding: "4px 10px", fontSize: 11 }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Welcome */}
        <div style={{ marginBottom: "1.75rem" }}>
          <h1
            className="ca-display"
            style={{ fontSize: 28, color: "var(--ink)", margin: "0 0 6px" }}
          >
            Hi {firstName} 👋
          </h1>
          <p className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>
            {profile?.target_event_name
              ? `Training for ${profile.target_event_name}${profile.target_event_date ? ` · ${formatDate(profile.target_event_date)}` : ""}`
              : "Welcome to your training dashboard"}
          </p>
        </div>

        {/* AI Profile card */}
        {profile?.ai_profile_summary && (
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "var(--aegean-wash)",
              border: "1px solid var(--aegean-soft)",
              borderLeft: "3px solid var(--aegean-deep)",
              borderRadius: 2,
              marginBottom: "1.5rem",
            }}
          >
            <p className="ca-eyebrow ca-eyebrow-aegean" style={{ fontSize: 9.5, marginBottom: 8 }}>
              ⚡ Your AI profile
            </p>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-soft)",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {profile.ai_profile_summary}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--rule)",
            marginBottom: "1.25rem",
          }}
        >
          {(["plan", "files"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`ca-tab${activeTab === t ? " active" : ""}`}
            >
              {t === "plan" ? "Training plan" : "My files"}
            </button>
          ))}
        </div>

        {/* Training plan tab */}
        {activeTab === "plan" && (
          <>
            {upcomingWorkouts.length === 0 && completedWorkouts.length === 0 ? (
              <div
                className="ca-panel"
                style={{ padding: "2.5rem", textAlign: "center" }}
              >
                <p style={{ fontSize: 32, margin: "0 0 12px" }}>🏃</p>
                <p
                  className="ca-display"
                  style={{ fontSize: 18, color: "var(--ink)", margin: "0 0 8px" }}
                >
                  No workouts yet
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    margin: 0,
                    maxWidth: 320,
                    marginInline: "auto",
                    lineHeight: 1.6,
                  }}
                >
                  Your coach is setting up your first training plan. You&apos;ll see it here once it&apos;s ready.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {upcomingWorkouts.length > 0 && (
                  <div className="ca-panel" style={{ padding: "1.125rem 1.25rem" }}>
                    <p className="ca-eyebrow" style={{ fontSize: 10, marginBottom: "0.875rem" }}>
                      Upcoming sessions
                    </p>
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {upcomingWorkouts.map((w) => (
                        <WorkoutCard key={w.id} w={w} />
                      ))}
                    </div>
                  </div>
                )}

                {completedWorkouts.length > 0 && (
                  <div className="ca-panel" style={{ padding: "1.125rem 1.25rem" }}>
                    <p className="ca-eyebrow" style={{ fontSize: 10, marginBottom: "0.875rem" }}>
                      Completed ({completedWorkouts.length})
                    </p>
                    <div style={{ display: "grid", gap: "0.375rem" }}>
                      {completedWorkouts.map((w) => (
                        <WorkoutCard key={w.id} w={w} compact />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Files tab */}
        {activeTab === "files" && (
          <div className="ca-panel" style={{ padding: "1.125rem 1.25rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.875rem",
              }}
            >
              <p className="ca-eyebrow" style={{ fontSize: 10, margin: 0 }}>
                My files
              </p>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  background: uploading ? "var(--linen-deep)" : "var(--aegean-deep)",
                  border: `1px solid ${uploading ? "var(--rule)" : "var(--aegean-deep)"}`,
                  borderRadius: 2,
                  color: uploading ? "var(--ink-mute)" : "oklch(0.97 0.01 190)",
                  fontSize: 12,
                  fontFamily: "var(--body)",
                  fontWeight: 500,
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "all 140ms",
                }}
              >
                {uploading ? "Uploading…" : "+ Upload file"}
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {uploadError && (
              <div
                style={{
                  padding: "0.625rem 0.875rem",
                  background: "var(--terracotta-soft)",
                  border: "1px solid oklch(0.75 0.10 45)",
                  borderRadius: 2,
                  fontSize: 12,
                  color: "var(--terracotta-deep)",
                  marginBottom: "0.75rem",
                }}
              >
                {uploadError}
              </div>
            )}

            <p
              className="ca-mono"
              style={{ fontSize: 10, color: "var(--ink-mute)", margin: "0 0 1rem" }}
            >
              PDF · TXT · MD · CSV · max 50 MB — visible to your coach
            </p>

            {files.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--ink-mute)" }}>
                <p style={{ fontSize: 28, margin: "0 0 8px" }}>📁</p>
                <p className="ca-mono" style={{ fontSize: 11 }}>No files uploaded yet</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {files.map((f) => (
                  <FileRow key={f.id} f={f} onDelete={handleDeleteFile} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="ca-ornament" style={{ marginTop: "2.5rem", paddingBottom: "1rem" }}>
          · · ·
        </div>
      </main>
    </div>
  );
}
