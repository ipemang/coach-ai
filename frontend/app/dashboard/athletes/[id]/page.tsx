import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Athlete, Suggestion, Workout, CheckIn } from "@/app/lib/types";
import { AthleteSuggestions } from "@/components/athlete-suggestions";
import { AthleteWeeklyPlan } from "@/components/athlete-weekly-plan";
import { AthleteSidebar } from "@/components/athlete-sidebar";
import { AthleteHistory } from "@/components/athlete-history";
import { ResendPlanButton } from "@/components/resend-plan-button";
import { SessionNotePanel } from "@/components/session-note-panel";
import { AthleteDocumentVault } from "@/components/athlete-document-vault";
import { TrainingLoadChart } from "@/components/training-load-chart";
import { AthleteReportsPanel } from "@/components/athlete-reports-panel";
import Link from "next/link";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── COA-120: Snapshot types ───────────────────────────────────────────────────
interface SnapshotFile {
  id: string;
  original_filename: string;
  document_type: string | null;
  ai_summary: string | null;
  ai_categorized: boolean;
  size_bytes: number | null;
  created_at: string;
}

interface SnapshotMemoryEvent {
  id: string;
  event_type: string;
  content: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function memoryEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    whatsapp_athlete: "📱 WhatsApp",
    whatsapp_coach: "💬 Coach msg",
    voice_memo: "🎙️ Voice memo",
    workout_completed: "✅ Workout",
    coach_note: "📝 Note",
    onboarding: "🚀 Onboarding",
    other: "📌 Event",
  };
  return labels[eventType] ?? `📌 ${eventType}`;
}

