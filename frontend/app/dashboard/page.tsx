import { createClient } from "@supabase/supabase-js";
import DashboardShell from "./DashboardShell";
import type { Athlete, Suggestion } from "@/app/lib/types";

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
