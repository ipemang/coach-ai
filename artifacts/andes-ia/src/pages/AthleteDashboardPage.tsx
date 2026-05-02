import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { BACKEND, getAuthToken, storeLoginRedirect } from "../lib/api";

interface WorkoutItem {
  id: string;
  scheduled_date: string;
  session_type: string;
  title: string | null;
  duration_min: number | null;
  distance_km: number | null;
  coaching_notes: string | null;
  status: string;
}

interface Suggestion {
  id: string;
  suggestion_text: string | null;
  athlete_message: string | null;
  status: string;
  created_at: string;
}

interface AthleteData {
  full_name: string;
  coach_name?: string;
  coach_initials?: string;
  stable_profile: Record<string, unknown>;
  current_state: Record<string, unknown>;
}

interface WorkoutMessage {
  id: string;
  message: string;
  created_at: string;
  is_coach: boolean;
}

const SPORT_COLORS: Record<string, string> = {
  swim: "#4a90b8", bike: "#c0704a", run: "#6a8c4a",
  strength: "#6a7c4a", rest: "#9a9a8a", brick: "#8a5a8a",
};

const SPORT_BG: Record<string, string> = {
  swim: "#e6f2fa", bike: "#fdf0e8", run: "#edf5e8",
  strength: "#e8f0e0", brick: "#f5f0e0", rest: "#ede8df",
};

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getDateForOffset(monday: string, offset: number): string {
  const d = new Date(monday + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

function sessionColor(type: string): string {
  return SPORT_COLORS[type?.toLowerCase()] ?? "#9a9a8a";
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export default function AthleteDashboardPage() {
  const [, navigate] = useLocation();
  const [athlete, setAthlete] = useState<AthleteData | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"plan" | "messages" | "profile">("plan");
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutItem | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSending, setNoteSending] = useState(false);
  const [noteToast, setNoteToast] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getAuthToken();
      if (!token) { storeLoginRedirect(); navigate("/login?expired=1"); return; }
      try {
        const [athleteRes, workoutsRes, suggestionsRes] = await Promise.all([
          fetch(`${BACKEND}/api/v1/athlete/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND}/api/v1/athlete/workouts`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND}/api/v1/athlete/messages`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (athleteRes.status === 401 || athleteRes.status === 403) { storeLoginRedirect(); navigate("/login?expired=1"); return; }
        if (athleteRes.ok) setAthlete(await athleteRes.json());
        if (workoutsRes.ok) {
          const data = await workoutsRes.json();
          setWorkouts(Array.isArray(data) ? data : data.workouts ?? []);
        }
        if (suggestionsRes.ok) {
          const data = await suggestionsRes.json();
          setSuggestions(Array.isArray(data) ? data : data.messages ?? []);
        }
      } catch { setError("Could not connect. Please check your connection."); }
      setLoading(false);
    }
    load();
  }, [navigate]);

  async function handleSignOut() {
    const sb = createBrowserSupabase();
    if (sb) await sb.auth.signOut();
    navigate("/login");
  }

  async function sendNote() {
    if (!noteText.trim()) return;
    setNoteSending(true);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/athlete/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: noteText, workout_id: selectedWorkout?.id }),
      });
      if (res.ok) {
        setNoteText("");
        setSelectedWorkout(null);
        setNoteToast("Check-in sent to your coach ✓");
        setTimeout(() => setNoteToast(null), 3000);
      } else {
        setNoteToast("Failed to send. Try again.");
        setTimeout(() => setNoteToast(null), 3000);
      }
    } catch {
      setNoteToast("Network error.");
      setTimeout(() => setNoteToast(null), 3000);
    }
    setNoteSending(false);
  }

  const sp = athlete?.stable_profile ?? {};
  const cs = athlete?.current_state ?? {};
  const readiness = (cs.oura_readiness_score ?? cs.last_readiness_score) as number | null | undefined;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f2ec", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Work Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, border: "2px solid #c9b59a", borderTopColor: "#4a6b7a", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a" }}>Loading your plan…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f2ec", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Work Sans', sans-serif" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "#c0704a", marginBottom: 16 }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", background: "#4a6b7a", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer" }}>Retry</button>
        </div>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const todayWorkouts = workouts.filter(w => w.scheduled_date === todayStr);
  const upcomingWorkouts = workouts.filter(w => w.scheduled_date > todayStr).slice(0, 10);
  const pastWorkouts = workouts.filter(w => w.scheduled_date < todayStr).reverse().slice(0, 10);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f2ec", fontFamily: "'Work Sans', sans-serif", color: "#2a2018" }}>
      {noteToast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#4a6b7a", color: "#fff", padding: "10px 20px", borderRadius: 4, fontSize: 13, zIndex: 100 }}>{noteToast}</div>
      )}

      {/* Header */}
      <header style={{ background: "#ede8df", borderBottom: "1px solid #c9b59a", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="28" height="28" viewBox="0 0 32 32">
              <rect x="2" y="2" width="28" height="28" fill="none" stroke="#2a2018" strokeWidth="1" />
              <g fill="#c0704a" opacity="0.85"><rect x="5" y="5" width="5" height="5" /><rect x="16" y="5" width="5" height="5" /></g>
              <g fill="#4a6b7a" opacity="0.9"><rect x="11" y="5" width="5" height="5" /><rect x="22" y="5" width="5" height="5" /></g>
              <g fill="#c0704a" opacity="0.85"><rect x="11" y="11" width="5" height="5" /></g>
              <g fill="#4a6b7a" opacity="0.9"><rect x="5" y="11" width="5" height="5" /></g>
            </svg>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontWeight: 500 }}>
              Andes<span style={{ color: "#c0704a" }}>.</span>IA
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {athlete && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 2, background: "#4a6b7a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, fontWeight: 500 }}>
                {getInitials(athlete.full_name)}
              </div>
              <button onClick={handleSignOut} style={{ fontSize: 12, color: "#8a7a6a", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 24px 80px" }}>
        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a7a6a", margin: "0 0 8px" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 38, fontWeight: 500, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            {athlete ? `${athlete.full_name.split(" ")[0]}'s training.` : "Your training."}
          </h1>
          {!!(sp as Record<string, unknown>).target_race && (
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 16, color: "#6a5a4a", margin: 0 }}>
              Racing: {String((sp as Record<string, unknown>).target_race)}
              {!!(sp as Record<string, unknown>).race_date && ` · ${new Date(String((sp as Record<string, unknown>).race_date) + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
            </p>
          )}
        </div>

        {/* Biometric strip */}
        {readiness != null && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "#c9b59a", border: "1px solid #c9b59a", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            {[
              { label: "Readiness", value: readiness, unit: "/100", color: readiness >= 80 ? "#4a6b7a" : readiness >= 60 ? "#b87a2c" : "#c0704a" },
              { label: "HRV", value: (cs.oura_avg_hrv as number | undefined) ? Math.round(cs.oura_avg_hrv as number) : null, unit: "ms", color: "#2a2018" },
              { label: "Sleep", value: cs.oura_sleep_score as number | undefined, unit: "/100", color: "#2a2018" },
            ].map((b, i) => (
              <div key={i} style={{ background: "#ede8df", padding: "16px 20px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 8 }}>{b.label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, lineHeight: 1, color: b.color }}>
                  {b.value ?? "—"}<span style={{ fontSize: 13, color: "#8a7a6a" }}>{b.value != null ? b.unit : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* General check-in box */}
        <div style={{ background: "#ede8df", border: "1px solid #c9b59a", borderRadius: 4, padding: 20, marginBottom: 28 }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c0704a", margin: "0 0 10px" }}>Check in with your coach</p>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="How did it go? Anything to share with your coach…"
            rows={3}
            style={{ width: "100%", padding: "10px 14px", background: "#f5f2ec", border: "1px solid #c9b59a", borderRadius: 2, fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: "#2a2018", outline: "none", resize: "vertical", lineHeight: 1.55, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={sendNote} disabled={noteSending || !noteText.trim()} style={{ padding: "9px 20px", background: noteSending ? "#8a7a6a" : "#4a6b7a", color: "#fff", border: "none", borderRadius: 2, fontSize: 13, cursor: noteSending ? "not-allowed" : "pointer", fontFamily: "'Work Sans', sans-serif" }}>
              {noteSending ? "Sending…" : "Send check-in →"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <nav style={{ borderBottom: "1px solid #c9b59a", display: "flex", gap: 2, marginBottom: 24 }}>
          {([
            { id: "plan", label: "Training plan" },
            { id: "messages", label: `Messages${suggestions.filter(s => s.status === "sent" || s.status === "approved").length > 0 ? ` (${suggestions.filter(s => s.status === "sent" || s.status === "approved").length})` : ""}` },
            { id: "profile", label: "My profile" },
          ] as { id: typeof activeTab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "10px 16px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", border: "none", background: "transparent", color: activeTab === t.id ? "#2a2018" : "#8a7a6a", borderBottom: `2px solid ${activeTab === t.id ? "#c0704a" : "transparent"}`, cursor: "pointer", marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Plan tab */}
        {activeTab === "plan" && (
          <PlanCalendar
            workouts={workouts}
            onSelect={w => setSelectedWorkout(w)}
            todayStr={todayStr}
          />
        )}

        {/* Messages tab */}
        {activeTab === "messages" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {suggestions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: "#8a7a6a" }}>No messages from your coach yet.</p>
              </div>
            ) : suggestions.map(s => (
              <div key={s.id} style={{ background: "#ede8df", border: "1px solid #c9b59a", borderRadius: 4, padding: 18 }}>
                {s.athlete_message && (
                  <div style={{ padding: "10px 14px", background: "#f5f2ec", borderLeft: "2px solid #b87a2c", fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "#6a5a4a", marginBottom: 12 }}>
                    You: &ldquo;{s.athlete_message}&rdquo;
                  </div>
                )}
                {(s.status === "sent" || s.status === "approved") && s.suggestion_text && (
                  <div>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a6b7a", margin: "0 0 6px" }}>Coach</p>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#2a2018" }}>{s.suggestion_text}</p>
                  </div>
                )}
                <p style={{ margin: "10px 0 0", fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#8a7a6a" }}>
                  {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Profile tab */}
        {activeTab === "profile" && athlete && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#ede8df", border: "1px solid #c9b59a", borderRadius: 4, padding: 24 }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a", margin: "0 0 16px" }}>Training profile</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {([
                  { label: "Name", value: athlete.full_name },
                  { label: "Target race", value: String((sp as Record<string, unknown>).target_race ?? "—") },
                  { label: "Race date", value: (sp as Record<string, unknown>).race_date ? new Date(String((sp as Record<string, unknown>).race_date) + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—" },
                  { label: "Max weekly hours", value: (sp as Record<string, unknown>).max_weekly_hours ? `${(sp as Record<string, unknown>).max_weekly_hours}h` : "—" },
                  { label: "Training phase", value: String((cs as Record<string, unknown>).training_phase ?? "—") },
                  { label: "Training week", value: (cs as Record<string, unknown>).training_week ? `Week ${(cs as Record<string, unknown>).training_week}` : "—" },
                ] as { label: string; value: string }[]).map(f => (
                  <div key={f.label}>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a7a6a", margin: "0 0 4px" }}>{f.label}</p>
                    <p style={{ fontSize: 14, color: "#2a2018", margin: 0 }}>{f.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {!!(sp as Record<string, unknown>).injury_history && (
              <div style={{ background: "#ede8df", border: "1px solid #c9b59a", borderRadius: 4, padding: 24 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a", margin: "0 0 10px" }}>Injury history</p>
                <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 14, lineHeight: 1.6, color: "#6a5a4a", margin: 0 }}>{String((sp as Record<string, unknown>).injury_history)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {selectedWorkout && (
        <WorkoutModal
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          coachName={athlete?.coach_name}
          coachInitials={athlete?.coach_initials}
          athleteInitials={athlete ? getInitials(athlete.full_name) : "?"}
        />
      )}
    </div>
  );
}

function WorkoutCell({ workout, onSelect, isToday }: {
  workout: WorkoutItem | null;
  onSelect: (w: WorkoutItem) => void;
  isToday: boolean;
}) {
  if (!workout) {
    return (
      <div style={{
        background: isToday ? "#f0ece0" : "#f5f2ec",
        minHeight: 84,
        outline: isToday ? "2px solid #b87a2c" : "none",
        outlineOffset: -2,
      }} />
    );
  }
  const bg = SPORT_BG[workout.session_type?.toLowerCase()] ?? "#f5f2ec";
  const color = sessionColor(workout.session_type);
  const isCompleted = workout.status === "completed";
  const isMissed = workout.status === "missed";

  return (
    <button
      onClick={() => onSelect(workout)}
      title={workout.title ?? workout.session_type}
      style={{
        width: "100%", minHeight: 84, background: bg, border: "none",
        outline: isToday ? "2px solid #b87a2c" : "none", outlineOffset: -2,
        cursor: "pointer", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 5,
        padding: "10px 6px", opacity: isMissed ? 0.45 : 1,
        position: "relative", transition: "filter 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = "brightness(0.92)")}
      onMouseLeave={e => (e.currentTarget.style.filter = "none")}
    >
      {/* Status dot */}
      {(isCompleted || isMissed) && (
        <span style={{
          position: "absolute", top: 6, right: 6,
          width: 6, height: 6, borderRadius: "50%",
          background: isCompleted ? "#2a5a30" : "#c0704a",
        }} />
      )}
      {/* Sport icon */}
      <span style={{ fontSize: 24, color, lineHeight: 1 }}>
        <SportIcon type={workout.session_type} />
      </span>
      {/* Title */}
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5,
        color, letterSpacing: "0.08em", textTransform: "uppercase",
        textAlign: "center", lineHeight: 1.3,
        maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {workout.title ?? workout.session_type}
      </span>
      {/* Duration */}
      {workout.duration_min && (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "#8a7a6a" }}>
          {fmtDuration(workout.duration_min)}
        </span>
      )}
    </button>
  );
}

function PlanCalendar({ workouts, onSelect, todayStr }: {
  workouts: WorkoutItem[];
  onSelect: (w: WorkoutItem) => void;
  todayStr: string;
}) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Build sorted list of unique Mondays (include current week always)
  const mondaySet = new Set<string>();
  workouts.forEach(w => mondaySet.add(getMondayOf(w.scheduled_date)));
  mondaySet.add(getMondayOf(todayStr));
  const weeks = Array.from(mondaySet).sort();

  if (workouts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: "#8a7a6a", margin: 0 }}>
          No workouts scheduled yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: 4, border: "1px solid #c9b59a" }}>
      {/* Column header */}
      <div style={{ display: "grid", gridTemplateColumns: "54px repeat(7, 1fr) 54px", gap: 1, background: "#c9b59a", minWidth: 600 }}>
        <div style={hdrCell}>WK</div>
        {DAYS.map(d => <div key={d} style={hdrCell}>{d}</div>)}
        <div style={hdrCell}>COMP</div>
      </div>

      {/* Week rows */}
      {weeks.map((monday, wi) => {
        const dayWorkouts = DAYS.map((_, di) => {
          const dateStr = getDateForOffset(monday, di);
          return workouts.find(w => w.scheduled_date === dateStr) ?? null;
        });
        const scheduled = dayWorkouts.filter(Boolean).length;
        const completed = dayWorkouts.filter(w => w?.status === "completed").length;
        const compPct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;
        const isCurrentWeek = monday === getMondayOf(todayStr);

        return (
          <div key={monday} style={{ display: "grid", gridTemplateColumns: "54px repeat(7, 1fr) 54px", gap: 1, background: "#c9b59a", borderTop: "1px solid #c9b59a", minWidth: 600 }}>
            {/* Week label */}
            <div style={{
              background: isCurrentWeek ? "#e8e0cc" : "#ede8df",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "8px 4px", gap: 3,
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: isCurrentWeek ? "#b87a2c" : "#6a5a4a", fontWeight: 600 }}>W{wi + 1}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "#9a9a8a", textAlign: "center" }}>
                {new Date(monday + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>

            {/* Day cells */}
            {dayWorkouts.map((workout, di) => (
              <WorkoutCell
                key={di}
                workout={workout}
                onSelect={onSelect}
                isToday={getDateForOffset(monday, di) === todayStr}
              />
            ))}

            {/* Completion % */}
            <div style={{
              background: isCurrentWeek ? "#e8e0cc" : "#ede8df",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {compPct !== null ? (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                  color: compPct >= 90 ? "#2a5a30" : compPct >= 70 ? "#b87a2c" : "#c0704a",
                }}>
                  {compPct}%
                </span>
              ) : (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#c9b59a" }}>—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const hdrCell: React.CSSProperties = {
  background: "#e4ddd2", padding: "9px 0", textAlign: "center",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
  letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a7a6a",
};

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:00` : `${m}:00`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function SportIcon({ type }: { type: string }) {
  const t = type?.toLowerCase();
  if (t === "swim") return <span>≈</span>;
  if (t === "bike" || t === "cycle") return <span>⊙</span>;
  if (t === "run") return <span>↑</span>;
  if (t === "strength") return <span>↑</span>;
  return <span>·</span>;
}

function WorkoutModal({ workout: w, onClose, coachName, coachInitials, athleteInitials }: {
  workout: WorkoutItem;
  onClose: () => void;
  coachName?: string;
  coachInitials?: string;
  athleteInitials: string;
}) {
  const [messages, setMessages] = useState<WorkoutMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<unknown>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchMessages() {
      const token = await getAuthToken();
      try {
        const res = await fetch(`${BACKEND}/api/v1/athlete/workouts/${w.id}/messages`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : data.messages ?? []);
        }
      } catch { /* no messages endpoint — show empty */ }
    }
    fetchMessages();
  }, [w.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function toggleVoice() {
    if (recording) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any)?.stop();
      setRecording(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setText(t => (t ? t + " " : "") + "[Voice not supported — try Chrome]");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new SR() as any;
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onstart = () => setRecording(true);
    r.onresult = (e: { results: ArrayLike<{ 0: { transcript: string } }> }) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(" ").trim();
      setText(t => (t.trim() ? t.trimEnd() + " " + transcript : transcript));
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    r.start();
    recognitionRef.current = r;
  }

  async function sendMessage() {
    if (!text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    const token = await getAuthToken();
    const optimistic: WorkoutMessage = { id: crypto.randomUUID(), message: body, created_at: new Date().toISOString(), is_coach: false };
    setMessages(m => [...m, optimistic]);
    setText("");
    try {
      await fetch(`${BACKEND}/api/v1/athlete/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: body, workout_id: w.id }),
      });
    } catch { /* optimistic — message still shows */ }
    setSending(false);
  }

  const color = sessionColor(w.session_type);
  const isCompleted = w.status === "completed";
  const isMissed = w.status === "missed";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(42,32,24,0.45)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#f5f2ec", border: "1px solid #c9b59a", borderRadius: 6, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 16px 48px rgba(42,32,24,0.18)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #e0d8cc", display: "flex", alignItems: "center", gap: 12, background: "#ede8df" }}>
          <div style={{ width: 32, height: 32, background: color + "22", border: `1px solid ${color}44`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color, fontSize: 14 }}>
            <SportIcon type={w.session_type} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a" }}>
              {w.session_type.toUpperCase()} · {fmtDate(w.scheduled_date).toUpperCase()}
            </div>
          </div>
          {isCompleted && (
            <span style={{ padding: "3px 8px", background: "#d4e8d8", color: "#2a5a30", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", borderRadius: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 7 }}>●</span> MET
            </span>
          )}
          {isMissed && (
            <span style={{ padding: "3px 8px", background: "#f5d8d4", color: "#8a2010", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", borderRadius: 2 }}>MISSED</span>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#8a7a6a", lineHeight: 1, padding: "2px 4px" }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Title */}
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 32, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-0.01em", color: "#2a2018" }}>
            {w.title ?? w.session_type}
          </h2>

          {/* Planned / Actual grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #c9b59a", borderRadius: 3, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 16px", borderRight: "1px solid #c9b59a" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 10 }}>Planned</div>
              {w.duration_min && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#8a7a6a", letterSpacing: "0.08em", textTransform: "uppercase" }}>Duration</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#2a2018" }}>{fmtDuration(w.duration_min)}</span>
                </div>
              )}
              {w.distance_km && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#8a7a6a", letterSpacing: "0.08em", textTransform: "uppercase" }}>Distance</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#2a2018" }}>{w.distance_km >= 1 ? `${w.distance_km}km` : `${Math.round(w.distance_km * 1000)}m`}</span>
                </div>
              )}
              {!w.duration_min && !w.distance_km && (
                <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 13, color: "#8a7a6a" }}>No targets set</span>
              )}
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 10 }}>Actual</div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7a6a", lineHeight: 1.5 }}>
                {isCompleted ? "Completed · auto-syncs from Strava." : "Awaiting completion — auto-syncs from Strava."}
              </span>
            </div>
          </div>

          {/* Coaching notes */}
          {w.coaching_notes && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 10 }}>Workout</div>
              <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, lineHeight: 1.65, color: "#2a2018", margin: "0 0 14px" }}>{w.coaching_notes}</p>
            </div>
          )}

          {/* Coach quote block */}
          {(coachName || coachInitials) && w.coaching_notes && (
            <div style={{ background: "#fdf7f2", border: "1px solid #e8d8cc", borderLeft: "3px solid #c0704a", borderRadius: 3, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#c0704a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                {coachInitials ?? coachName?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c0704a", marginBottom: 6 }}>{coachName ?? "Your coach"}</div>
                <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 17, lineHeight: 1.6, color: "#4a3020", margin: 0 }}>
                  &ldquo;{w.coaching_notes}&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* Conversation */}
          {messages.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 12 }}>Conversation</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.map(m => (
                  <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.is_coach ? "#4a6b7a" : "#6a5a4a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {m.is_coach ? (coachInitials ?? "C") : athleteInitials}
                    </div>
                    <div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#8a7a6a", marginBottom: 3 }}>
                        {m.is_coach ? (coachName ?? "Coach") : "You"} · {fmtTime(m.created_at)}
                      </div>
                      <p style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 14, lineHeight: 1.55, color: "#2a2018", margin: 0 }}>{m.message}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #e0d8cc", background: "#ede8df" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
              placeholder={recording ? "Listening… speak now" : "Add a comment for your coach…"}
              style={{ flex: 1, padding: "10px 14px", background: recording ? "#fff8f4" : "#f5f2ec", border: `1px solid ${recording ? "#c0704a" : "#c9b59a"}`, borderRadius: 2, fontFamily: "'Work Sans', sans-serif", fontSize: 14, color: "#2a2018", outline: "none", transition: "border-color 0.15s" }}
            />
            <button
              onClick={toggleVoice}
              title={recording ? "Stop recording" : "Record voice memo"}
              style={{ width: 40, height: 40, background: recording ? "#c0704a" : "transparent", border: `1px solid ${recording ? "#c0704a" : "#c9b59a"}`, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={recording ? "#fff" : "#4a6b7a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button
              onClick={sendMessage}
              disabled={sending || !text.trim()}
              style={{ padding: "10px 20px", background: sending || !text.trim() ? "#8a7a6a" : "#2a2018", color: "#fff", border: "none", borderRadius: 2, fontSize: 13, cursor: sending || !text.trim() ? "not-allowed" : "pointer", fontFamily: "'Work Sans', sans-serif", flexShrink: 0, transition: "background 0.15s" }}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
          {recording && (
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#c0704a", letterSpacing: "0.1em", margin: "8px 0 0", animation: "pulse 1s ease-in-out infinite" }}>
              ● RECORDING — tap mic again to stop
            </p>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function WorkoutCard({ workout: w, onOpen, today = false }: { workout: WorkoutItem; onOpen: () => void; today?: boolean }) {
  const color = sessionColor(w.session_type);
  const statusBg = w.status === "completed" ? "#d4e8d8" : w.status === "missed" ? "#f5d8d4" : today ? "#e8f0d4" : "#f5f2ec";
  const statusColor = w.status === "completed" ? "#2a5a30" : w.status === "missed" ? "#8a2010" : today ? "#4a5a20" : "#2a2018";

  return (
    <div
      onClick={onOpen}
      style={{ background: "#ede8df", border: `1px solid ${today ? "#b87a2c" : "#c9b59a"}`, borderLeft: `3px solid ${color}`, borderRadius: 4, overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 10px rgba(42,32,24,0.10)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, fontWeight: 500, color: "#2a2018" }}>{w.title ?? w.session_type}</span>
            <span style={{ padding: "2px 8px", background: statusBg, color: statusColor, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 2 }}>{w.status}</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#8a7a6a" }}>{fmtDate(w.scheduled_date)}</span>
            {w.duration_min && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#8a7a6a" }}>{fmtDuration(w.duration_min)}</span>}
            {w.distance_km && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#8a7a6a" }}>{w.distance_km >= 1 ? `${w.distance_km}km` : `${Math.round(w.distance_km * 1000)}m`}</span>}
          </div>
        </div>
        <span style={{ fontSize: 13, color: "#8a7a6a" }}>›</span>
      </div>
    </div>
  );
}
