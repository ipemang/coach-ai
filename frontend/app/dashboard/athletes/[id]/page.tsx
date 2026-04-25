import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Athlete, Suggestion, Workout, CheckIn } from "@/app/lib/types";
import { AthleteSuggestions } from "@/components/athlete-suggestions";
import { AthleteWeeklyPlan } from "@/components/athlete-weekly-plan";
import { AthleteSidebar } from "@/components/athlete-sidebar";
import { AthleteHistory } from "@/components/athlete-history";
import { ResendPlanButton } from "@/components/resend-plan-button";
import { SessionNotePanel } from "@/components/session-note-panel";
import Link from "next/link";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

  const [athleteRes, suggestionsRes, workoutsRes, checkinsRes] = await Promise.all([
    supabase
      .from("athletes")
      .select("id, full_name, phone_number, organization_id, coach_id, stable_profile, current_state, created_at")
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
  ]);

  if (athleteRes.error || !athleteRes.data) return null;

  const athlete = athleteRes.data as Athlete;
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

  const { athlete, suggestions, workouts, checkins, weekStart, weekEnd } = data;
  const pending = suggestions.filter((s) => s.status === "pending");
  const cs = (athlete.current_state ?? {}) as Record<string, unknown>;
  const sp = (athlete.stable_profile ?? {}) as Record<string, unknown>;
  const targetRace = sp.target_race as string | undefined;
  const raceDate = sp.race_date as string | undefined;

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
            {/* COA-106: Session notes */}
            <SessionNotePanel athleteId={id} />
          </div>

          {/* Right — sidebar */}
          <AthleteSidebar
            athlete={athlete}
            readiness={readiness}
            hrv={hrv}
            sleep={sleep}
            ouraDate={ouraDate}
            hasOura={hasOura}
          />
        </div>

        {/* Footer ornament */}
        <div className="ca-ornament" style={{ marginTop: "3rem", paddingBottom: "1rem" }}>
          · · ·
        </div>
      </div>
    </main>
  );
}
