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

export function AthleteSidebar({
  athlete,
  readiness: initialReadiness,
  hrv: initialHrv,
  sleep: initialSleep,
  ouraDate: initialOuraDate,
  hasOura: initialHasOura,
}: Props) {
  const cs = (athlete.current_state ?? {}) as Record<string, unknown>;
  const sp = (athlete.stable_profile ?? {}) as Record<string, unknown>;

  const [readiness, setReadiness] = useState(initialReadiness);
  const [hrv, setHrv] = useState(initialHrv);
  const [sleep, setSleep] = useState(initialSleep);
  const [ouraDate, setOuraDate] = useState(initialOuraDate);
  const [hasOura, setHasOura] = useState(initialHasOura);

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

      {/* Sync error */}
      {syncError && (
        <div
          style={{
            padding: "0.5rem 0.875rem",
            background: "var(--terracotta-soft)",
            border: "1px solid oklch(0.75 0.10 45)",
            borderRadius: 2,
            fontSize: 12,
            color: "var(--terracotta-deep)",
            fontFamily: "var(--mono)",
          }}
        >
          ⚠ Sync failed: {syncError}
        </div>
      )}

      {/* Biometrics */}
      {!!hasOura && (
        <div
          className="ca-panel"
          style={{
            padding: "1rem 1.125rem",
            borderLeft: "3px solid var(--ochre)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.875rem",
            }}
          >
            <span className="ca-eyebrow" style={{ fontSize: 10 }}>
              Biometrics
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {ouraDate && (
                <span
                  className="ca-mono"
                  style={{ fontSize: 10, color: "var(--ink-mute)" }}
                >
                  Oura · {ouraDate}
                </span>
              )}
              <button
                onClick={() => syncProvider("oura")}
                disabled={syncing === "oura"}
                className="ca-btn"
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  opacity: syncing === "oura" ? 0.45 : 1,
                }}
              >
                {syncing === "oura"
                  ? "Syncing…"
                  : syncSuccess === "oura"
                  ? "✓ Synced"
                  : "Sync"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "0.75rem",
            }}
          >
            {readiness !== undefined && (
              <BiometricTile
                label="Readiness"
                value={readiness}
                suffix="/100"
                color={
                  readiness >= 70
                    ? "var(--aegean-deep)"
                    : readiness >= 50
                    ? "var(--ochre)"
                    : "var(--terracotta)"
                }
              />
            )}
            {hrv !== undefined && (
              <BiometricTile label="HRV" value={Math.round(hrv)} suffix="ms" color="var(--aegean-deep)" />
            )}
            {sleep !== undefined && (
              <BiometricTile
                label="Sleep"
                value={sleep}
                suffix="/100"
                color={sleep >= 70 ? "var(--aegean-deep)" : "var(--ochre)"}
              />
            )}
            {readiness === undefined && hrv === undefined && sleep === undefined && (
              <p
                style={{
                  gridColumn: "1/-1",
                  fontSize: 11,
                  color: "var(--ink-mute)",
                  fontStyle: "italic",
                }}
              >
                No Oura data yet — hit Sync to fetch.
              </p>
            )}
          </div>

          {highFlags.length > 0 && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.5rem 0.75rem",
                background: "var(--terracotta-soft)",
                border: "1px solid oklch(0.75 0.10 45)",
                borderRadius: 2,
              }}
            >
              <p style={{ fontSize: 11, color: "var(--terracotta-deep)", margin: 0, fontFamily: "var(--body)" }}>
                ⚠ {highFlags.map((f) => f.label).join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Strava last activity */}
      {!!stravaType && (
        <div
          className="ca-panel"
          style={{
            padding: "1rem 1.125rem",
            borderLeft: "3px solid var(--terracotta)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.75rem",
            }}
          >
            <span className="ca-eyebrow ca-eyebrow-terra" style={{ fontSize: 10 }}>
              Last Activity
            </span>
            <button
              onClick={() => syncProvider("strava")}
              disabled={syncing === "strava"}
              className="ca-btn"
              style={{
                padding: "2px 8px",
                fontSize: 10,
                opacity: syncing === "strava" ? 0.45 : 1,
              }}
            >
              {syncing === "strava"
                ? "Syncing…"
                : syncSuccess === "strava"
                ? "✓ Synced"
                : "Sync"}
            </button>
          </div>

          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
            {stravaType}
          </p>
          <div
            className="ca-mono"
            style={{
              marginTop: 4,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              fontSize: 11,
              color: "var(--ink-mute)",
            }}
          >
            {stravaDate && <span>{stravaDate}</span>}
            {stravaKm != null && <span>{stravaKm}km</span>}
            {stravaDur != null && <span>{stravaDur}min</span>}
            {stravaHr != null && <span>avg {stravaHr}bpm</span>}
          </div>
        </div>
      )}

      {/* Athlete Profile */}
      <div className="ca-panel" style={{ padding: "1rem 1.125rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <span className="ca-eyebrow" style={{ fontSize: 10 }}>
            Profile
          </span>
          <EditToggle
            editing={editingProfile}
            onToggle={() => setEditingProfile((v) => !v)}
          />
        </div>

        {editingProfile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { key: "target_race", label: "Target Race", placeholder: "e.g. Ironman 70.3 Eagleman" },
              { key: "race_date", label: "Race Date", placeholder: "e.g. June 15 2026" },
              { key: "max_weekly_hours", label: "Max Weekly Hours", placeholder: "e.g. 12" },
              { key: "swim_css", label: "Swim CSS", placeholder: "e.g. 1:45/100m" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 3,
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                  }}
                >
                  {label}
                </label>
                <input
                  value={profileForm[key as keyof typeof profileForm]}
                  onChange={(e) =>
                    setProfileForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                  style={inputStyle}
                />
              </div>
            ))}

            {[
              { key: "injury_history", label: "Injury History", placeholder: "Past injuries, recurring issues…" },
              { key: "notes", label: "Notes", placeholder: "Athlete notes…" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 3,
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                  }}
                >
                  {label}
                </label>
                <textarea
                  value={profileForm[key as keyof typeof profileForm]}
                  onChange={(e) =>
                    setProfileForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  rows={2}
                  placeholder={placeholder}
                  style={{ ...inputStyle, resize: "none" }}
                />
              </div>
            ))}

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="ca-btn ca-btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                padding: "7px",
                fontSize: 12,
                opacity: savingProfile ? 0.5 : 1,
              }}
            >
              {savingProfile ? "Saving…" : profileSaved ? "✓ Saved" : "Save Profile"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ProfileRow label="Race" value={sp.target_race as string} />
            <ProfileRow label="Race date" value={sp.race_date as string} />
            <ProfileRow label="Max hrs/wk" value={sp.max_weekly_hours?.toString()} />
            <ProfileRow label="Swim CSS" value={sp.swim_css as string} />
            <ProfileRow label="Injuries" value={sp.injury_history as string} />
            <ProfileRow label="Phase" value={cs.training_phase as string} />
            <ProfileRow
              label="Disciplines"
              value={
                Array.isArray(sp.disciplines)
                  ? (sp.disciplines as string[]).join(", ")
                  : (sp.disciplines as string)
              }
            />
          </div>
        )}
      </div>

      {/* Coach Notes */}
      <div className="ca-panel" style={{ padding: "1rem 1.125rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <span className="ca-eyebrow" style={{ fontSize: 10 }}>
            Coach Notes
          </span>
          <EditToggle
            editing={editingNotes}
            onToggle={() => setEditingNotes((v) => !v)}
          />
        </div>

        {editingNotes ? (
          <div>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              rows={4}
              placeholder="Private notes about this athlete…"
              style={{ ...inputStyle, resize: "none" }}
              autoFocus
            />
            <button
              onClick={saveCoachNotes}
              disabled={savingNotes}
              className="ca-btn ca-btn-primary"
              style={{
                marginTop: 8,
                width: "100%",
                justifyContent: "center",
                padding: "7px",
                fontSize: 12,
                opacity: savingNotes ? 0.5 : 1,
              }}
            >
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        ) : (
          <p
            style={{
              fontSize: 12,
              color: coachNotes ? "var(--ink-soft)" : "var(--ink-mute)",
              fontStyle: coachNotes ? "normal" : "italic",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              margin: 0,
            }}
          >
            {coachNotes || "No notes yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function BiometricTile({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: number;
  suffix: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <p
        className="ca-num"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color,
          margin: 0,
          lineHeight: 1,
        }}
      >
        {value}
        <span style={{ fontSize: 10, fontWeight: 400, color: "var(--ink-mute)" }}>
          {suffix}
        </span>
      </p>
      <p
        className="ca-mono"
        style={{ fontSize: 9.5, color: "var(--ink-mute)", marginTop: 3 }}
      >
        {label}
      </p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span
        className="ca-mono"
        style={{
          fontSize: 10,
          color: "var(--ink-mute)",
          width: 72,
          flexShrink: 0,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          paddingTop: 1,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

function EditToggle({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "var(--mono)",
        letterSpacing: "0.08em",
        color: "var(--ink-mute)",
        padding: "2px 6px",
        borderRadius: 2,
        transition: "color 140ms",
      }}
      onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--aegean-deep)")}
      onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--ink-mute)")}
    >
      {editing ? "Cancel" : "Edit"}
    </button>
  );
}
