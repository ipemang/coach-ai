"use client";

import { useState } from "react";
import type { Workout } from "@/app/lib/types";

interface Props {
  workouts: Workout[];
  athleteId: string;
  coachId: string;
  weekStart: string;
  weekEnd: string;
}

const SESSION_TYPES = [
  "Easy Run", "Tempo Run", "Interval Run", "Long Run",
  "Easy Ride", "Tempo Ride", "Interval Ride", "Long Ride",
  "Swim Easy", "Swim Threshold", "Swim CSS",
  "Strength", "Recovery", "Rest", "Brick", "Race",
];

// Status → { bg, border, color } using mosaic tokens
const STATUS_STYLE: Record<string, { bg: string; border: string; color: string; label: string }> = {
  completed: {
    bg: "var(--aegean-wash)",
    border: "var(--aegean-soft)",
    color: "var(--aegean-deep)",
    label: "✓ Done",
  },
  missed: {
    bg: "var(--terracotta-soft)",
    border: "oklch(0.75 0.10 45)",
    color: "var(--terracotta-deep)",
    label: "✗ Missed",
  },
  prescribed: {
    bg: "var(--linen)",
    border: "var(--rule)",
    color: "var(--ink-soft)",
    label: "Prescribed",
  },
  pending: {
    bg: "var(--linen)",
    border: "var(--rule)",
    color: "var(--ink-mute)",
    label: "Pending",
  },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDayDates(weekStart: string): string[] {
  const start = new Date(weekStart + "T00:00:00");
  return DAYS.map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

const EMPTY_FORM = {
  session_type: "Easy Run",
  title: "",
  duration_min: "",
  distance_km: "",
  hr_zone: "",
  target_pace: "",
  coaching_notes: "",
  status: "prescribed",
};

export function AthleteWeeklyPlan({ workouts: initial, athleteId, coachId, weekStart, weekEnd }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const dayDates = getDayDates(weekStart);
  const today = new Date().toISOString().split("T")[0];

  function startEdit(w: Workout) {
    setEditingId(w.id);
    setAddingDate(null);
    setForm({
      session_type: w.session_type ?? "Easy Run",
      title: w.title ?? "",
      duration_min: w.duration_min?.toString() ?? "",
      distance_km: w.distance_km?.toString() ?? "",
      hr_zone: w.hr_zone ?? "",
      target_pace: w.target_pace ?? "",
      coaching_notes: w.coaching_notes ?? "",
      status: w.status ?? "prescribed",
    });
  }

  function startAdd(date: string) {
    setAddingDate(date);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function cancelForm() {
    setEditingId(null);
    setAddingDate(null);
    setForm(EMPTY_FORM);
  }

  async function saveEdit(workoutId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/workouts/${workoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: form.session_type,
          title: form.title,
          duration_min: form.duration_min ? parseInt(form.duration_min) : null,
          distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
          hr_zone: form.hr_zone || null,
          target_pace: form.target_pace || null,
          coaching_notes: form.coaching_notes || null,
          status: form.status,
        }),
      });
      if (res.ok) {
        const { workout } = await res.json();
        setWorkouts((ws) => ws.map((w) => (w.id === workoutId ? workout : w)));
        cancelForm();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveAdd(date: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          coach_id: coachId,
          scheduled_date: date,
          session_type: form.session_type,
          title: form.title,
          duration_min: form.duration_min ? parseInt(form.duration_min) : null,
          distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
          hr_zone: form.hr_zone || null,
          target_pace: form.target_pace || null,
          coaching_notes: form.coaching_notes || null,
        }),
      });
      if (res.ok) {
        const { workout } = await res.json();
        setWorkouts((ws) =>
          [...ws, workout].sort((a, b) =>
            a.scheduled_date.localeCompare(b.scheduled_date)
          )
        );
        cancelForm();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkout(workoutId: string) {
    if (!confirm("Delete this workout?")) return;
    await fetch(`/api/workouts/${workoutId}`, { method: "DELETE" });
    setWorkouts((ws) => ws.filter((w) => w.id !== workoutId));
  }

  async function markStatus(workoutId: string, status: string) {
    const res = await fetch(`/api/workouts/${workoutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const { workout } = await res.json();
      setWorkouts((ws) => ws.map((w) => (w.id === workoutId ? workout : w)));
    }
  }

  return (
    <div className="ca-panel" style={{ padding: "1.25rem 1.5rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
        }}
      >
        <span className="ca-eyebrow" style={{ fontSize: 11 }}>
          This Week
        </span>
        <span
          className="ca-mono"
          style={{ fontSize: 11, color: "var(--ink-mute)" }}
        >
          {weekStart} → {weekEnd}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {dayDates.map((date, i) => {
          const dayWorkouts = workouts.filter((w) => w.scheduled_date === date);
          const isToday = date === today;
          const isPast = date < today;
          const isAdding = addingDate === date;

          return (
            <div
              key={date}
              style={{
                border: isToday
                  ? "1px solid var(--terracotta)"
                  : "1px solid var(--rule-soft)",
                background: isToday ? "oklch(0.96 0.015 42 / 0.25)" : "var(--parchment)",
                borderRadius: 2,
                padding: "0.625rem 0.875rem",
              }}
            >
              {/* Day header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: dayWorkouts.length > 0 || isAdding ? "0.625rem" : 0,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    className="ca-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isToday ? "var(--terracotta-deep)" : "var(--ink-soft)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {DAYS[i]}
                  </span>
                  <span
                    className="ca-mono"
                    style={{ fontSize: 10, color: "var(--ink-mute)" }}
                  >
                    {date.slice(5)}
                  </span>
                  {isToday && (
                    <span className="ca-chip ca-chip-terra" style={{ padding: "1px 7px", fontSize: 9 }}>
                      Today
                    </span>
                  )}
                </div>
                <button
                  onClick={() => startAdd(date)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: "var(--ink-mute)",
                    letterSpacing: "0.06em",
                    padding: "2px 6px",
                    borderRadius: 2,
                    transition: "color 140ms",
                  }}
                  onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--aegean-deep)")}
                  onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--ink-mute)")}
                >
                  + Add
                </button>
              </div>

              {/* Existing workouts */}
              {dayWorkouts.map((w) => {
                const isEditingThis = editingId === w.id;
                const ss = STATUS_STYLE[w.status] ?? STATUS_STYLE.prescribed;

                return (
                  <div
                    key={w.id}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.625rem 0.875rem",
                      background: ss.bg,
                      border: `1px solid ${ss.border}`,
                      borderRadius: 2,
                    }}
                  >
                    {isEditingThis ? (
                      <WorkoutForm
                        form={form}
                        setForm={setForm}
                        onSave={() => saveEdit(w.id)}
                        onCancel={cancelForm}
                        saving={saving}
                      />
                    ) : (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ink)",
                                  fontFamily: "var(--body)",
                                }}
                              >
                                {w.session_type}
                              </span>
                              {w.title && (
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--ink-soft)",
                                    fontStyle: "italic",
                                  }}
                                >
                                  — {w.title}
                                </span>
                              )}
                            </div>
                            <div
                              className="ca-mono"
                              style={{
                                marginTop: 4,
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 8,
                                fontSize: 11,
                                color: "var(--ink-mute)",
                              }}
                            >
                              {w.duration_min && <span>{w.duration_min}min</span>}
                              {w.distance_km && <span>{w.distance_km}km</span>}
                              {w.hr_zone && <span>Zone {w.hr_zone}</span>}
                              {w.target_pace && <span>@ {w.target_pace}</span>}
                            </div>
                            {w.coaching_notes && (
                              <p
                                style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  color: "var(--ink-soft)",
                                  fontStyle: "italic",
                                  lineHeight: 1.5,
                                  margin: "6px 0 0",
                                }}
                              >
                                {w.coaching_notes}
                              </p>
                            )}
                          </div>

                          {/* Status chip */}
                          <span
                            className="ca-chip"
                            style={{
                              background: ss.bg,
                              borderColor: ss.border,
                              color: ss.color,
                              flexShrink: 0,
                              fontSize: 9.5,
                            }}
                          >
                            {ss.label}
                          </span>
                        </div>

                        {/* Action links */}
                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <ActionLink onClick={() => startEdit(w)}>Edit</ActionLink>
                          {w.status !== "completed" && (
                            <ActionLink
                              onClick={() => markStatus(w.id, "completed")}
                              hoverColor="var(--aegean-deep)"
                            >
                              Mark done
                            </ActionLink>
                          )}
                          {w.status !== "missed" && isPast && w.status !== "completed" && (
                            <ActionLink
                              onClick={() => markStatus(w.id, "missed")}
                              hoverColor="var(--terracotta-deep)"
                            >
                              Mark missed
                            </ActionLink>
                          )}
                          <ActionLink
                            onClick={() => deleteWorkout(w.id)}
                            hoverColor="var(--terracotta)"
                            style={{ marginLeft: "auto" }}
                          >
                            Delete
                          </ActionLink>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add form inline */}
              {isAdding && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.875rem",
                    background: "var(--aegean-wash)",
                    border: "1px solid var(--aegean-soft)",
                    borderRadius: 2,
                  }}
                >
                  <WorkoutForm
                    form={form}
                    setForm={setForm}
                    onSave={() => saveAdd(date)}
                    onCancel={cancelForm}
                    saving={saving}
                  />
                </div>
              )}

              {/* Empty day */}
              {dayWorkouts.length === 0 && !isAdding && (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 11,
                    color: "var(--ink-mute)",
                    fontStyle: "italic",
                    fontFamily: "var(--body)",
                  }}
                >
                  Rest / unscheduled
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionLink({
  onClick,
  hoverColor = "var(--ink)",
  children,
  style: extraStyle,
}: {
  onClick: () => void;
  hoverColor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "var(--mono)",
        letterSpacing: "0.05em",
        color: hover ? hoverColor : "var(--ink-mute)",
        padding: 0,
        transition: "color 140ms",
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

function WorkoutForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
}: {
  form: Record<string, string>;
  setForm: (fn: (f: Record<string, string>) => Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set =
    (key: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    background: "var(--parchment)",
    border: "1px solid var(--rule)",
    borderRadius: 2,
    fontSize: 12,
    color: "var(--ink)",
    fontFamily: "var(--body)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <FormField label="Type">
          <select value={form.session_type} onChange={set("session_type")} style={inputStyle}>
            {SESSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Status">
          <select value={form.status} onChange={set("status")} style={inputStyle}>
            {["prescribed", "completed", "missed", "pending"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Title (optional)">
        <input
          value={form.title}
          onChange={set("title")}
          placeholder="e.g. Lactate intervals"
          style={inputStyle}
        />
      </FormField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <FormField label="Duration (min)">
          <input type="number" value={form.duration_min} onChange={set("duration_min")} placeholder="60" style={inputStyle} />
        </FormField>
        <FormField label="Distance (km)">
          <input type="number" value={form.distance_km} onChange={set("distance_km")} placeholder="10" style={inputStyle} />
        </FormField>
        <FormField label="HR Zone">
          <input value={form.hr_zone} onChange={set("hr_zone")} placeholder="2" style={inputStyle} />
        </FormField>
      </div>

      <FormField label="Target Pace">
        <input value={form.target_pace} onChange={set("target_pace")} placeholder="e.g. 5:30/km" style={inputStyle} />
      </FormField>

      <FormField label="Coaching Notes">
        <textarea
          value={form.coaching_notes}
          onChange={set("coaching_notes")}
          rows={2}
          placeholder="Instructions for the athlete..."
          style={{ ...inputStyle, resize: "none" }}
        />
      </FormField>

      <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
        <button onClick={onCancel} className="ca-btn ca-btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}>
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="ca-btn ca-btn-primary"
          style={{ padding: "5px 16px", fontSize: 12, opacity: saving ? 0.5 : 1 }}
        >
          {saving ? "Saving…" : "Save Workout"}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
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
