"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "https://coach-ai-production-a5aa.up.railway.app";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  athlete_id: string;
  full_name: string;
  target_race: string | null;
  race_date: string | null;
  strava_connected: boolean;
  oura_connected: boolean;
  readiness: number | null;
  hrv: number | null;
}

interface Workout {
  id: string;
  scheduled_date: string;
  session_type: string;
  title: string | null;
  duration_min: number | null;
  distance_km: number | null;
  hr_zone: string | null;
  target_pace: string | null;
  coaching_notes: string | null;
  status: string;
  display_status: "completed" | "missed" | "today" | "upcoming";
  day_label: string;
  is_today: boolean;
}

interface PlanData {
  week_start: string;
  week_end: string;
  workouts: Workout[];
  summary: { total_planned_min: number; total_completed_min: number; completion_pct: number };
}

interface Message {
  id: string;
  athlete_message: string | null;
  coach_reply: string;
  created_at: string;
}

interface CheckIn {
  id: string;
  message_text: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-400/10 text-emerald-300",
  missed:    "bg-red-400/10 text-red-300",
  today:     "bg-sky-400/20 text-sky-300 ring-1 ring-sky-400/40",
  upcoming:  "bg-white/5 text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Done",
  missed:    "Missed",
  today:     "Today",
  upcoming:  "Upcoming",
};

const SESSION_ICON: Record<string, string> = {
  run: "🏃",
  bike: "🚴",
  swim: "🏊",
  strength: "🏋️",
  rest: "😴",
  brick: "⚡",
};

function sessionIcon(type: string) {
  const key = type.toLowerCase();
  for (const [k, v] of Object.entries(SESSION_ICON)) {
    if (key.includes(k)) return v;
  }
  return "🎯";
}

// ── Workout Log Modal ─────────────────────────────────────────────────────────

