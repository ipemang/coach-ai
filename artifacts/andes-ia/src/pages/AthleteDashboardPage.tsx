import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { BACKEND, getAuthToken } from "../lib/api";

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
  stable_profile: Record<string, unknown>;
  current_state: Record<string, unknown>;
}

const SPORT_COLORS: Record<string, string> = {
  swim: "#4a90b8", bike: "#c0704a", run: "#b87a2c",
  strength: "#6a7c4a", rest: "#9a9a8a", brick: "#8a5a8a",
};

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
      if (!token) { navigate("/login"); return; }
      try {
        const [athleteRes, workoutsRes, suggestionsRes] = await Promise.all([
          fetch(`${BACKEND}/api/v1/athlete/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND}/api/v1/athlete/workouts`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND}/api/v1/athlete/messages`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (athleteRes.status === 401 || athleteRes.status === 403) { navigate("/login"); return; }
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

        {/* Check-in box */}
        <div style={{ background: "#ede8df", border: "1px solid #c9b59a", borderRadius: 4, padding: 20, marginBottom: 28 }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#c0704a", margin: "0 0 10px" }}>Check in with your coach</p>
          {selectedWorkout && (
            <div style={{ fontSize: 11, color: "#6a5a4a", background: "#f5f2ec", padding: "6px 10px", borderRadius: 2, marginBottom: 10 }}>
              Noting about: <strong>{selectedWorkout.title ?? selectedWorkout.session_type}</strong>
              <button onClick={() => setSelectedWorkout(null)} style={{ marginLeft: 8, color: "#8a7a6a", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>×</button>
            </div>
          )}
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
          <div>
            {todayWorkouts.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c0704a", margin: "0 0 12px" }}>Today</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {todayWorkouts.map(w => (
                    <WorkoutCard key={w.id} workout={w} onNote={() => { setSelectedWorkout(w); window.scrollTo({ top: 0, behavior: "smooth" }); }} today />
                  ))}
                </div>
              </div>
            )}

            {upcomingWorkouts.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8a7a6a", margin: "0 0 12px" }}>Upcoming</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {upcomingWorkouts.map(w => (
                    <WorkoutCard key={w.id} workout={w} onNote={() => { setSelectedWorkout(w); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                  ))}
                </div>
              </div>
            )}

            {pastWorkouts.length > 0 && (
              <div>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8a7a6a", margin: "0 0 12px" }}>Past</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pastWorkouts.map(w => (
                    <WorkoutCard key={w.id} workout={w} onNote={() => { setSelectedWorkout(w); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                  ))}
                </div>
              </div>
            )}

            {workouts.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 20, color: "#8a7a6a" }}>No workouts scheduled yet. Check back soon.</p>
              </div>
            )}
          </div>
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
    </div>
  );
}

function WorkoutCard({ workout: w, onNote, today = false }: { workout: WorkoutItem; onNote: () => void; today?: boolean }) {
  const [open, setOpen] = useState(false);
  const color = sessionColor(w.session_type);
  const statusBg = w.status === "completed" ? "#d4e8d8" : w.status === "missed" ? "#f5d8d4" : today ? "#e8f0d4" : "#f5f2ec";
  const statusColor = w.status === "completed" ? "#2a5a30" : w.status === "missed" ? "#8a2010" : today ? "#4a5a20" : "#2a2018";

  return (
    <div style={{ background: "#ede8df", border: `1px solid ${today ? "#b87a2c" : "#c9b59a"}`, borderLeft: `3px solid ${color}`, borderRadius: 4, overflow: "hidden" }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, fontWeight: 500, color: "#2a2018" }}>{w.title ?? w.session_type}</span>
            <span style={{ padding: "2px 8px", background: statusBg, color: statusColor, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 2 }}>{w.status}</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#8a7a6a" }}>{fmtDate(w.scheduled_date)}</span>
            {w.duration_min && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#8a7a6a" }}>{Math.floor(w.duration_min / 60)}:{String(w.duration_min % 60).padStart(2, "0")} min</span>}
            {w.distance_km && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "#8a7a6a" }}>{w.distance_km} km</span>}
          </div>
        </div>
        <span style={{ fontSize: 13, color: "#8a7a6a" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #c9b59a", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {w.coaching_notes && (
            <div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a6b7a", margin: "0 0 6px" }}>Coach's note</p>
              <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 14, lineHeight: 1.6, color: "#6a5a4a", margin: 0 }}>"{w.coaching_notes}"</p>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onNote} style={{ padding: "7px 14px", background: "transparent", border: "1px solid #c9b59a", borderRadius: 2, fontSize: 12, color: "#4a6b7a", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>
              + Note to coach
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