async function getAthleteData(id: string) {
  const supabase = getSupabase();

  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const [athleteRes, suggestionsRes, workoutsRes, checkinsRes, filesRes, memoryRes] =
    await Promise.all([
      supabase
        .from("athletes")
        .select(
          "id, full_name, email, phone_number, organization_id, coach_id, " +
          "stable_profile, current_state, created_at, " +
          "ai_profile_summary, onboarding_complete, primary_sport, " +
          "target_event_name, target_event_date"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("suggestions")
        .select("id, athlete_id, athlete_display_name, suggestion_text, status, coach_reply, created_at, updated_at, athlete_checkins(message_text)")
        .eq("athlete_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("workouts")
        .select("*")
        .eq("athlete_id", id)
        .gte("scheduled_date", fmt(weekStart))
        .lte("scheduled_date", fmt(weekEnd))
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("athlete_checkins")
        .select("id, athlete_id, coach_id, phone_number, message_text, message_type, suggestion_id, processed, created_at")
        .eq("athlete_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      // COA-120: snapshot files
      supabase
        .from("athlete_files")
        .select("id, original_filename, document_type, ai_summary, ai_categorized, size_bytes, created_at")
        .eq("athlete_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
      // COA-120: snapshot memory events
      supabase
        .from("athlete_memory_events")
        .select("id, event_type, content, created_at")
        .eq("athlete_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (athleteRes.error || !athleteRes.data) return null;

  const athlete = athleteRes.data as unknown as Athlete & {
    email?: string;
    ai_profile_summary?: string;
    onboarding_complete?: boolean;
    primary_sport?: string;
    target_event_name?: string;
    target_event_date?: string;
  };
  const rawSuggestions = suggestionsRes.data ?? [];
  const suggestions: Suggestion[] = rawSuggestions.map((s: Record<string, unknown>) => ({
    id: s.id as string,
    athlete_id: s.athlete_id as string | null,
    athlete_display_name: s.athlete_display_name as string | null,
    suggestion_text: s.suggestion_text as string | null,
    status: s.status as Suggestion["status"],
    coach_reply: s.coach_reply as string | null,
    created_at: s.created_at as string,
    updated_at: s.updated_at as string,
    athlete_message: Array.isArray(s.athlete_checkins)
      ? (s.athlete_checkins[0] as Record<string, string> | undefined)?.message_text ?? null
      : null,
  }));

  return {
    athlete,
    suggestions,
    workouts: (workoutsRes.data ?? []) as Workout[],
    checkins: (checkinsRes.data ?? []) as CheckIn[],
    weekStart: fmt(weekStart),
    weekEnd: fmt(weekEnd),
    snapshotFiles: (filesRes.data ?? []) as SnapshotFile[],
    snapshotMemory: (memoryRes.data ?? []) as SnapshotMemoryEvent[],
  };
}

export default async function AthleteProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getAthleteData(id);
  if (!data) notFound();

  const {
    athlete,
    suggestions,
    workouts,
    checkins,
    weekStart,
    weekEnd,
    snapshotFiles,
    snapshotMemory,
  } = data;
  const pending = suggestions.filter((s) => s.status === "pending");
  const cs = (athlete.current_state ?? {}) as Record<string, unknown>;
  const sp = (athlete.stable_profile ?? {}) as Record<string, unknown>;
  const targetRace =
    (athlete.target_event_name as string | undefined) ??
    (sp.target_race as string | undefined);
  const raceDate =
    (athlete.target_event_date as string | undefined) ??
    (sp.race_date as string | undefined);

  const readiness = (cs.oura_readiness_score ?? cs.last_readiness_score) as number | undefined;
  const hrv = (cs.oura_avg_hrv ?? cs.last_hrv) as number | undefined;
  const sleep = (cs.oura_sleep_score ?? cs.last_sleep_score) as number | undefined;
  const ouraDate = cs.oura_sync_date as string | undefined;
  const hasOura = readiness !== undefined || hrv !== undefined;
  const hasStrava = !!(cs.strava_last_activity_type);

  const lastCheckin = checkins[0]?.created_at
    ? new Date(checkins[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "No check-ins";

  const initials = athlete.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const docTypeColors: Record<string, string> = {
    training_plan: "ca-chip-aegean",
    lab_result: "ca-chip-ochre",
    medical: "ca-chip-terra",
    race_result: "ca-chip-terra",
    other: "",
  };

  return (
    <main
      className="mosaic-bg"
      style={{ minHeight: "100vh", padding: "2rem 1.5rem" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Back link */}
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--aegean-deep)",
            fontSize: 13,
            fontFamily: "var(--mono)",
            letterSpacing: "0.06em",
            textDecoration: "none",
            marginBottom: "1.25rem",
            opacity: 0.8,
            transition: "opacity 160ms",
          }}
          onMouseOver={(e) => ((e.target as HTMLElement).style.opacity = "1")}
          onMouseOut={(e) => ((e.target as HTMLElement).style.opacity = "0.8")}
        >
          ← Dashboard
        </Link>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="ca-panel"
          style={{
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {/* Avatar */}
            <div
              className="ca-avatar"
              style={{ width: 52, height: 52, fontSize: 20 }}
            >
              <span>{initials}</span>
            </div>

            <div>
              <p className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 4 }}>
                Athlete Profile
              </p>
              <h1
                className="ca-display"
                style={{ fontSize: 28, color: "var(--ink)", margin: 0 }}
              >
                {athlete.full_name}
              </h1>
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--ink-mute)",
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                }}
              >
                <span>{athlete.phone_number ?? "No phone"}</span>
                <span style={{ color: "var(--rule)" }}>·</span>
                <span>Last check-in: {lastCheckin}</span>
                <span style={{ color: "var(--rule)" }}>·</span>
                <span>
                  Member since{" "}
                  {new Date(athlete.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {hasOura && (
              <span className="ca-chip ca-chip-ochre">💍 Oura</span>
            )}
            {hasStrava && (
              <span className="ca-chip ca-chip-terra">🚴 Strava</span>
            )}
            {pending.length > 0 && (
              <span className="ca-chip ca-chip-terra">
                ⚡ {pending.length} pending
              </span>
            )}
            {targetRace && (
              <span className="ca-chip">
                🏁 {targetRace}
                {raceDate ? ` · ${raceDate}` : ""}
              </span>
            )}
            {athlete.onboarding_complete && (
              <span className="ca-chip ca-chip-aegean">✓ Onboarded</span>
            )}
            <ResendPlanButton athleteId={id} />
          </div>
        </div>

        {/* ── AI Suggestions ─────────────────────────────────────── */}
        {pending.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <AthleteSuggestions suggestions={pending} athleteId={id} />
          </div>
        )}

        {/* ── Main layout ────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "1.5rem",
          }}
          className="athlete-grid"
        >
          <style>{`
            @media (min-width: 1024px) {
              .athlete-grid { grid-template-columns: 1fr 300px !important; }
            }
          `}</style>

          {/* Left — weekly plan + history */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <AthleteWeeklyPlan
              workouts={workouts}
              athleteId={id}
              coachId={athlete.coach_id}
              weekStart={weekStart}
              weekEnd={weekEnd}
            />
            <AthleteHistory checkins={checkins} suggestions={suggestions} />
            {/* COA-79: Training load chart */}
            <TrainingLoadChart athleteId={id} />
            {/* COA-106: Session notes */}
            <SessionNotePanel athleteId={id} />
            {/* COA-66: Document vault */}
            <AthleteDocumentVault athleteId={id} />
            {/* COA-118: Training reports */}
            <AthleteReportsPanel athleteId={id} />
          </div>

          {/* Right — sidebar stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <AthleteSidebar
              athlete={athlete}
              readiness={readiness}
              hrv={hrv}
              sleep={sleep}
              ouraDate={ouraDate}
              hasOura={hasOura}
            />

            {/* ── COA-120: AI Snapshot Panel ──────────────────────── */}
            <div className="ca-panel" style={{ padding: "1.25rem 1.5rem" }}>
              <p
                className="ca-eyebrow"
                style={{ marginBottom: "1rem", color: "var(--aegean-deep)" }}
              >
                AI Snapshot
              </p>

              {/* AI Profile Summary */}
              {athlete.ai_profile_summary ? (
                <div style={{ marginBottom: "1.25rem" }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      letterSpacing: "0.07em",
                      color: "var(--ink-mute)",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    AI Profile
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      lineHeight: 1.55,
                      fontStyle: "italic",
                    }}
                  >
                    {athlete.ai_profile_summary.length > 280
                      ? athlete.ai_profile_summary.slice(0, 280) + "…"
                      : athlete.ai_profile_summary}
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    marginBottom: "1.25rem",
                    padding: "0.75rem",
                    borderRadius: 6,
                    background: "var(--surface-tint, rgba(0,0,0,0.02))",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--ink-mute)",
                      fontFamily: "var(--mono)",
                      textAlign: "center",
                    }}
                  >
                    No AI profile yet
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--ink-mute)",
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    Generated after athlete completes onboarding
                  </p>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid var(--rule)",
                  paddingTop: "1rem",
                  marginBottom: "1.25rem",
                }}
              />

              {/* Memory Feed */}
              <div style={{ marginBottom: "1.25rem" }}>
                <p
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.07em",
                    color: "var(--ink-mute)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Memory Feed</span>
                  {snapshotMemory.length > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--ink-mute)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {snapshotMemory.length} events
                    </span>
                  )}
                </p>

                {snapshotMemory.length === 0 ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--ink-mute)",
                      fontFamily: "var(--mono)",
                      textAlign: "center",
                      padding: "0.5rem 0",
                    }}
                  >
                    No memory events yet
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {snapshotMemory.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "0.5rem 0.65rem",
                          borderRadius: 6,
                          background: "var(--surface-tint, rgba(0,0,0,0.02))",
                          borderLeft: "2px solid var(--rule)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 3,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--mono)",
                              color: "var(--aegean-deep)",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {memoryEventLabel(ev.event_type)}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--mono)",
                              color: "var(--ink-mute)",
                            }}
                          >
                            {new Date(ev.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: 12,
                            color: "var(--ink)",
                            lineHeight: 1.4,
                            margin: 0,
                          }}
                        >
                          {ev.content.length > 100
                            ? ev.content.slice(0, 100) + "…"
                            : ev.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Files */}
              {snapshotFiles.length > 0 && (
                <>
                  <div
                    style={{
                      borderTop: "1px solid var(--rule)",
                      paddingTop: "1rem",
                    }}
                  />

                  <div style={{ marginTop: "1rem" }}>
                    <p
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        letterSpacing: "0.07em",
                        color: "var(--ink-mute)",
                        textTransform: "uppercase",
                        marginBottom: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Uploaded Files</span>
                      <span style={{ fontSize: 10 }}>{snapshotFiles.length}</span>
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {snapshotFiles.map((f) => (
                        <div
                          key={f.id}
                          style={{
                            padding: "0.5rem 0.65rem",
                            borderRadius: 6,
                            background: "var(--surface-tint, rgba(0,0,0,0.02))",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 6,
                              marginBottom: f.ai_summary ? 4 : 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--ink)",
                                wordBreak: "break-word",
                                lineHeight: 1.35,
                                flex: 1,
                              }}
                            >
                              {f.original_filename}
                            </span>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                                gap: 3,
                                flexShrink: 0,
                              }}
                            >
                              {f.document_type && (
                                <span
                                  className={`ca-chip ${docTypeColors[f.document_type] ?? ""}`}
                                  style={{ fontSize: 9, padding: "1px 6px" }}
                                >
                                  {f.document_type.replace("_", " ")}
                                </span>
                              )}
                              {f.ai_categorized && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontFamily: "var(--mono)",
                                    color: "var(--aegean-deep)",
                                  }}
                                >
                                  ✦ AI
                                </span>
                              )}
                            </div>
                          </div>
                          {f.ai_summary && (
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--ink-mute)",
                                lineHeight: 1.4,
                                margin: 0,
                                fontStyle: "italic",
                              }}
                            >
                              {f.ai_summary.length > 90
                                ? f.ai_summary.slice(0, 90) + "…"
                                : f.ai_summary}
                            </p>
                          )}
                          {f.size_bytes && (
                            <p
                              style={{
                                fontSize: 10,
                                color: "var(--ink-mute)",
                                fontFamily: "var(--mono)",
                                margin: "3px 0 0",
                              }}
                            >
                              {formatBytes(f.size_bytes)} ·{" "}
                              {new Date(f.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* ── end AI Snapshot Panel ──────────────────────────── */}
          </div>
        </div>

        {/* Footer ornament */}
        <div className="ca-ornament" style={{ marginTop: "3rem", paddingBottom: "1rem" }}>
          · · ·
        </div>
      </div>
    </main>
  );
}