function WorkoutLogModal({
  workout,
  token,
  onClose,
  onDone,
}: {
  workout: Workout;
  token: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState("");
  const [actualDur, setActualDur] = useState(workout.duration_min?.toString() || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(completed: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BACKEND}/athlete/workout/${workout.id}/complete?token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completed,
            actual_duration_min: actualDur ? parseInt(actualDur) : null,
            rpe: completed ? rpe : null,
            athlete_notes: notes || null,
          }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f1117] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Log workout</p>
            <p className="text-lg font-semibold text-white mt-0.5">
              {sessionIcon(workout.session_type)} {workout.session_type}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Actual duration (min)</label>
            <input
              type="number"
              value={actualDur}
              onChange={(e) => setActualDur(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500/50"
              placeholder={workout.duration_min?.toString() || "60"}
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-2 block">How hard was it? RPE {rpe}/10</label>
            <input
              type="range" min={1} max={10} value={rpe}
              onChange={(e) => setRpe(parseInt(e.target.value))}
              className="w-full accent-sky-400"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>Easy</span><span>Max effort</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Notes for your coach (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500/50 resize-none"
              placeholder="How did it feel? Any issues?"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => submit(true)}
            disabled={loading}
            className="flex-1 rounded-2xl bg-emerald-500/20 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 transition"
          >
            {loading ? "Saving…" : "✓ Mark complete"}
          </button>
          <button
            onClick={() => submit(false)}
            disabled={loading}
            className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400 hover:bg-white/10 disabled:opacity-40 transition"
          >
            Missed
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Check-in Form ─────────────────────────────────────────────────────────────

function CheckInForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [readiness, setReadiness] = useState(7);
  const [soreness, setSoreness] = useState(3);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/athlete/checkin?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readiness, soreness, notes: notes || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess(true);
      setTimeout(onDone, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center">
        <p className="text-2xl mb-2">✓</p>
        <p className="text-sm font-semibold text-emerald-300">Check-in sent to your coach!</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 space-y-5">
      <p className="text-sm font-semibold text-white">Daily check-in</p>

      <div>
        <label className="text-xs text-slate-500 mb-2 block">How are you feeling today? {readiness}/10</label>
        <input type="range" min={1} max={10} value={readiness}
          onChange={(e) => setReadiness(parseInt(e.target.value))}
          className="w-full accent-sky-400" />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>Terrible</span><span>Amazing</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 mb-2 block">Soreness level {soreness}/10</label>
        <input type="range" min={1} max={10} value={soreness}
          onChange={(e) => setSoreness(parseInt(e.target.value))}
          className="w-full accent-amber-400" />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>None</span><span>Very sore</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 mb-1 block">Anything else? (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-500/50 resize-none"
          placeholder="Sleep issues, niggles, motivation…"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={submit}
        disabled={loading}
        className="w-full rounded-2xl bg-sky-500/20 py-3 text-sm font-semibold text-sky-300 hover:bg-sky-500/30 disabled:opacity-40 transition"
      >
        {loading ? "Sending…" : "Send to coach"}
      </button>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function AthletePlanClient() {
  const params = useSearchParams();
  const token = params.get("token");

  const [tab, setTab] = useState<"plan" | "checkin" | "messages">("plan");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loggingWorkout, setLoggingWorkout] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, planRes, messagesRes, checkinsRes] = await Promise.all([
        fetch(`${BACKEND}/athlete/profile?token=${token}`),
        fetch(`${BACKEND}/athlete/plan?token=${token}`),
        fetch(`${BACKEND}/athlete/messages?token=${token}`),
        fetch(`${BACKEND}/athlete/checkins?token=${token}`),
      ]);

      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({}));
        throw new Error(err.detail || "Invalid or expired link");
      }

      setProfile(await profileRes.json());
      if (planRes.ok) setPlan(await planRes.json());
      if (messagesRes.ok) setMessages((await messagesRes.json()).messages || []);
      if (checkinsRes.ok) setCheckins((await checkinsRes.json()).checkins || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your plan");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0a0c12] flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🔗</p>
          <p className="text-white font-semibold">No access link found</p>
          <p className="text-slate-400 text-sm mt-2">Ask your coach to resend your plan link.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c12] flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading your plan…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0c12] flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-white font-semibold">{error}</p>
          <p className="text-slate-400 text-sm mt-2">Ask your coach to resend your plan link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c12] text-white max-w-lg mx-auto">
      {loggingWorkout && (
        <WorkoutLogModal
          workout={loggingWorkout}
          token={token}
          onClose={() => setLoggingWorkout(null)}
          onDone={() => { setLoggingWorkout(null); fetchAll(); }}
        />
      )}

      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <p className="text-xs text-slate-500 uppercase tracking-widest">Coach.AI</p>
        <h1 className="text-2xl font-bold text-white mt-1">{profile?.full_name}</h1>
        {profile?.target_race && (
          <p className="text-sm text-slate-400 mt-1">
            🎯 {profile.target_race}
            {profile.race_date ? ` · ${profile.race_date}` : ""}
          </p>
        )}

        {/* Quick stats */}
        <div className="flex gap-3 mt-4">
          {profile?.readiness != null && (
            <div className="flex-1 rounded-2xl bg-white/5 px-3 py-2.5 text-center">
              <p className="text-xs text-slate-500">Readiness</p>
              <p className="text-lg font-bold text-sky-300">{profile.readiness}</p>
            </div>
          )}
          {plan && (
            <div className="flex-1 rounded-2xl bg-white/5 px-3 py-2.5 text-center">
              <p className="text-xs text-slate-500">Week done</p>
              <p className="text-lg font-bold text-emerald-300">{plan.summary.completion_pct}%</p>
            </div>
          )}
          <div className="flex-1 rounded-2xl bg-white/5 px-3 py-2.5 text-center">
            <p className="text-xs text-slate-500">Strava</p>
            <p className="text-lg">{profile?.strava_connected ? "✓" : "—"}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/8 px-5">
        {(["plan", "checkin", "messages"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              tab === t
                ? "border-sky-400 text-sky-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "plan" ? "Training" : t === "checkin" ? "Check In" : "Messages"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-5 py-5 space-y-4 pb-24">

        {/* ── PLAN TAB ── */}
        {tab === "plan" && (
          <>
            {plan && (
              <p className="text-xs text-slate-500">
                Week of {new Date(plan.week_start + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" — "}
                {plan.summary.total_completed_min}min of {plan.summary.total_planned_min}min planned
              </p>
            )}

            {(!plan || plan.workouts.length === 0) && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-slate-400 text-sm">No workouts scheduled this week yet.</p>
                <p className="text-slate-500 text-xs mt-1">Your coach will add them soon.</p>
              </div>
            )}

            {plan?.workouts.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  if (w.display_status !== "completed") setLoggingWorkout(w);
                }}
                className={`w-full text-left rounded-2xl border p-4 transition ${
                  w.is_today
                    ? "border-sky-400/30 bg-sky-400/5"
                    : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]"
                } ${w.display_status === "completed" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{sessionIcon(w.session_type)}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {w.title || w.session_type}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {w.day_label}
                        {w.duration_min ? ` · ${w.duration_min}min` : ""}
                        {w.distance_km ? ` · ${w.distance_km}km` : ""}
                        {w.hr_zone ? ` · Zone ${w.hr_zone}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[w.display_status]}`}>
                    {STATUS_LABEL[w.display_status]}
                  </span>
                </div>
                {w.coaching_notes && (
                  <p className="mt-2 text-xs text-slate-400 border-t border-white/5 pt-2">
                    💬 {w.coaching_notes}
                  </p>
                )}
                {w.display_status !== "completed" && (
                  <p className="mt-2 text-xs text-sky-400/70">Tap to log →</p>
                )}
              </button>
            ))}
          </>
        )}

        {/* ── CHECK IN TAB ── */}
        {tab === "checkin" && (
          <>
            <CheckInForm token={token} onDone={fetchAll} />

            {checkins.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase tracking-widest">Recent check-ins</p>
                {checkins.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                    <p className="text-sm text-slate-300">{c.message_text}</p>
                    <p className="text-xs text-slate-600 mt-1">{timeAgo(c.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── MESSAGES TAB ── */}
        {tab === "messages" && (
          <>
            {messages.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">💬</p>
                <p className="text-slate-400 text-sm">No messages yet.</p>
                <p className="text-slate-500 text-xs mt-1">Send a check-in and your coach will reply here.</p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                {m.athlete_message && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-sky-500/20 px-4 py-3">
                      <p className="text-sm text-sky-100">{m.athlete_message}</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/8 px-4 py-3">
                    <p className="text-sm text-slate-200">{m.coach_reply}</p>
                    <p className="text-xs text-slate-500 mt-1">{timeAgo(m.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
