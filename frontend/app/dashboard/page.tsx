import { createClient } from "@supabase/supabase-js";
import { SuggestionQueue } from "@/components/suggestion-queue";
import { AthleteRoster } from "@/components/athlete-roster";
import type { Athlete, Suggestion } from "@/app/lib/types";

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [athletesRes, suggestionsRes] = await Promise.all([
    supabase.rpc("get_athlete_summary").then(() =>
      supabase
        .from("athletes")
        .select(`
          id, full_name, phone_number, organization_id, coach_id,
          stable_profile, current_state, created_at
        `)
        .order("created_at", { ascending: false })
    ),
    supabase
      .from("suggestions")
      .select(`
        id, athlete_id, athlete_display_name, suggestion_text,
        status, coach_reply, created_at, updated_at,
        athlete_checkins!inner(message_text)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Fallback: plain athletes query if rpc fails
  const athletes: Athlete[] = (
    await supabase
      .from("athletes")
      .select("id, full_name, phone_number, organization_id, coach_id, stable_profile, current_state, created_at")
      .order("created_at", { ascending: false })
  ).data ?? [];

  // Enrich athletes with counts
  const enriched = await Promise.all(
    athletes.map(async (a) => {
      const [pendingRes, checkinRes, lastCheckinRes] = await Promise.all([
        supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("athlete_id", a.id).eq("status", "pending"),
        supabase.from("athlete_checkins").select("id", { count: "exact", head: true }).eq("athlete_id", a.id),
        supabase.from("athlete_checkins").select("created_at").eq("athlete_id", a.id).order("created_at", { ascending: false }).limit(1),
      ]);
      return {
        ...a,
        pending_suggestions: pendingRes.count ?? 0,
        total_checkins: checkinRes.count ?? 0,
        last_checkin_at: lastCheckinRes.data?.[0]?.created_at ?? null,
      };
    })
  );

  // Flatten suggestions with athlete message
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

  return { athletes: enriched, suggestions };
}

export default async function DashboardPage() {
  const { athletes, suggestions } = await getData();

  const totalPending = suggestions.length;
  const activeAthletes = athletes.filter((a) => a.total_checkins && a.total_checkins > 0).length;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface/75 px-6 py-5 shadow-panel backdrop-blur">
        <div>
          <p className="text-sm font-medium text-sky-300">Coach.AI</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Coach Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">Live from Supabase · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-emerald-300">● Live</div>
          <div className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">{athletes.length} athletes</div>
        </div>
      </header>

      {/* KPI strip */}
      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Pending approvals", value: totalPending, color: totalPending > 0 ? "text-amber-300" : "text-emerald-300" },
          { label: "Active athletes", value: activeAthletes, color: "text-sky-300" },
          { label: "Total athletes", value: athletes.length, color: "text-white" },
          { label: "Check-ins total", value: athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0), color: "text-slate-300" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-line bg-surface/90 p-5 shadow-panel backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">{kpi.label}</p>
            <p className={`mt-2 text-4xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </section>

      {/* Main content */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SuggestionQueue suggestions={suggestions} />
        <AthleteRoster athletes={athletes} />
      </div>
    </main>
  );
}
