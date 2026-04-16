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

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  missed: "bg-red-500/15 text-red-300 border-red-500/20",
  prescribed: "bg-white/5 text-slate-300 border-line",
  pending: "bg-white/5 text-slate-300 border-line",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "✓ Done",
  missed: "✗ Missed",
  prescribed: "Prescribed",
  pending: "Pending",
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
        setWorkouts((ws) => [...ws, workout].sort((a, b) =>
          a.scheduled_date.localeCompare(b.scheduled_date)
        ));
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
    <div className="rounded-2xl border border-line bg-surface/90 p-5 shadow-panel">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-widest">This Week</h2>
        <span className="text-xs text-slate-500">{weekStart} → {weekEnd}</span>
      </div>

      <div className="space-y-2">
        {dayDates.map((date, i) => {
          const dayWorkouts = workouts.filter((w) => w.scheduled_date === date);
          const isToday = date === today;
          const isPast = date < today;
          const isAdding = addingDate === date;

          return (
            <div key={date} className={`rounded-xl border ${isToday ? "border-sky-500/30 bg-sky-500/5" : "border-line bg-white/[0.02]"} p-3`}>
              {/* Day header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${isToday ? "text-sky-300" : "text-slate-400"}`}>
                    {DAYS[i]}
                  </span>
                  <span className="text-xs text-slate-600">{date.slice(5)}</span>
                  {isToday && <span className="text-xs rounded-full bg-sky-500/20 px-2 py-0.5 text-sky-300">Today</span>}
                </div>
                <button
                  onClick={() => startAdd(date)}
                  className="text-xs text-slate-500 hover:text-indigo-300 transition"
                >
                  + Add
                </button>
              </div>

              {/* Existing workouts */}
              {dayWorkouts.map((w) => {
                const isEditingThis = editingId === w.id;
                const style = STATUS_STYLES[w.status] ?? STATUS_STYLES.prescribed;

                return (
                  <div key={w.id} className={`mt-2 rounded-lg border p-3 ${style}`}>
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
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{w.session_type}</span>
                              {w.title && <span className="text-xs text-slate-400">— {w.title}</span>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                              {w.duration_min && <span>{w.duration_min}min</span>}
                              {w.distance_km && <span>{w.distance_km}km</span>}
                              {w.hr_zone && <span>Zone {w.hr_zone}</span>}
                              {w.target_pace && <span>@ {w.target_pace}</span>}
                            </div>
                            {w.coaching_notes && (
                              <p className="mt-1.5 text-xs text-slate-400 italic leading-relaxed">
                                {w.coaching_notes}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`rounded-full px-2 py-0.5 text-xs border ${style}`}>
                              {STATUS_LABELS[w.status] ?? w.status}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            onClick={() => startEdit(w)}
                            className="text-xs text-slate-500 hover:text-white transition"
                          >
                            Edit
                          </button>
                          {w.status !== "completed" && (
                            <button
                              onClick={() => markStatus(w.id, "completed")}
                              className="text-xs text-slate-500 hover:text-emerald-300 transition"
                            >
                              Mark done
                            </button>
                          )}
                          {w.status !== "missed" && isPast && w.status !== "completed" && (
                            <button
                              onClick={() => markStatus(w.id, "missed")}
                              className="text-xs text-slate-500 hover:text-red-300 transition"
                            >
                              Mark missed
                            </button>
                          )}
                          <button
                            onClick={() => deleteWorkout(w.id)}
                            className="text-xs text-slate-600 hover:text-red-400 transition ml-auto"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add form inline */}
              {isAdding && (
                <div className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
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
                <p className="text-xs text-slate-600 italic mt-1">Rest / unscheduled</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Type</label>
          <select
            value={form.session_type}
            onChange={set("session_type")}
            className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white"
          >
            {SESSION_TYPES.map((t) => (
              <option key={t} value={t} className="bg-[#0f1117]">{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Status</label>
          <select
            value={form.status}
            onChange={set("status")}
            className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white"
          >
            {["prescribed", "completed", "missed", "pending"].map((s) => (
              <option key={s} value={s} className="bg-[#0f1117]">{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Title (optional)</label>
        <input
          value={form.title}
          onChange={set("title")}
          placeholder="e.g. Lactate intervals"
          className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Duration (min)</label>
          <input type="number" value={form.duration_min} onChange={set("duration_min")}
            placeholder="60"
            className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Distance (km)</label>
          <input type="number" value={form.distance_km} onChange={set("distance_km")}
            placeholder="10"
            className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">HR Zone</label>
          <input value={form.hr_zone} onChange={set("hr_zone")}
            placeholder="2"
            className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600" />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Target Pace</label>
        <input value={form.target_pace} onChange={set("target_pace")}
          placeholder="e.g. 5:30/km"
          className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600" />
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Coaching Notes</label>
        <textarea value={form.coaching_notes} onChange={set("coaching_notes")}
          rows={2} placeholder="Instructions for the athlete..."
          className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600 resize-none" />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white transition">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving}
          className="rounded-lg bg-indigo-500/20 px-4 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 transition">
          {saving ? "Saving…" : "Save Workout"}
        </button>
      </div>
    </div>
  );
}
