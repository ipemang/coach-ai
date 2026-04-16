import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Athlete, Suggestion, Workout, CheckIn } from "@/app/lib/types";
import { AthleteSuggestions } from "@/components/athlete-suggestions";
import { AthleteWeeklyPlan } from "@/components/athlete-weekly-plan";
import { AthleteSidebar } from "@/components/athlete-sidebar";
import { AthleteHistory } from "@/components/athlete-history";
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

  const readiness = (cs.oura_readiness_score ?? cs.last_readiness_score) as number | undefined;
  const hrv = (cs.oura_avg_hrv ?? cs.last_hrv) as number | undefined;
  const sleep = (cs.oura_sleep_score ?? cs.last_sleep_score) as number | undefined;
  const ouraDate = cs.oura_sync_date as string | undefined;
  const hasOura = readiness !== undefined || hrv !== undefined;
  const hasStrava = !!(cs.strava_last_activity_type);

  const lastCheckin = checkins[0]?.created_at
    ? new Date(checkins[0].created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "No check-ins";

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back + Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
        >
          ← Dashboard
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-line bg-surface/75 px-6 py-5 shadow-panel backdrop-blur">
          <div>
            <p className="text-sm font-medium text-sky-300">Athlete Profile</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">{athlete.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>{athlete.phone_number ?? "No phone"}</span>
              <span>·</span>
              <span>Last check-in: {lastCheckin}</span>
              <span>·</span>
              <span>Member since {new Date(athlete.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {hasOura && (
              <span className="rounded-full bg-purple-500/15 px-3 py-1.5 text-purple-300">💍 Oura</span>
            )}
            {hasStrava && (
              <span className="rounded-full bg-orange-500/15 px-3 py-1.5 text-orange-300">🚴 Strava</span>
            )}
            {pending.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-amber-300">
                {pending.length} pending
              </span>
            )}
            {sp.target_race && (
              <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">
                🏁 {sp.target_race as string}
                {sp.race_date ? ` · ${sp.race_date as string}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI Suggestions — full width at top */}
      {pending.length > 0 && (
        <AthleteSuggestions suggestions={pending} athleteId={id} />
      )}

      {/* Main layout */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Left — weekly plan + history */}
        <div className="space-y-6">
          <AthleteWeeklyPlan
            workouts={workouts}
            athleteId={id}
            coachId={athlete.coach_id}
            weekStart={weekStart}
            weekEnd={weekEnd}
          />
          <AthleteHistory checkins={checkins} suggestions={suggestions} />
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
    </main>
  );
}
