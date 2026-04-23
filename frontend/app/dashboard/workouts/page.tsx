"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const SESSION_TYPES = [
  { value: "Easy Run",       label: "Easy Run",       color: "aegean" },
  { value: "Tempo Run",      label: "Tempo Run",      color: "terra" },
  { value: "Interval Run",   label: "Interval Run",   color: "terra" },
  { value: "Long Run",       label: "Long Run",       color: "aegean" },
  { value: "Easy Ride",      label: "Easy Ride",      color: "ochre" },
  { value: "Tempo Ride",     label: "Tempo Ride",     color: "ochre" },
  { value: "Interval Ride",  label: "Interval Ride",  color: "ochre" },
  { value: "Long Ride",      label: "Long Ride",      color: "ochre" },
  { value: "Swim Easy",      label: "Swim Easy",      color: "aegean" },
  { value: "Swim Threshold", label: "Swim Threshold", color: "aegean" },
  { value: "Swim CSS",       label: "Swim CSS",       color: "aegean" },
  { value: "Strength",       label: "Strength",       color: "olive" },
  { value: "Recovery",       label: "Recovery",       color: "olive" },
  { value: "Rest",           label: "Rest",           color: "none" },
  { value: "Brick",          label: "Brick",          color: "terra" },
  { value: "Race",           label: "Race",           color: "terra" },
];

