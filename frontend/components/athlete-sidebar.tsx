"use client";

import { useState } from "react";
import type { Athlete } from "@/app/lib/types";

interface Props {
  athlete: Athlete;
  readiness?: number;
  hrv?: number;
  sleep?: number;
  ouraDate?: string;
  hasOura: boolean;
}

export function AthleteSidebar({ athlete, readiness, hrv, sleep, ouraDate, hasOura }: Props) {
  const cs = (athlete.current_state ?? {}) as Record<string, unknown>;
  const sp = (athlete.stable_profile ?? {}) as Record<string, unknown>;

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    target_race: (sp.target_race as string) ?? "",
    race_date: (sp.race_date as string) ?? "",
    injury_history: (sp.injury_history as string) ?? "",
    notes: (sp.notes as string) ?? "",
    max_weekly_hours: (sp.max_weekly_hours as string | number)?.toString() ?? "",
    swim_css: (sp.swim_css as string) ?? "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [editingNotes, setEditingNotes] = useState(false);
  const [coachNotes, setCoachNotes] = useState((cs.coach_notes as string) ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/athletes/${athlete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stable_profile: profileForm }),
      });
      if (res.ok) {
        setEditingProfile(false);
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCoachNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/athletes/${athlete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_state: { ...cs, coach_notes: coachNotes } }),
      });
      if (res.ok) setEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
  }

  const flags = (cs.predictive_flags as Array<{ label: string; priority: string }>) ?? [];
  const highFlags = flags.filter((f) => f.priority === "high");

  return (
    <div className="space-y-4">

      {/* Biometrics */}
      {hasOura && (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-widest">Biometrics</h3>
            {ouraDate && <span className="text-xs text-slate-500">Oura · {ouraDate}</span>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {readiness !== undefined && (
              <Biometric
                label="Readiness"
                value={readiness}
                suffix="/100"
                color={readiness >= 70 ? "text-emerald-300" : readiness >= 50 ? "text-amber-300" : "text-red-300"}
              />
            )}
            {hrv !== undefined && (
              <Biometric label="HRV" value={Math.round(hrv)} suffix="ms" color="text-sky-300" />
            )}
            {sleep !== undefined && (
              <Biometric
                label="Sleep"
                value={sleep}
                suffix="/100"
                color={sleep >= 70 ? "text-emerald-300" : "text-amber-300"}
              />
            )}
          </div>
          {highFlags.length > 0 && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-xs font-medium text-red-300">⚠ {highFlags.map((f) => f.label).join(", ")}</p>
            </div>
          )}
        </div>
      )}

      {/* Strava last activity */}
      {cs.strava_last_activity_type && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <h3 className="text-xs font-semibold text-orange-300 uppercase tracking-widest mb-3">Last Activity</h3>
          <p className="text-sm text-white font-medium">
            {cs.strava_last_activity_type as string}
          </p>
          <div className="mt-1 flex gap-3 text-xs text-slate-400 flex-wrap">
            {cs.strava_last_activity_date && <span>{cs.strava_last_activity_date as string}</span>}
            {cs.strava_last_distance_km && <span>{cs.strava_last_distance_km as number}km</span>}
            {cs.strava_last_duration_min && <span>{cs.strava_last_duration_min as number}min</span>}
            {cs.strava_last_avg_hr && <span>avg {cs.strava_last_avg_hr as number}bpm</span>}
          </div>
        </div>
      )}

      {/* Athlete Profile */}
      <div className="rounded-2xl border border-line bg-surface/90 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white uppercase tracking-widest">Profile</h3>
          <button
            onClick={() => setEditingProfile((v) => !v)}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            {editingProfile ? "Cancel" : "Edit"}
          </button>
        </div>

        {editingProfile ? (
          <div className="space-y-2">
            {[
              { key: "target_race", label: "Target Race", placeholder: "e.g. Ironman 70.3 Eagleman" },
              { key: "race_date", label: "Race Date", placeholder: "e.g. June 15 2026" },
              { key: "max_weekly_hours", label: "Max Weekly Hours", placeholder: "e.g. 12" },
              { key: "swim_css", label: "Swim CSS", placeholder: "e.g. 1:45/100m" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                <input
                  value={profileForm[key as keyof typeof profileForm]}
                  onChange={(e) => setProfileForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Injury History</label>
              <textarea
                value={profileForm.injury_history}
                onChange={(e) => setProfileForm((f) => ({ ...f, injury_history: e.target.value }))}
                rows={2}
                placeholder="Past injuries, recurring issues..."
                className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600 resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <textarea
                value={profileForm.notes}
                onChange={(e) => setProfileForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Athlete notes..."
                className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-white placeholder:text-slate-600 resize-none"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="w-full rounded-xl bg-indigo-500/20 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 transition"
            >
              {savingProfile ? "Saving…" : profileSaved ? "✓ Saved" : "Save Profile"}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <ProfileRow label="Race" value={sp.target_race as string} />
            <ProfileRow label="Race date" value={sp.race_date as string} />
            <ProfileRow label="Max hours/wk" value={sp.max_weekly_hours?.toString()} />
            <ProfileRow label="Swim CSS" value={sp.swim_css as string} />
            <ProfileRow label="Injuries" value={sp.injury_history as string} />
            <ProfileRow label="Training phase" value={cs.training_phase as string} />
            <ProfileRow label="Disciplines" value={
              Array.isArray(sp.disciplines)
                ? (sp.disciplines as string[]).join(", ")
                : (sp.disciplines as string)
            } />
          </div>
        )}
      </div>

      {/* Coach Notes */}
      <div className="rounded-2xl border border-line bg-surface/90 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white uppercase tracking-widest">Coach Notes</h3>
          <button
            onClick={() => setEditingNotes((v) => !v)}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            {editingNotes ? "Cancel" : "Edit"}
          </button>
        </div>
        {editingNotes ? (
          <div>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              rows={4}
              placeholder="Private notes about this athlete..."
              className="w-full rounded-lg border border-line bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-600 resize-none"
              autoFocus
            />
            <button
              onClick={saveCoachNotes}
              disabled={savingNotes}
              className="mt-2 w-full rounded-xl bg-indigo-500/20 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40 transition"
            >
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
            {coachNotes || <span className="italic text-slate-600">No notes yet.</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function Biometric({ label, value, suffix, color }: {
  label: string; value: number; suffix: string; color: string;
}) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}<span className="text-xs font-normal text-slate-500">{suffix}</span></p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-xs text-slate-300 leading-relaxed">{value}</span>
    </div>
  );
}
