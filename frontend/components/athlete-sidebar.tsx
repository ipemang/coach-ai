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

export function AthleteSidebar({ athlete, readiness: initialReadiness, hrv: initialHrv, sleep: initialSleep, ouraDate: initialOuraDate, hasOura: initialHasOura }: Props) {
  const cs = (athlete.current_state ?? {}) as Record<string, unknown>;
  const sp = (athlete.stable_profile ?? {}) as Record<string, unknown>;

  // Local state for biometrics so sync updates reflect immediately without a page reload
  const [readiness, setReadiness] = useState(initialReadiness);
  const [hrv, setHrv] = useState(initialHrv);
  const [sleep, setSleep] = useState(initialSleep);
  const [ouraDate, setOuraDate] = useState(initialOuraDate);
  const [hasOura, setHasOura] = useState(initialHasOura);

  // Strava local state
  const [stravaType, setStravaType] = useState(cs.strava_last_activity_type as string | undefined);
  const [stravaDate, setStravaDate] = useState(cs.strava_last_activity_date as string | undefined);
  const [stravaKm, setStravaKm] = useState(cs.strava_last_distance_km as number | undefined);
  const [stravaDur, setStravaDur] = useState(cs.strava_last_duration_min as number | undefined);
  const [stravaHr, setStravaHr] = useState(cs.strava_last_avg_hr as number | undefined);

  const [syncing, setSyncing] = useState<"oura" | "strava" | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<"oura" | "strava" | null>(null);

  async function syncProvider(provider: "oura" | "strava") {
    setSyncing(provider);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const res = await fetch(`/api/athletes/${athlete.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error ?? "Sync failed");
        return;
      }
      if (provider === "oura" && data.oura) {
        const o = data.oura;
        if (o.oura_readiness_score != null) setReadiness(o.oura_readiness_score);
        if (o.oura_avg_hrv != null) setHrv(o.oura_avg_hrv);
        if (o.oura_sleep_score != null) setSleep(o.oura_sleep_score);
        if (o.oura_sync_date) setOuraDate(o.oura_sync_date);
        setHasOura(true);
      }
      if (provider === "strava" && data.strava) {
        const s = data.strava;
        if (s.strava_last_activity_type) setStravaType(s.strava_last_activity_type);
        if (s.strava_last_activity_date) setStravaDate(s.strava_last_activity_date);
        if (s.strava_last_distance_km != null) setStravaKm(s.strava_last_distance_km);
        if (s.strava_last_duration_min != null) setStravaDur(s.strava_last_duration_min);
        if (s.strava_last_avg_hr != null) setStravaHr(s.strava_last_avg_hr);
      }
      setSyncSuccess(provider);
      setTimeout(() => setSyncSuccess(null), 3000);
    } finally {
      setSyncing(null);
    }
  }

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

      {/* Sync error */}
      {syncError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          ⚠ Sync failed: {syncError}
        </div>
      )}

      {/* Biometrics — show panel if athlete has Oura token (even without data yet) */}
      {!!hasOura && (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-widest">Biometrics</h3>
            <div className="flex items-center gap-2">
              {ouraDate && <span className="text-xs text-slate-500">Oura · {ouraDate}</span>}
              <button
                onClick={() => syncProvider("oura")}
                disabled={syncing === "oura"}
                className="rounded-lg bg-purple-500/15 px-2 py-1 text-[10px] font-medium text-purple-300 hover:bg-purple-500/25 disabled:opacity-40 transition"
              >
                {syncing === "oura" ? "Syncing…" : syncSuccess === "oura" ? "✓ Synced" : "Sync"}
              </button>
            </div>
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
            {readiness === undefined && hrv === undefined && sleep === undefined && (
              <p className="col-span-3 text-xs text-slate-500 italic">No Oura data yet — hit Sync to fetch.</p>
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
      {!!stravaType && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-orange-300 uppercase tracking-widest">Last Activity</h3>
            <button
              onClick={() => syncProvider("strava")}
              disabled={syncing === "strava"}
              className="rounded-lg bg-orange-500/15 px-2 py-1 text-[10px] font-medium text-orange-300 hover:bg-orange-500/25 disabled:opacity-40 transition"
            >
              {syncing === "strava" ? "Syncing…" : syncSuccess === "strava" ? "✓ Synced" : "Sync"}
            </button>
          </div>
          <p className="text-sm text-white font-medium">{stravaType}</p>
          <div className="mt-1 flex gap-3 text-xs text-slate-400 flex-wrap">
            {stravaDate && <span>{stravaDate}</span>}
            {stravaKm != null && <span>{stravaKm}km</span>}
            {stravaDur != null && <span>{stravaDur}min</span>}
            {stravaHr != null && <span>avg {stravaHr}bpm</span>}
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
