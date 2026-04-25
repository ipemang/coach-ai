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

// ── Types: calendar ──────────────────────────────────────────────────────────

interface CalendarWorkout {
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
  is_today: boolean;
}

interface CalendarData {
  month: string;
  workouts: CalendarWorkout[];
  race_date: string | null;
  race_name: string | null;
  today: string;
}

// ── Training Calendar Component ───────────────────────────────────────────────

function TrainingCalendar({
  token,
}: {
  token: string;
}) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<CalendarWorkout | null>(null);

  const monthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`${BACKEND}/athlete/calendar?token=${encodeURIComponent(token)}&month=${monthKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, monthKey]);

  // Build calendar grid
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Build date → workout lookup
  const workoutsByDate: Record<string, CalendarWorkout[]> = {};
  for (const w of (data?.workouts ?? [])) {
    if (!workoutsByDate[w.scheduled_date]) workoutsByDate[w.scheduled_date] = [];
    workoutsByDate[w.scheduled_date].push(w);
  }

  const raceDateStr = data?.race_date ?? null;

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const dotColor = (status: string) => {
    if (status === "completed") return "#34d399"; // emerald
    if (status === "missed") return "#f87171";    // red
    if (status === "today") return "#38bdf8";     // sky
    return "#64748b";                             // slate/upcoming
  };

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Grid cells: blank preamble + day cells
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          onClick={prevMonth}
          style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
        >
          ‹
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{monthLabel}</span>
          {monthKey !== `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` && (
            <button
              onClick={goToday}
              style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 6, padding: "2px 8px", color: "#38bdf8", fontSize: 11, cursor: "pointer" }}
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={nextMonth}
          style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: "#64748b", paddingBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#64748b", fontSize: 13 }}>
          Loading…
        </div>
      )}

      {/* Calendar grid */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {cells.map((day, idx) => {
            if (!day) {
              return <div key={`blank-${idx}`} style={{ aspectRatio: "1", borderRadius: 6 }} />;
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const isRaceDay = dateStr === raceDateStr;
            const dayWorkouts = workoutsByDate[dateStr] ?? [];

            return (
              <button
                key={dateStr}
                onClick={() => {
                  if (dayWorkouts.length > 0) {
                    setSelectedWorkout(dayWorkouts[0]);
                  } else if (isRaceDay) {
                    // Show race info via selectedWorkout=null but day = race pin
                    setSelectedWorkout(null);
                  }
                }}
                style={{
                  aspectRatio: "1",
                  borderRadius: 6,
                  border: isToday ? "1px solid rgba(56,189,248,0.5)" : "1px solid transparent",
                  background: isToday
                    ? "rgba(56,189,248,0.08)"
                    : isRaceDay
                    ? "rgba(250,204,21,0.08)"
                    : dayWorkouts.length > 0
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.02)",
                  cursor: dayWorkouts.length > 0 || isRaceDay ? "pointer" : "default",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 2px",
                  position: "relative",
                  transition: "background 0.1s",
                }}
              >
                <span style={{ fontSize: 11, color: isToday ? "#38bdf8" : isRaceDay ? "#fbbf24" : "#94a3b8", fontWeight: isToday ? 700 : 400 }}>
                  {day}
                </span>
                {/* Race pin */}
                {isRaceDay && (
                  <span style={{ fontSize: 10 }}>🏁</span>
                )}
                {/* Workout dots */}
                {!isRaceDay && dayWorkouts.length > 0 && (
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                    {dayWorkouts.slice(0, 3).map((w, wi) => (
                      <div
                        key={wi}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: dotColor(w.display_status),
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Race date callout */}
      {raceDateStr && (() => {
        const raceMonth = raceDateStr.slice(0, 7);
        if (raceMonth === monthKey) {
          const raceDt = new Date(raceDateStr + "T12:00:00Z");
          const label = raceDt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const weeksOut = Math.max(0, Math.round((raceDt.getTime() - Date.now()) / (7 * 86400000)));
          return (
            <div style={{ marginTop: 14, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>🏁</span>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#fbbf24" }}>
                  {data?.race_name || "Race day"} — {label}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {weeksOut > 0 ? `${weeksOut} week${weeksOut === 1 ? "" : "s"} away` : "Race day is today!"}
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Legend */}
      <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[
          { color: "#34d399", label: "Done" },
          { color: "#38bdf8", label: "Today" },
          { color: "#64748b", label: "Planned" },
          { color: "#f87171", label: "Missed" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Workout detail drawer */}
      {selectedWorkout && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={() => setSelectedWorkout(null)}
        >
          <div
            style={{
              width: "100%", maxWidth: 480, background: "#0f1117",
              borderRadius: "16px 16px 0 0", padding: "20px 20px 32px 20px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "0 auto 16px auto" }} />

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>{sessionIcon(selectedWorkout.session_type)}</span>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#fff" }}>
                  {selectedWorkout.title || selectedWorkout.session_type}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {new Date(selectedWorkout.scheduled_date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[selectedWorkout.display_status]}`} style={{ marginLeft: "auto" }}>
                {STATUS_LABEL[selectedWorkout.display_status]}
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: selectedWorkout.coaching_notes ? 14 : 0 }}>
              {selectedWorkout.duration_min && (
                <span style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#94a3b8" }}>
                  ⏱ {selectedWorkout.duration_min} min
                </span>
              )}
              {selectedWorkout.distance_km && (
                <span style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#94a3b8" }}>
                  📏 {selectedWorkout.distance_km} km
                </span>
              )}
              {selectedWorkout.hr_zone && (
                <span style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#94a3b8" }}>
                  💓 Zone {selectedWorkout.hr_zone}
                </span>
              )}
              {selectedWorkout.target_pace && (
                <span style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#94a3b8" }}>
                  🎯 {selectedWorkout.target_pace}
                </span>
              )}
            </div>

            {selectedWorkout.coaching_notes && (
              <div style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                  <span style={{ color: "#38bdf8", fontWeight: 600 }}>Coach: </span>
                  {selectedWorkout.coaching_notes}
                </p>
              </div>
            )}

            <button
              onClick={() => setSelectedWorkout(null)}
              style={{ marginTop: 16, width: "100%", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, padding: "12px", color: "#64748b", fontSize: 13, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function AthletePlanClient() {
  const params = useSearchParams();
  const token = params.get("token");

  const [tab, setTab] = useState<"plan" | "calendar" | "checkin" | "messages">("plan");
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
        <p className="text-xs text-slate-500 uppercase tracking-widest">Andes.IA</p>
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
        {(["plan", "calendar", "checkin", "messages"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              tab === t
                ? "border-sky-400 text-sky-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "plan" ? "This Week" : t === "calendar" ? "Calendar" : t === "checkin" ? "Check In" : "Messages"}
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

        {/* ── CALENDAR TAB ── */}
        {tab === "calendar" && (
          <TrainingCalendar token={token} />
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