const COLOR_CHIP: Record<string, string> = {
  aegean: "ca-chip ca-chip-aegean",
  terra:  "ca-chip ca-chip-terra",
  ochre:  "ca-chip ca-chip-ochre",
  olive:  "ca-chip ca-chip-olive",
  none:   "ca-chip",
};

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  completed:  { bg: "var(--aegean-wash)",      border: "var(--aegean-soft)" },
  missed:     { bg: "var(--terracotta-soft)",  border: "oklch(0.75 0.10 45)" },
  prescribed: { bg: "var(--linen)",            border: "var(--rule)" },
  pending:    { bg: "var(--parchment)",         border: "var(--rule-soft)" },
  sent:       { bg: "var(--aegean-wash)",      border: "var(--aegean-soft)" },
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
  const dow = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon + offset * 7);
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
  const [showForm, setShowForm] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Workout | null>(null);
  const [saving, setSaving] = useState(false);

  const weekDates = getWeekDates(weekOffset);
  const weekStart = isoDate(weekDates[0]);
  const weekEnd = isoDate(weekDates[6]);
  const todayStr = isoDate(new Date());

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${weekDates[6].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

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
    fetch(
      `/api/workouts?athlete_id=${selectedAthlete}&week_start=${weekStart}&week_end=${weekEnd}`
    )
      .then((r) => r.json())
      .then((d) => setWorkouts(d.workouts ?? []))
      .finally(() => setLoading(false));
  }, [selectedAthlete, weekStart, weekEnd]);

  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

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

  function openAdd(date: string) {
    setEditTarget(null);
    setShowForm(date);
  }

  function openEdit(w: Workout) {
    setEditTarget(w);
    setShowForm(w.scheduled_date);
  }

  async function handleSave(payload: Record<string, unknown>) {
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
          body: JSON.stringify({
            ...payload,
            athlete_id: selectedAthlete,
            scheduled_date: showForm,
          }),
        });
      }
      setShowForm(null);
      setEditTarget(null);
      loadWorkouts();
    } finally {
      setSaving(false);
    }
  }

  const sessionChipClass = (type: string) => {
    const meta = SESSION_TYPES.find((s) => s.value === type);
    return COLOR_CHIP[meta?.color ?? "none"];
  };

  return (
    <main className="mosaic-bg" style={{ minHeight: "100vh", padding: "2rem 1.5rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Back */}
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
          }}
        >
          ← Dashboard
        </Link>

        {/* Header bar */}
        <div
          className="ca-panel"
          style={{
            padding: "1rem 1.5rem",
            marginBottom: "1.25rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.875rem",
          }}
        >
          <div>
            <p className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 3 }}>
              Training Plans
            </p>
            <h1
              className="ca-display"
              style={{ fontSize: 24, color: "var(--ink)", margin: 0 }}
            >
              Weekly Workout Editor
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            {/* Athlete selector */}
            <select
              value={selectedAthlete}
              onChange={(e) => setSelectedAthlete(e.target.value)}
              style={{
                padding: "7px 12px",
                background: "var(--parchment)",
                border: "1px solid var(--rule)",
                borderRadius: 2,
                fontSize: 13,
                color: "var(--ink)",
                fontFamily: "var(--body)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>

            {/* Week nav */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="ca-btn"
                style={{ padding: "5px 11px", fontSize: 14 }}
              >
                ←
              </button>
              <span
                className="ca-mono"
                style={{
                  fontSize: 11,
                  color: "var(--ink-soft)",
                  minWidth: 170,
                  textAlign: "center",
                }}
              >
                {weekLabel}
              </span>
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                className="ca-btn"
                style={{ padding: "5px 11px", fontSize: 14 }}
              >
                →
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="ca-btn ca-btn-ghost"
                  style={{ padding: "5px 10px", fontSize: 11 }}
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 7-day grid */}
        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px",
              color: "var(--ink-mute)",
              fontFamily: "var(--mono)",
              letterSpacing: "0.08em",
              fontSize: 12,
            }}
          >
            Loading workouts…
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "0.5rem",
            }}
          >
            {weekDates.map((date, i) => {
              const ds = isoDate(date);
              const isToday = ds === todayStr;
              const dayWorkouts = workouts.filter((w) => w.scheduled_date === ds);
              const aiAdjustments = dayWorkouts.filter((w) => w.source === "ai_adjustment");
              const regular = dayWorkouts.filter((w) => w.source !== "ai_adjustment");

              return (
                <div
                  key={ds}
                  style={{
                    background: isToday ? "oklch(0.96 0.015 42 / 0.35)" : "var(--linen)",
                    border: isToday
                      ? "1px solid var(--terracotta)"
                      : "1px solid var(--rule)",
                    borderRadius: 2,
                    padding: "0.625rem 0.75rem",
                    minHeight: 180,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.375rem",
                  }}
                >
                  {/* Day header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 4,
                    }}
                  >
                    <div>
                      <span
                        className="ca-mono"
                        style={{
                          display: "block",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          color: isToday ? "var(--terracotta-deep)" : "var(--ink-mute)",
                        }}
                      >
                        {DAY_LABELS[i]}
                      </span>
                      <span
                        className="ca-mono"
                        style={{
                          fontSize: 11,
                          color: isToday ? "var(--ink)" : "var(--ink-soft)",
                          fontWeight: isToday ? 600 : 400,
                        }}
                      >
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <button
                      onClick={() => openAdd(ds)}
                      title="Add workout"
                      style={{
                        background: "none",
                        border: "1px solid var(--rule-soft)",
                        color: "var(--ink-mute)",
                        borderRadius: 2,
                        width: 20,
                        height: 20,
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: "border-color 140ms, color 140ms",
                      }}
                      onMouseOver={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "var(--aegean-deep)";
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--aegean-soft)";
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "var(--ink-mute)";
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-soft)";
                      }}
                    >
                      +
                    </button>
                  </div>

                  {/* AI adjustments */}
                  {aiAdjustments.map((w) => (
                    <div
                      key={w.id}
                      style={{
                        padding: "0.5rem 0.625rem",
                        background: "var(--ochre-soft)",
                        border: "1px solid oklch(0.80 0.08 80)",
                        borderRadius: 2,
                      }}
                    >
                      <p
                        className="ca-eyebrow ca-eyebrow-terra"
                        style={{ fontSize: 8.5, marginBottom: 2 }}
                      >
                        ⚡ AI Adjustment
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--ink)",
                          margin: "0 0 3px",
                        }}
                      >
                        {w.title || w.session_type}
                      </p>
                      {w.duration_min && (
                        <p
                          className="ca-mono"
                          style={{ fontSize: 10, color: "var(--ink-mute)", margin: "0 0 5px" }}
                        >
                          {w.duration_min}min{w.distance_km ? ` · ${w.distance_km}km` : ""}
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 4 }}>
                        <TinyBtn onClick={() => handleApproveAI(w)} color="var(--aegean-deep)">
                          Approve
                        </TinyBtn>
                        <TinyBtn onClick={() => handleDelete(w.id)} color="var(--terracotta)">
                          Dismiss
                        </TinyBtn>
                      </div>
                    </div>
                  ))}

                  {/* Regular workouts */}
                  {regular.map((w) => {
                    const ss = STATUS_COLORS[w.status] ?? STATUS_COLORS.prescribed;
                    return (
                      <div
                        key={w.id}
                        style={{
                          padding: "0.5rem 0.625rem",
                          background: ss.bg,
                          border: `1px solid ${ss.border}`,
                          borderRadius: 2,
                          opacity: w.status === "missed" ? 0.6 : 1,
                        }}
                      >
                        <span
                          className={sessionChipClass(w.session_type)}
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            marginBottom: 3,
                            display: "inline-block",
                          }}
                        >
                          {w.session_type}
                        </span>

                        {w.title && (
                          <p
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--ink)",
                              margin: "2px 0",
                            }}
                          >
                            {w.title}
                          </p>
                        )}

                        <p
                          className="ca-mono"
                          style={{ fontSize: 9.5, color: "var(--ink-mute)", margin: 0 }}
                        >
                          {[
                            w.duration_min && `${w.duration_min}min`,
                            w.distance_km && `${w.distance_km}km`,
                            w.hr_zone && `Z${w.hr_zone}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        {w.coaching_notes && (
                          <p
                            style={{
                              fontSize: 10,
                              color: "var(--ink-mute)",
                              marginTop: 4,
                              paddingTop: 4,
                              borderTop: "1px dashed var(--rule-soft)",
                              fontStyle: "italic",
                            }}
                          >
                            {w.coaching_notes.slice(0, 70)}
                            {w.coaching_notes.length > 70 ? "…" : ""}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                          <TinyBtn
                            onClick={() => handleStatusToggle(w)}
                            color={w.status === "completed" ? "var(--ink-mute)" : "var(--aegean-deep)"}
                          >
                            {w.status === "completed" ? "Undo" : "Done"}
                          </TinyBtn>
                          <TinyBtn onClick={() => openEdit(w)} color="var(--aegean-deep)">
                            Edit
                          </TinyBtn>
                          <TinyBtn onClick={() => handleDelete(w.id)} color="var(--terracotta)">
                            ✕
                          </TinyBtn>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty */}
                  {dayWorkouts.length === 0 && (
                    <p
                      style={{
                        margin: "auto 0 0",
                        paddingTop: 12,
                        fontSize: 11,
                        color: "var(--rule)",
                        textAlign: "center",
                        fontStyle: "italic",
                        fontFamily: "var(--body)",
                      }}
                    >
                      Rest
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer ornament */}
        <div className="ca-ornament" style={{ marginTop: "2.5rem", paddingBottom: "1rem" }}>
          · · ·
        </div>
      </div>

      {/* Workout modal */}
      {showForm && (
        <WorkoutModal
          date={showForm}
          workout={editTarget}
          saving={saving}
          onClose={() => {
            setShowForm(null);
            setEditTarget(null);
          }}
          onSave={handleSave}
        />
      )}
    </main>
  );
}

// ── Tiny action button ─────────────────────────────────────────────────────

function TinyBtn({
  onClick,
  color,
  children,
}: {
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "1px solid var(--rule-soft)",
        borderRadius: 2,
        padding: "1px 7px",
        fontSize: 9.5,
        fontFamily: "var(--mono)",
        letterSpacing: "0.06em",
        cursor: "pointer",
        color: "var(--ink-mute)",
        transition: "color 140ms, border-color 140ms",
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.color = color;
        (e.currentTarget as HTMLElement).style.borderColor = color;
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--ink-mute)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--rule-soft)";
      }}
    >
      {children}
    </button>
  );
}

// ── Workout modal ──────────────────────────────────────────────────────────

function WorkoutModal({
  date,
  workout,
  saving,
  onClose,
  onSave,
}: {
  date: string;
  workout: Workout | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    session_type: workout?.session_type ?? "Easy Run",
    title: workout?.title ?? "",
    duration_min: workout?.duration_min?.toString() ?? "",
    distance_km: workout?.distance_km?.toString() ?? "",
    hr_zone: workout?.hr_zone ?? "",
    target_pace: workout?.target_pace ?? "",
    coaching_notes: workout?.coaching_notes ?? "",
    status: workout?.status ?? "prescribed",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const inputSt: React.CSSProperties = {
    padding: "7px 10px",
    background: "var(--parchment)",
    border: "1px solid var(--rule)",
    borderRadius: 2,
    fontSize: 13,
    color: "var(--ink)",
    fontFamily: "var(--body)",
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.25 0.02 60 / 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "1rem",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="ca-panel ca-rise"
        style={{
          width: "100%",
          maxWidth: 480,
          padding: "1.5rem",
          background: "var(--parchment)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <p
              className="ca-eyebrow ca-eyebrow-terra"
              style={{ marginBottom: 2 }}
            >
              {workout ? "Edit Workout" : "New Workout"}
            </p>
            <p
              className="ca-mono"
              style={{ fontSize: 11, color: "var(--ink-mute)", margin: 0 }}
            >
              {date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ca-btn ca-btn-ghost"
            style={{ padding: "4px 8px", fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        <hr className="ca-hairline" style={{ marginBottom: "1.25rem" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}
          >
            <MField label="Session Type">
              <select
                value={form.session_type}
                onChange={(e) => set("session_type", e.target.value)}
                style={inputSt}
              >
                {SESSION_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </MField>
            <MField label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                style={inputSt}
              >
                {["prescribed", "sent", "completed", "skipped", "missed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </MField>
          </div>

          <MField label="Title">
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Long easy ride"
              style={inputSt}
            />
          </MField>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}
          >
            <MField label="Duration (min)">
              <input
                type="number"
                value={form.duration_min}
                onChange={(e) => set("duration_min", e.target.value)}
                placeholder="60"
                style={inputSt}
              />
            </MField>
            <MField label="Distance (km)">
              <input
                type="number"
                step="0.1"
                value={form.distance_km}
                onChange={(e) => set("distance_km", e.target.value)}
                placeholder="10.0"
                style={inputSt}
              />
            </MField>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}
          >
            <MField label="HR Zone">
              <input
                value={form.hr_zone}
                onChange={(e) => set("hr_zone", e.target.value)}
                placeholder="2"
                style={inputSt}
              />
            </MField>
            <MField label="Target Pace">
              <input
                value={form.target_pace}
                onChange={(e) => set("target_pace", e.target.value)}
                placeholder="5:30/km"
                style={inputSt}
              />
            </MField>
          </div>

          <MField label="Coaching Notes">
            <textarea
              value={form.coaching_notes}
              onChange={(e) => set("coaching_notes", e.target.value)}
              placeholder="Keep it easy, focus on cadence…"
              rows={3}
              style={{ ...inputSt, resize: "vertical" }}
            />
          </MField>
        </div>

        <hr className="ca-hairline" style={{ margin: "1.25rem 0 1rem" }} />

        <div style={{ display: "flex", gap: "0.625rem" }}>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="ca-btn ca-btn-primary"
            style={{
              flex: 1,
              justifyContent: "center",
              padding: "9px",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : workout ? "Save Changes" : "Create Workout"}
          </button>
          <button
            onClick={onClose}
            className="ca-btn ca-btn-ghost"
            style={{ padding: "9px 18px" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 4,
          fontSize: 10,
          fontFamily: "var(--mono)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
