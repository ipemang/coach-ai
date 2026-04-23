"use client";

/**
 * COA-98: Athlete dashboard.
 *
 * Replaces /my-plan for athletes with a Supabase Auth account.
 * Shows: AI profile summary, current training plan, recent check-ins, uploaded files.
 *
 * Auth: requires athlete Supabase session with athlete_id in JWT.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

const S = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#fff",
  } as React.CSSProperties,
  nav: {
    background: "#1a1d2e",
    borderBottom: "1px solid #2a2d3e",
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "56px",
  } as React.CSSProperties,
  main: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "32px 24px",
  } as React.CSSProperties,
  card: {
    background: "#1a1d2e",
    border: "1px solid #2a2d3e",
    borderRadius: "14px",
    padding: "24px",
    marginBottom: "20px",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#4b5563",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: "16px",
  } as React.CSSProperties,
};

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

const WORKOUT_TYPE_COLORS: Record<string, string> = {
  run: "#4ade80",
  bike: "#60a5fa",
  swim: "#a78bfa",
  strength: "#fbbf24",
  brick: "#f97316",
  rest: "#6b7280",
};

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

      // Check onboarding
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

      // Load athlete profile from Supabase directly
      const athleteId = (() => {
        try {
          const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
          return JSON.parse(window.atob(b64 + "==".slice((b64.length % 4) || 4))).athlete_id as string;
        } catch { return null; }
      })();

      if (!athleteId) {
        router.replace("/athlete/onboarding");
        return;
      }

      const sb = createBrowserSupabase();

      // Parallel fetches
      const [athleteRes, workoutsRes, filesRes] = await Promise.allSettled([
        sb.from("athletes").select("id, full_name, email, primary_sport, fitness_level, ai_profile_summary, target_event_name, target_event_date, goal_description, onboarding_complete").eq("id", athleteId).single(),
        sb.from("workouts").select("id, title, description, scheduled_date, workout_type, status, duration_minutes").eq("athlete_id", athleteId).order("scheduled_date", { ascending: true }).limit(10),
        fetch(`${BACKEND}/api/v1/athlete/files`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (athleteRes.status === "fulfilled" && athleteRes.value.data) {
        setProfile(athleteRes.value.data as AthleteProfile);
      }
      if (workoutsRes.status === "fulfilled" && workoutsRes.value.data) {
        setWorkouts(workoutsRes.value.data as Workout[]);
      }
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

    setUploading(true);
    setUploadError(null);

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
      await fetch(`${BACKEND}/api/v1/athlete/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch { /* non-fatal */ }
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px",
          }}>⚡</div>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "Athlete";
  const upcomingWorkouts = workouts.filter((w) => w.status !== "completed").slice(0, 5);
  const completedWorkouts = workouts.filter((w) => w.status === "completed");

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", flexShrink: 0,
          }}>⚡</div>
          <span style={{ fontWeight: 700, fontSize: "15px" }}>Coach.AI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#6b7280", fontSize: "13px" }}>
            {profile?.full_name ?? ""}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              background: "none", border: "1px solid #2a2d3e",
              borderRadius: "6px", padding: "5px 12px",
              color: "#6b7280", fontSize: "12px", cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main style={S.main}>
        {/* Welcome */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px" }}>
            Hi {firstName} 👋
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>
            {profile?.target_event_name
              ? `Training for ${profile.target_event_name}${profile.target_event_date ? ` · ${formatDate(profile.target_event_date)}` : ""}`
              : "Welcome to your training dashboard"}
          </p>
        </div>

        {/* AI Profile card */}
        {profile?.ai_profile_summary && (
          <div style={{
            ...S.card,
            background: "rgba(79,70,229,0.08)",
            border: "1px solid rgba(79,70,229,0.25)",
          }}>
            <p style={{ ...S.sectionTitle, color: "#6c63ff" }}>⚡ Your AI profile</p>
            <p style={{ color: "#c4c9d4", fontSize: "14px", lineHeight: 1.7, margin: 0 }}>
              {profile.ai_profile_summary}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
          {(["plan", "files"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                background: activeTab === tab ? "rgba(108,99,255,0.15)" : "transparent",
                color: activeTab === tab ? "#a5b4fc" : "#4b5563",
              }}
            >
              {tab === "plan" ? "Training plan" : "My files"}
            </button>
          ))}
        </div>

        {/* Training plan tab */}
        {activeTab === "plan" && (
          <>
            {upcomingWorkouts.length === 0 && completedWorkouts.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: "40px" }}>
                <p style={{ fontSize: "32px", margin: "0 0 12px" }}>🏃</p>
                <p style={{ color: "#fff", fontSize: "16px", fontWeight: 600, margin: "0 0 8px" }}>
                  No workouts yet
                </p>
                <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
                  Your coach is setting up your first training plan. You&apos;ll see it here once it&apos;s ready.
                </p>
              </div>
            ) : (
              <>
                {upcomingWorkouts.length > 0 && (
                  <div style={S.card}>
                    <p style={S.sectionTitle}>Upcoming sessions</p>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {upcomingWorkouts.map((w) => {
                        const typeColor = WORKOUT_TYPE_COLORS[w.workout_type?.toLowerCase() ?? ""] ?? "#6b7280";
                        return (
                          <div key={w.id} style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "14px",
                            padding: "14px",
                            background: "#0f1117",
                            borderRadius: "10px",
                            border: "1px solid #1e2235",
                          }}>
                            <div style={{
                              width: "36px", height: "36px", borderRadius: "8px",
                              background: `${typeColor}18`,
                              border: `1px solid ${typeColor}40`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "16px", flexShrink: 0,
                            }}>
                              {w.workout_type === "run" ? "🏃" : w.workout_type === "bike" ? "🚴" : w.workout_type === "swim" ? "🏊" : "💪"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                                <span style={{ fontWeight: 600, fontSize: "14px" }}>{w.title}</span>
                                <span style={{ color: "#4b5563", fontSize: "12px", flexShrink: 0, marginLeft: "8px" }}>
                                  {formatDate(w.scheduled_date)}
                                </span>
                              </div>
                              {w.description && (
                                <p style={{ color: "#6b7280", fontSize: "13px", margin: 0, lineHeight: 1.5, whiteSpace: "pre-line" }}>
                                  {w.description.length > 120 ? w.description.slice(0, 120) + "…" : w.description}
                                </p>
                              )}
                              {w.duration_minutes && (
                                <span style={{ color: typeColor, fontSize: "12px", marginTop: "4px", display: "block" }}>
                                  {w.duration_minutes} min
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {completedWorkouts.length > 0 && (
                  <div style={S.card}>
                    <p style={S.sectionTitle}>Completed ({completedWorkouts.length})</p>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {completedWorkouts.map((w) => (
                        <div key={w.id} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 14px",
                          background: "#0f1117", borderRadius: "8px",
                          border: "1px solid #1e2235",
                          opacity: 0.7,
                        }}>
                          <span style={{ fontSize: "13px", color: "#6b7280" }}>
                            ✓ {w.title}
                          </span>
                          <span style={{ fontSize: "12px", color: "#374151" }}>{formatDate(w.scheduled_date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Files tab */}
        {activeTab === "files" && (
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <p style={{ ...S.sectionTitle, marginBottom: 0 }}>My files</p>
              <label style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                background: uploading ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: uploading ? "not-allowed" : "pointer",
              }}>
                {uploading ? "Uploading…" : "＋ Upload file"}
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
              <div style={{
                background: "#3b1219", color: "#f87171",
                border: "1px solid #7f1d1d",
                borderRadius: "8px", padding: "10px 14px",
                fontSize: "13px", marginBottom: "12px",
              }}>
                {uploadError}
              </div>
            )}

            <p style={{ color: "#4b5563", fontSize: "12px", margin: "0 0 16px" }}>
              Upload training logs, medical docs, race history, or anything else relevant to your coaching. Supported: PDF, TXT, MD, CSV (max 50 MB).
            </p>

            {files.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#4b5563" }}>
                <p style={{ fontSize: "28px", margin: "0 0 8px" }}>📁</p>
                <p style={{ fontSize: "13px", margin: 0 }}>No files uploaded yet</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {files.map((f) => (
                  <div key={f.id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    background: "#0f1117",
                    borderRadius: "10px",
                    border: "1px solid #1e2235",
                  }}>
                    <span style={{ fontSize: "20px", flexShrink: 0 }}>
                      {f.file_type === "pdf" ? "📄" : f.file_type === "csv" ? "📊" : "📝"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "13px", fontWeight: 500, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.original_filename}
                      </p>
                      <p style={{ fontSize: "11px", color: "#4b5563", margin: 0 }}>
                        {formatBytes(f.size_bytes)} · {formatDate(f.created_at)}
                        {f.status === "processed" && " · ✓ Indexed"}
                        {f.status === "pending" && " · Indexing…"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(f.id)}
                      style={{
                        background: "none", border: "none",
                        color: "#374151", cursor: "pointer",
                        fontSize: "16px", padding: "4px",
                        flexShrink: 0,
                      }}
                      title="Delete file"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
