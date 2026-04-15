"use client";

import { useState, useEffect, useCallback } from "react";

const SESSION_TYPES = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "brick", label: "Brick" },
  { value: "strength", label: "Strength" },
  { value: "recovery", label: "Recovery" },
  { value: "rest", label: "Rest Day" },
  { value: "other", label: "Other" },
];

const SESSION_COLORS: Record<string, string> = {
  run: "#3b82f6", bike: "#f59e0b", swim: "#06b6d4",
  brick: "#8b5cf6", strength: "#ef4444", recovery: "#10b981",
  rest: "#6b7280", other: "#9ca3af",
};

type Workout = {
  id: string;
  scheduled_date: string;
  session_type: string;
  title: string | null;
  distance_km: number | null;
  duration_min: number | null;
  hr_zone: string | null;
  target_pace: string | null;
  coaching_notes: string | null;
  status: string;
  source?: string;
};

type Athlete = { id: string; full_name: string };

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WorkoutsPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string>("");
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState<string | null>(null); // date string
  const [editTarget, setEditTarget] = useState<Workout | null>(null);
  const [saving, setSaving] = useState(false);

  const weekDates = getWeekDates(weekOffset);
  const weekStart = isoDate(weekDates[0]);
  const weekEnd = isoDate(weekDates[6]);

  // Load athletes
  useEffect(() => {
    fetch("/api/athletes")
      .then((r) => r.json())
      .then((d) => {
        const list: Athlete[] = d.athletes ?? [];
        setAthletes(list);
        if (list.length > 0 && !selectedAthlete) setSelectedAthlete(list[0].id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWorkouts = useCallback(() => {
    if (!selectedAthlete) return;
    setLoading(true);
    fetch(`/api/workouts?athlete_id=${selectedAthlete}&week_start=${weekStart}&week_end=${weekEnd}`)
      .then((r) => r.json())
      .then((d) => setWorkouts(d.workouts ?? []))
      .finally(() => setLoading(false));
  }, [selectedAthlete, weekStart, weekEnd]);

  useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this workout?")) return;
    await fetch(`/api/workouts/${id}`, { method: "DELETE" });
    loadWorkouts();
  }

  async function handleStatusToggle(w: Workout) {
    const next = w.status === "completed" ? "prescribed" : "completed";
    await fetch(`/api/workouts/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    loadWorkouts();
  }

  async function handleApproveAI(w: Workout) {
    await fetch(`/api/workouts/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "dashboard", status: "prescribed" }),
    });
    loadWorkouts();
  }

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const todayStr = isoDate(new Date());

  return (
    <main style={{ minHeight: "100vh", background: "#0f1117", color: "#e0e0e0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Nav */}
      <nav style={{ background: "#1a1d2e", borderBottom: "1px solid #2a2d3e", padding: "14px 24px", display: "flex", alignItems: "center", gap: "24px" }}>
        <span style={{ color: "#6c63ff", fontWeight: 700, fontSize: "16px" }}>Coach.AI</span>
        <a href="/dashboard" style={{ color: "#9ca3af", fontSize: "14px", textDecoration: "none" }}>Dashboard</a>
        <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>Training Plans</span>
      </nav>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", margin: 0 }}>Weekly Training Plan</h1>
            <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>Build and manage workouts per athlete</p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Athlete selector */}
            <select
              value={selectedAthlete}
              onChange={(e) => setSelectedAthlete(e.target.value)}
              style={{ background: "#1a1d2e", border: "1px solid #2a2d3e", color: "#fff", padding: "8px 12px", borderRadius: "8px", fontSize: "14px" }}
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
            {/* Week nav */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={() => setWeekOffset((o) => o - 1)} style={navBtnStyle}>←</button>
              <span style={{ fontSize: "13px", color: "#9ca3af", minWidth: "180px", textAlign: "center" }}>{weekLabel}</span>
              <button onClick={() => setWeekOffset((o) => o + 1)} style={navBtnStyle}>→</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{ ...navBtnStyle, fontSize: "11px", padding: "4px 10px" }}>Today</button>
              )}
            </div>
          </div>
        </div>

        {/* 7-day grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#6b7280" }}>Loading workouts…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
            {weekDates.map((date, i) => {
              const ds = isoDate(date);
              const isToday = ds === todayStr;
              const dayWorkouts = workouts.filter((w) => w.scheduled_date === ds);
              const aiAdjustments = dayWorkouts.filter((w) => w.source === "ai_adjustment");
              const regular = dayWorkouts.filter((w) => w.source !== "ai_adjustment");

              return (
                <div key={ds} style={{
                  background: "#1a1d2e",
                  border: isToday ? "1.5px solid #6c63ff" : "1px solid #2a2d3e",
                  borderRadius: "10px",
                  padding: "12px",
                  minHeight: "200px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}>
                  {/* Day header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: isToday ? "#6c63ff" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{DAY_LABELS[i]}</span>
                      <span style={{ display: "block", fontSize: "13px", color: isToday ? "#fff" : "#9ca3af", fontWeight: isToday ? 600 : 400 }}>
                        {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <button
                      onClick={() => { setShowForm(ds); setEditTarget(null); }}
                      title="Add workout"
                      style={{ background: "none", border: "1px solid #2a2d3e", color: "#6b7280", borderRadius: "6px", width: "24px", height: "24px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                    >+</button>
                  </div>

                  {/* AI adjustments (distinct style) */}
                  {aiAdjustments.map((w) => (
                    <div key={w.id} style={{ background: "#2d1f6e", border: "1px solid #4c3aad", borderRadius: "7px", padding: "8px", fontSize: "12px" }}>
                      <div style={{ color: "#a78bfa", fontWeight: 600, fontSize: "10px", marginBottom: "3px" }}>⚡ AI ADJUSTMENT</div>
                      <div style={{ color: "#c4b5fd", fontWeight: 600 }}>{w.title || SESSION_TYPES.find(s => s.value === w.session_type)?.label}</div>
                      {w.duration_min && <div style={{ color: "#8b7dd8" }}>{w.duration_min}min{w.distance_km ? ` · ${w.distance_km}km` : ""}</div>}
                      <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                        <button onClick={() => handleApproveAI(w)} style={{ ...smallBtnStyle, background: "#4c3aad", color: "#c4b5fd" }}>Approve</button>
                        <button onClick={() => handleDelete(w.id)} style={{ ...smallBtnStyle, background: "#3d1515", color: "#f87171" }}>Dismiss</button>
                      </div>
                    </div>
                  ))}

                  {/* Regular workouts */}
                  {regular.map((w) => (
                    <div
                      key={w.id}
                      style={{
                        background: `${SESSION_COLORS[w.session_type] || "#6b7280"}18`,
                        border: `1px solid ${SESSION_COLORS[w.session_type] || "#6b7280"}40`,
                        borderRadius: "7px",
                        padding: "8px",
                        fontSize: "12px",
                        opacity: w.status === "missed" ? 0.5 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <span style={{ color: SESSION_COLORS[w.session_type] || "#9ca3af", fontWeight: 700, fontSize: "10px", textTransform: "uppercase" }}>
                          {SESSION_TYPES.find(s => s.value === w.session_type)?.label}
                        </span>
                        {w.status === "completed" && <span style={{ color: "#10b981", fontSize: "10px" }}>✓</span>}
                      </div>
                      {w.title && <div style={{ color: "#e0e0e0", fontWeight: 600, marginTop: "2px" }}>{w.title}</div>}
                      {(w.duration_min || w.distance_km) && (
                        <div style={{ color: "#9ca3af", marginTop: "2px" }}>
                          {[w.duration_min && `${w.duration_min}min`, w.distance_km && `${w.distance_km}km`].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {w.hr_zone && <div style={{ color: "#9ca3af" }}>Zone {w.hr_zone}</div>}
                      {w.coaching_notes && (
                        <div style={{ color: "#6b7280", marginTop: "4px", fontSize: "11px", borderTop: "1px solid #2a2d3e", paddingTop: "4px" }}>
                          {w.coaching_notes.slice(0, 80)}{w.coaching_notes.length > 80 ? "…" : ""}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                        <button onClick={() => handleStatusToggle(w)} style={{ ...smallBtnStyle, background: w.status === "completed" ? "#374151" : "#064e3b", color: w.status === "completed" ? "#9ca3af" : "#6ee7b7" }}>
                          {w.status === "completed" ? "Undo" : "Done"}
                        </button>
                        <button onClick={() => { setEditTarget(w); setShowForm(ds); }} style={{ ...smallBtnStyle, background: "#1e3a5f", color: "#60a5fa" }}>Edit</button>
                        <button onClick={() => handleDelete(w.id)} style={{ ...smallBtnStyle, background: "#3d1515", color: "#f87171" }}>✕</button>
                      </div>
                    </div>
                  ))}

                  {dayWorkouts.length === 0 && (
                    <div style={{ color: "#374151", fontSize: "12px", textAlign: "center", marginTop: "auto", paddingTop: "16px" }}>Rest</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Workout form modal */}
      {showForm && (
        <WorkoutFormModal
          date={showForm}
          athleteId={selectedAthlete}
          workout={editTarget}
          saving={saving}
          onClose={() => { setShowForm(null); setEditTarget(null); }}
          onSave={async (payload) => {
            setSaving(true);
            try {
              if (editTarget) {
                await fetch(`/api/workouts/${editTarget.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
              } else {
                await fetch("/api/workouts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...payload, athlete_id: selectedAthlete, scheduled_date: showForm }),
                });
              }
              setShowForm(null);
              setEditTarget(null);
              loadWorkouts();
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </main>
  );
}

// ---- Inline form modal ----

function WorkoutFormModal({ date, workout, saving, onClose, onSave }: {
  date: string;
  athleteId: string;
  workout: Workout | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    session_type: workout?.session_type ?? "run",
    title: workout?.title ?? "",
    duration_min: workout?.duration_min?.toString() ?? "",
    distance_km: workout?.distance_km?.toString() ?? "",
    hr_zone: workout?.hr_zone ?? "",
    target_pace: workout?.target_pace ?? "",
    coaching_notes: workout?.coaching_notes ?? "",
    status: workout?.status ?? "prescribed",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#1a1d2e", border: "1px solid #2a2d3e", borderRadius: "16px", padding: "32px", width: "100%", maxWidth: "480px", fontFamily: "inherit" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ color: "#fff", fontSize: "16px", fontWeight: 700, margin: 0 }}>
            {workout ? "Edit Workout" : `New Workout — ${date}`}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <label style={labelStyle}>
              Session Type
              <select value={form.session_type} onChange={(e) => set("session_type", e.target.value)} style={inputStyle}>
                {SESSION_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Status
              <select value={form.status} onChange={(e) => set("status", e.target.value)} style={inputStyle}>
                {["prescribed","sent","completed","skipped","missed"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Title
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Easy Z2 Run" style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <label style={labelStyle}>
              Duration (min)
              <input type="number" value={form.duration_min} onChange={(e) => set("duration_min", e.target.value)} placeholder="60" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Distance (km)
              <input type="number" step="0.1" value={form.distance_km} onChange={(e) => set("distance_km", e.target.value)} placeholder="10.0" style={inputStyle} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <label style={labelStyle}>
              HR Zone
              <input value={form.hr_zone} onChange={(e) => set("hr_zone", e.target.value)} placeholder="Z2" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Target Pace
              <input value={form.target_pace} onChange={(e) => set("target_pace", e.target.value)} placeholder="5:30/km" style={inputStyle} />
            </label>
          </div>

          <label style={labelStyle}>
            Coaching Notes
            <textarea value={form.coaching_notes} onChange={(e) => set("coaching_notes", e.target.value)} placeholder="Keep it easy, focus on cadence…" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            style={{ flex: 1, padding: "10px", background: saving ? "#374151" : "linear-gradient(135deg,#6c63ff,#4f46e5)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 600, fontSize: "14px", cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving…" : workout ? "Save Changes" : "Create Workout"}
          </button>
          <button onClick={onClose} style={{ padding: "10px 20px", background: "#2a2d3e", border: "none", borderRadius: "8px", color: "#9ca3af", fontSize: "14px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Shared styles ----
const navBtnStyle: React.CSSProperties = {
  background: "#1a1d2e", border: "1px solid #2a2d3e", color: "#9ca3af",
  borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontSize: "14px",
};

const smallBtnStyle: React.CSSProperties = {
  border: "none", borderRadius: "4px", padding: "3px 7px",
  fontSize: "10px", fontWeight: 600, cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "5px",
  fontSize: "12px", fontWeight: 500, color: "#9ca3af",
};

const inputStyle: React.CSSProperties = {
  background: "#0f1117", border: "1px solid #2a2d3e", borderRadius: "7px",
  color: "#fff", padding: "8px 10px", fontSize: "14px", fontFamily: "inherit",
  width: "100%", boxSizing: "border-box",
};
