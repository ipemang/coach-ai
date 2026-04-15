"use client";

import { useState } from "react";
import type { Athlete, CurrentState } from "@/app/lib/types";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function readinessColor(score?: number): string {
  if (!score) return "text-slate-400";
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-amber-300";
  return "text-red-300";
}

function BiometricPill({ label, value, unit = "" }: { label: string; value: string | number | undefined; unit?: string }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5 text-center">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}{unit}</p>
    </div>
  );
}

function AthleteCard({ athlete }: { athlete: Athlete }) {
  const [expanded, setExpanded] = useState(false);
  const cs: CurrentState = athlete.current_state ?? {};

  const readiness = cs.oura_readiness_score ?? cs.last_readiness_score;
  const hrv = cs.oura_avg_hrv ?? cs.last_hrv;
  const sleep = cs.oura_sleep_score ?? cs.last_sleep_score;
  const ouraDate = cs.oura_sync_date;

  const initials = athlete.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const highFlags = (cs.predictive_flags ?? []).filter((f) => f.priority === "high");

  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:bg-white/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sm font-bold text-sky-300">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-white">{athlete.full_name}</p>
            <p className="text-xs text-slate-400">
              Last check-in: {timeAgo(athlete.last_checkin_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {(athlete.pending_suggestions ?? 0) > 0 && (
            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-300">
              {athlete.pending_suggestions} pending
            </span>
          )}
          {readiness !== undefined && (
            <span className={`text-sm font-bold ${readinessColor(readiness)}`}>
              {readiness}/100
            </span>
          )}
        </div>
      </div>

      {/* Biometrics row */}
      {(readiness !== undefined || hrv !== undefined || sleep !== undefined) && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <BiometricPill label="Readiness" value={readiness} unit="/100" />
          <BiometricPill label="HRV" value={hrv} unit="ms" />
          <BiometricPill label="Sleep" value={sleep} unit="/100" />
        </div>
      )}
      {ouraDate && (
        <p className="mt-1 text-right text-[10px] text-slate-600">Oura · {ouraDate}</p>
      )}

      {/* High-priority flags */}
      {highFlags.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-semibold text-red-300">⚠ Risk flags</p>
          {highFlags.map((f) => (
            <p key={f.code} className="mt-1 text-xs text-red-200">{f.label}</p>
          ))}
        </div>
      )}

      {/* Expand for more detail */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-slate-500 hover:text-sky-400 transition"
      >
        {expanded ? "▲ Less detail" : "▼ More detail"}
      </button>

      {expanded && (
        <dl className="mt-3 space-y-2 border-t border-white/5 pt-3 text-sm">
          {cs.training_phase && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Training phase</dt>
              <dd className="font-medium text-white capitalize">{cs.training_phase}{cs.training_week ? ` · week ${cs.training_week}` : ""}</dd>
            </div>
          )}
          {cs.soreness && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400 shrink-0">Soreness</dt>
              <dd className="text-right font-medium text-amber-200">{cs.soreness}</dd>
            </div>
          )}
          {cs.missed_workouts_this_week !== undefined && cs.missed_workouts_this_week > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Missed workouts</dt>
              <dd className="font-medium text-red-300">{cs.missed_workouts_this_week} this week</dd>
            </div>
          )}
          {cs.coach_notes && (
            <div className="flex flex-col gap-1">
              <dt className="text-slate-400">Coach notes</dt>
              <dd className="text-slate-200 italic">"{cs.coach_notes}"</dd>
            </div>
          )}
          {athlete.stable_profile?.target_race && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Target race</dt>
              <dd className="font-medium text-white">{athlete.stable_profile.target_race}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-400">Total check-ins</dt>
            <dd className="font-medium text-white">{athlete.total_checkins ?? 0}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}

export function AthleteRoster({ athletes }: { athletes: Athlete[] }) {
  return (
    <section className="rounded-3xl border border-line bg-surface/90 p-6 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between border-b border-line pb-5">
        <div>
          <p className="text-sm font-medium text-sky-300">Athlete Roster</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Your athletes</h2>
          <p className="mt-2 text-sm text-slate-300">{athletes.length} athlete{athletes.length !== 1 ? "s" : ""} · live data</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 max-h-[600px] overflow-y-auto pr-1">
        {athletes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-semibold text-white">No athletes yet</p>
            <p className="mt-1 text-sm text-slate-400">Athletes appear here once they onboard via WhatsApp or the web flow.</p>
          </div>
        ) : (
          athletes.map((a) => <AthleteCard key={a.id} athlete={a} />)
        )}
      </div>
    </section>
  );
}
