"use client";

import { useState, useEffect } from "react";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = typeof DAYS[number];
const DAY_LABELS: Record<Day, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Bogota", "America/Mexico_City", "America/Lima",
  "Europe/London", "Europe/Madrid", "UTC",
];

interface OfficeHoursState {
  timezone: string;
  mon?: string[];
  tue?: string[];
  wed?: string[];
  thu?: string[];
  fri?: string[];
  sat?: string[];
  sun?: string[];
  ai_autonomy_override: boolean;
  office_hours_enabled: boolean; // COA-123: master toggle
  is_currently_autonomous: boolean;
}

const DEFAULT_STATE: OfficeHoursState = {
  timezone: "America/New_York",
  mon: ["09:00", "18:00"],
  tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"],
  thu: ["09:00", "18:00"],
  fri: ["09:00", "17:00"],
  ai_autonomy_override: false,
  office_hours_enabled: false,
  is_currently_autonomous: false,
};

export function OfficeHoursPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OfficeHoursState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/office-hours")
      .then((r) => {
        if (!r.ok) throw new Error(`Office hours load failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (data.office_hours) {
          setState({
            timezone: data.office_hours.timezone || "America/New_York",
            mon: data.office_hours.mon,
            tue: data.office_hours.tue,
            wed: data.office_hours.wed,
            thu: data.office_hours.thu,
            fri: data.office_hours.fri,
            sat: data.office_hours.sat,
            sun: data.office_hours.sun,
            ai_autonomy_override: data.ai_autonomy_override ?? false,
            office_hours_enabled: data.office_hours_enabled ?? false,
            is_currently_autonomous: data.is_currently_autonomous ?? false,
          });
        } else {
          setState((s) => ({
            ...s,
            ai_autonomy_override: data.ai_autonomy_override ?? false,
            office_hours_enabled: data.office_hours_enabled ?? false,
            is_currently_autonomous: data.is_currently_autonomous ?? false,
          }));
        }
      })
      // M7: Previously .catch(() => {}) silently swallowed load errors.
      // Coach would see stale defaults with no indication data failed to load.
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load office hours"))
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(day: Day) {
    setState((s) => ({ ...s, [day]: s[day] ? undefined : ["09:00", "18:00"] }));
  }

  function updateTime(day: Day, index: 0 | 1, value: string) {
    setState((s) => {
      const current = s[day] ? [...(s[day] as string[])] : ["09:00", "18:00"];
      current[index] = value;
      return { ...s, [day]: current };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        timezone: state.timezone,
        ai_autonomy_override: state.ai_autonomy_override,
        office_hours_enabled: state.office_hours_enabled,
        ...Object.fromEntries(DAYS.filter((d) => state[d]).map((d) => [d, state[d]])),
      };
      const res = await fetch("/api/office-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOverride() {
    const next = !state.ai_autonomy_override;
    setState((s) => ({ ...s, ai_autonomy_override: next }));
    try {
      await fetch("/api/office-hours/toggle", { method: "POST" });
    } catch {
      setState((s) => ({ ...s, ai_autonomy_override: !next }));
    }
  }

  const isAutonomous = state.ai_autonomy_override || state.is_currently_autonomous;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
          isAutonomous
            ? "bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
            : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
        }`}
      >
        <span>{isAutonomous ? "🤖" : "🟢"}</span>
        <span>{isAutonomous ? "AI Autonomous" : "Coach Online"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-line bg-[#0f1117] p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Office Hours</h3>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-lg leading-none">×</button>
          </div>

          {/* COA-123: Enable Schedule toggle */}
          <div className="mb-3 flex items-center justify-between rounded-xl border border-line bg-white/5 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-white">Enable Schedule</p>
              <p className="text-xs text-slate-400">Enforce office hours window</p>
            </div>
            <button
              onClick={() => setState((s) => ({ ...s, office_hours_enabled: !s.office_hours_enabled }))}
              className={`relative h-6 w-11 rounded-full transition-colors ${state.office_hours_enabled ? "bg-indigo-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${state.office_hours_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* AI Fully On toggle */}
          <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-white/5 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-white">AI Fully On</p>
              <p className="text-xs text-slate-400">Override hours — AI handles everything</p>
            </div>
            <button
              onClick={toggleOverride}
              className={`relative h-6 w-11 rounded-full transition-colors ${state.ai_autonomy_override ? "bg-sky-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${state.ai_autonomy_override ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Timezone */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-slate-400">Timezone</label>
            <select
              value={state.timezone}
              onChange={(e) => setState((s) => ({ ...s, timezone: e.target.value }))}
              className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white"
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz} className="bg-[#0f1117]">{tz}</option>)}
            </select>
          </div>

          {/* Day rows — dimmed when schedule disabled */}
          <div className={`space-y-2 ${state.office_hours_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            {DAYS.map((day) => {
              const active = !!state[day];
              const hours = state[day] as string[] | undefined;
              return (
                <div key={day} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleDay(day)}
                    className={`w-10 shrink-0 rounded-md px-1 py-1 text-xs font-medium transition ${active ? "bg-indigo-500/30 text-indigo-300" : "bg-white/5 text-slate-500"}`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                  {active && hours ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <input type="time" value={hours[0]} onChange={(e) => updateTime(day, 0, e.target.value)} className="flex-1 rounded-md border border-line bg-white/5 px-1.5 py-1 text-xs text-white" />
                      <span className="text-xs text-slate-500">–</span>
                      <input type="time" value={hours[1]} onChange={(e) => updateTime(day, 1, e.target.value)} className="flex-1 rounded-md border border-line bg-white/5 px-1.5 py-1 text-xs text-white" />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">AI autonomous</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button onClick={save} disabled={saving} className="flex-1 rounded-xl bg-indigo-500/20 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/30 disabled:opacity-40">
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
