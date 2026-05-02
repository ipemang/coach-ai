import { createClient } from "@supabase/supabase-js";
import DashboardShell from "./DashboardShell";
import type { Athlete, Suggestion } from "@/app/lib/types";

// COA-101: 30-day biometric baseline per athlete
type BiometricBaseline = {
  readiness_avg: number | null;
  hrv_avg: number | null;
  sleep_avg: number | null;
};

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch athletes + pending suggestions
  const athletes: Athlete[] = (
    await supabase
      .from("athletes")
      .select(
        "id, full_name, phone_number, organization_id, coach_id, stable_profile, current_state, created_at",
      )
      .order("created_at", { ascending: false })
  ).data ?? [];

  // Fetch 7-day workouts for all athletes in a single batch query
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const athleteIds = athletes.map((a) => a.id);
  const { data: weekWorkouts } = await supabase
    .from("workouts")
    .select("athlete_id, scheduled_date, status, distance_km")
    .in("athlete_id", athleteIds)
    .gte("scheduled_date", sevenDaysAgoStr)
    .order("scheduled_date", { ascending: true });

  // Group workouts by athlete_id
  const workoutsByAthlete: Record<
    string,
    { scheduled_date: string; status: string; distance_km: number | null }[]
  > = {};
  for (const w of weekWorkouts ?? []) {
    const id = w.athlete_id as string;
    if (!workoutsByAthlete[id]) workoutsByAthlete[id] = [];
    workoutsByAthlete[id].push(w as { scheduled_date: string; status: string; distance_km: number | null });
  }

  // COA-101: Batch-fetch last 30 days of biometric snapshots for all athletes
  // NOTE: Must be computed BEFORE the enriched block so baselineByAthlete is defined.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: snapshots } = await supabase
    .from("biometric_snapshots")
    .select("athlete_id, readiness, hrv, sleep")
    .in("athlete_id", athleteIds)
    .gte("snapshot_date", thirtyDaysAgoStr);

  // Compute 30-day averages per athlete (need ≥3 days of data)
  const baselineByAthlete: Record<string, BiometricBaseline> = {};
  if (snapshots && snapshots.length > 0) {
    const grouped: Record<string, { readiness: number[]; hrv: number[]; sleep: number[] }> = {};
    for (const s of snapshots) {
      const id = s.athlete_id as string;
      if (!grouped[id]) grouped[id] = { readiness: [], hrv: [], sleep: [] };
      if (s.readiness != null) grouped[id].readiness.push(s.readiness as number);
      if (s.hrv != null) grouped[id].hrv.push(s.hrv as number);
      if (s.sleep != null) grouped[id].sleep.push(s.sleep as number);
    }
    for (const [id, vals] of Object.entries(grouped)) {
      const avg = (arr: number[]) => arr.length >= 3 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
      baselineByAthlete[id] = {
        readiness_avg: avg(vals.readiness),
        hrv_avg: avg(vals.hrv),
        sleep_avg: avg(vals.sleep),
      };
    }
  }

  // Enrich athletes with counts
  const enriched = await Promise.all(
    athletes.map(async (a) => {
      const [pendingRes, checkinRes, lastCheckinRes] = await Promise.all([
        supabase
          .from("suggestions")
          .select("id", { count: "exact", head: true })
          .eq("athlete_id", a.id)
          .eq("status", "pending"),
        supabase
          .from("athlete_checkins")
          .select("id", { count: "exact", head: true })
          .eq("athlete_id", a.id),
        supabase
          .from("athlete_checkins")
          .select("created_at")
          .eq("athlete_id", a.id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      return {
        ...a,
        pending_suggestions: pendingRes.count ?? 0,
        total_checkins: checkinRes.count ?? 0,
        last_checkin_at: lastCheckinRes.data?.[0]?.created_at ?? null,
        week_workouts: workoutsByAthlete[a.id] ?? [],
        biometric_baseline: baselineByAthlete[a.id] ?? null,
      };
    }),
  );

  // Fetch pending suggestions with athlete message
  const rawSuggestions = (
    await supabase
      .from("suggestions")
      .select(
        `id, athlete_id, athlete_display_name, suggestion_text,
         status, coach_reply, created_at, updated_at,
         athlete_checkins(message_text)`,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20)
  ).data ?? [];

  const suggestions: Suggestion[] = rawSuggestions.map(
    (s: Record<string, unknown>) => ({
      id: s.id as string,
      athlete_id: s.athlete_id as string | null,
      athlete_display_name: s.athlete_display_name as string | null,
      suggestion_text: s.suggestion_text as string | null,
      status: s.status as Suggestion["status"],
      coach_reply: s.coach_reply as string | null,
      created_at: s.created_at as string,
      updated_at: s.updated_at as string,
      athlete_message: Array.isArray(s.athlete_checkins)
        ? (
            s.athlete_checkins[0] as Record<string, string> | undefined
          )?.message_text ?? null
        : null,
    }),
  );

  return { athletes: enriched, suggestions };
}

export default async function DashboardPage() {
  const { athletes, suggestions } = await getData();
  return <DashboardShell athletes={athletes} suggestions={suggestions} />;
}
