"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/app/lib/supabase";
import type { Athlete, Suggestion, StableProfile, CurrentState, PredictiveFlag } from "@/app/lib/types";

// ─── Extended types ───────────────────────────────────────────────────────────

type WeekWorkout = {
  scheduled_date: string;
  status: string;
  distance_km: number | null;
};

type BiometricBaseline = {
  readiness_avg: number | null;
  hrv_avg: number | null;
  sleep_avg: number | null;
};

type EnrichedAthlete = Athlete & {
  pending_suggestions?: number;
  total_checkins?: number;
  last_checkin_at?: string | null;
  week_workouts?: WeekWorkout[];
  biometric_baseline?: BiometricBaseline | null;  // COA-101
};

type Tab = "roster" | "queue" | "media" | "officehours";
type Filter = "all" | "watch" | "race" | "pending";

interface OfficeHoursData {
  office_hours: Record<string, unknown> | null;
  ai_autonomy_override: boolean;
  is_currently_autonomous: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getProfile(a: EnrichedAthlete) {
  const sp = a.stable_profile as StableProfile | null | undefined;
  const cs = a.current_state as CurrentState | null | undefined;

  // Compute weeks to race from race_date (stable_profile has the event date)
  let weeksToRace = 99;
  if (sp?.race_date) {
    const diff = Math.ceil(
      (new Date(sp.race_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000),
    );
    weeksToRace = diff > 0 ? diff : 0;
  }

  return {
    // Biometrics — live from current_state (Oura sync)
    readiness:    (cs?.oura_readiness_score ?? null) as number | null,
    hrv:          cs?.oura_avg_hrv != null ? String(Math.round(cs.oura_avg_hrv)) : "—",
    sleep:        cs?.oura_sleep_score != null ? String(cs.oura_sleep_score) : "—",
    // Load proxy — last Strava activity distance if available
    load:         cs?.strava_last_distance_km != null ? `${cs.strava_last_distance_km}km` : "—",
    // Training phase / week — live from current_state
    phase:        cs?.training_phase ?? "General",
    week:         (cs?.training_week ?? null) as number | null,
    // Race info — stable (coach-set targets don't change daily)
    target_race:  sp?.target_race ?? "No race set",
    weeks_to_race: weeksToRace,
    // Notes — coach notes from current_state, fallback to stable profile notes
    notes:        cs?.coach_notes ?? sp?.notes ?? null,
    // AI urgency flags
    predictive_flags: (cs?.predictive_flags ?? []) as PredictiveFlag[],
  };
}

// COA-101: Biometric delta vs. 30-day personal baseline
function BioDelta({ current, avg }: { current: number | null; avg: number | null }) {
  if (current === null || avg === null || avg === 0) return null;
  const pct = Math.round(((current - avg) / avg) * 100);
  const abs = Math.abs(pct);
  if (abs < 5) return null; // within noise — don't show
  const down = pct < 0;
  const severe = abs > 15;
  const color = down ? (severe ? "var(--terracotta-deep)" : "var(--ochre)") : "var(--aegean-deep)";
  return (
    <div style={{ fontSize: 9, color, fontFamily: "var(--mono)", lineHeight: 1, marginTop: 2 }}
         title={`30-day avg: ${avg}. Today: ${current}. ${down ? "Below" : "Above"} baseline.`}>
      {down ? "↓" : "↑"} {abs}%
    </div>
  );
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function buildWeekData(workouts: WeekWorkout[] = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay(); // 0=Sun
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1; // Mon=0 … Sun=6

  // Index workouts by date string
  const byDate: Record<string, { km: number; type: string }> = {};
  for (const w of workouts) {
    const date = w.scheduled_date.split("T")[0];
    if (!byDate[date]) byDate[date] = { km: 0, type: "" };
    byDate[date].km += w.distance_km ?? 0;
    const wDate = new Date(date + "T12:00:00");
    const isToday = wDate.toDateString() === today.toDateString();
    const isPast = wDate < today;
    if (isToday) {
      byDate[date].type = w.status === "completed" ? "done" : "planned today";
    } else if (isPast) {
      byDate[date].type = w.status === "completed" ? "done" : "missed";
    } else {
      byDate[date].type = "planned";
    }
  }

  return DAY_LABELS.map((day, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - todayIdx + i);
    const dateStr = d.toISOString().split("T")[0];
    const entry = byDate[dateStr];
    return {
      day,
      type: entry?.type ?? "",
      km: entry?.km ?? 0,
    };
  });
}

// ─── SVG Glyphs ───────────────────────────────────────────────────────────────

const G = {
  Column: ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M6 4 L18 4 L18 6 L6 6 Z" />
      <path d="M7 6 L7 18 M17 6 L17 18 M10 6 L10 18 M14 6 L14 18" />
      <path d="M5 18 L19 18 L19 20 L5 20 Z" />
    </svg>
  ),
  Scroll: ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M5 4 C 5 4, 5 8, 8 8 L19 8 L19 18 C 19 20, 17 20, 17 20 L6 20 C 4 20, 4 18, 4 16 L4 4 Z" />
      <path d="M8 8 L8 18 M11 12 L16 12 M11 15 L16 15" />
    </svg>
  ),
  Heart: ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M12 20 C 4 14, 3 9, 6 6 C 9 3, 12 6, 12 8 C 12 6, 15 3, 18 6 C 21 9, 20 14, 12 20 Z" />
    </svg>
  ),
  Mountain: ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M2 20 L8 10 L12 15 L16 6 L22 20 Z" />
    </svg>
  ),
  Moon: ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M20 14 C 19 18, 15 21, 11 21 C 6 21, 3 17, 3 12 C 3 8, 6 4, 10 3 C 8 6, 9 11, 12 13 C 15 15, 18 14, 20 14 Z" />
    </svg>
  ),
  Flame: ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M12 3 C 8 7, 6 10, 6 14 C 6 18, 9 21, 12 21 C 15 21, 18 18, 18 14 C 18 10, 15 9, 14 6 C 13.5 8, 12.5 9, 12 9 Z" />
    </svg>
  ),
  Search: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <circle cx="10" cy="10" r="6" />
      <path d="M15 15 L20 20" />
    </svg>
  ),
  Check: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M5 12 L10 17 L19 7" />
    </svg>
  ),
  Arrow: ({ size = 14, color = "currentColor", dir = "right" }: { size?: number; color?: string; dir?: "up" | "down" | "right" | "left" }) => {
    const rot = { right: 0, left: 180, up: -90, down: 90 }[dir] ?? 0;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" style={{ transform: `rotate(${rot}deg)` }}>
        <path d="M5 12 L19 12 M14 7 L19 12 L14 17" />
      </svg>
    );
  },
  Plus: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M12 5 L12 19 M5 12 L19 12" />
    </svg>
  ),
  Sun: ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9" />
    </svg>
  ),
  Edit: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  X: ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </svg>
  ),
};

// ─── Portrait (mosaic avatar) ─────────────────────────────────────────────────

function Portrait({
  initials,
  size = 44,
  tone = "linen",
}: {
  initials: string;
  size?: number;
  tone?: "linen" | "aegean" | "terra" | "ochre";
}) {
  const bg = { linen: "var(--linen-deep)", aegean: "var(--aegean-wash)", terra: "var(--terracotta-soft)", ochre: "var(--ochre-soft)" }[tone];
  const fg = { linen: "var(--ink)", aegean: "var(--aegean-deep)", terra: "var(--terracotta-deep)", ochre: "oklch(0.40 0.08 75)" }[tone];
  return (
    <div className="ca-avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.4 }}>
      <span>{initials}</span>
    </div>
  );
}

// ─── WeekStrip ─────────────────────────────────────────────────────────────────

function WeekStrip({ week_data }: { week_data: { day: string; type: string; km: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
      {week_data.map((d, i) => (
        <div key={i} className={`ca-week-tile ${d.type}`}>
          <div style={{ textAlign: "center", padding: 2 }}>
            <div style={{ fontSize: 9, opacity: 0.7 }}>{d.day}</div>
            {d.km > 0
              ? <div className="ca-num" style={{ fontSize: 13, marginTop: 1, fontFamily: "var(--serif)" }}>{d.km}</div>
              : <div style={{ fontSize: 8, opacity: 0.4, marginTop: 1 }}>·</div>
            }
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Fret border ──────────────────────────────────────────────────────────────

function Fret({ opacity = 0.5 }: { opacity?: number }) {
  return <div className="ca-fret" style={{ opacity }} />;
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({ eyebrow, value, label, glyph, large = false, valueColor = "var(--ink)" }: {
  eyebrow: string; value: number; label: string; glyph: React.ReactNode; large?: boolean; valueColor?: string;
}) {
  return (
    <div style={{ padding: large ? "24px 28px" : "22px 24px", background: "var(--linen)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 130 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="ca-eyebrow">{eyebrow}</div>
        {glyph}
      </div>
      <div>
        <div className="ca-num" style={{ fontSize: large ? 52 : 44, lineHeight: 0.95, color: valueColor, fontFamily: "var(--serif)" }}>{value}</div>
        <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic" }}>{label}</div>
      </div>
    </div>
  );
}

// ─── TopBand ──────────────────────────────────────────────────────────────────

function TopBand({ totalPending, onInvite, onSignOut, coachName, searchQuery, onSearchChange }: {
  totalPending: number;
  onInvite: () => void;
  onSignOut: () => void;
  coachName: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const initials = coachName
    ? coachName.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase()
    : "?";

  return (
    <header style={{ borderBottom: "1px solid var(--rule)", background: "var(--linen)", position: "sticky", top: 0, zIndex: 30 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 32px", display: "flex", alignItems: "center", gap: 24 }}>
        {/* Mosaic wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 32 32">
            <rect x="2" y="2" width="28" height="28" fill="none" stroke="var(--ink)" strokeWidth="1" />
            <g fill="var(--terracotta)" opacity="0.85">
              <rect x="5" y="5" width="5" height="5" /><rect x="16" y="5" width="5" height="5" />
              <rect x="11" y="11" width="5" height="5" /><rect x="22" y="11" width="5" height="5" />
              <rect x="5" y="17" width="5" height="5" /><rect x="16" y="17" width="5" height="5" />
            </g>
            <g fill="var(--aegean-deep)" opacity="0.9">
              <rect x="11" y="5" width="5" height="5" /><rect x="22" y="5" width="5" height="5" />
              <rect x="5" y="11" width="5" height="5" /><rect x="16" y="11" width="5" height="5" />
              <rect x="11" y="17" width="5" height="5" /><rect x="22" y="17" width="5" height="5" />
            </g>
          </svg>
          <div>
            <div className="ca-display" style={{ fontSize: 20, lineHeight: 1 }}>
              Andes<span style={{ color: "var(--terracotta-deep)" }}>.</span>IA
            </div>
            <div className="ca-eyebrow" style={{ fontSize: 8.5, marginTop: 2 }}>THE ATHLETE'S ATHLETE</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, width: 260 }}>
          <G.Search size={14} color="var(--ink-mute)" />
          <input placeholder="Find an athlete…" value={searchQuery} onChange={e => onSearchChange(e.target.value)} style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="ca-btn ca-btn-terra" onClick={onInvite} style={{ fontSize: 12 }}>
            <G.Plus size={13} color="oklch(0.98 0.01 50)" /> Invite athlete
          </button>
          {totalPending > 0 && (
            <div style={{ fontSize: 12, color: "var(--terracotta-deep)", fontFamily: "var(--mono)", letterSpacing: "0.05em" }}>
              {totalPending} pending
            </div>
          )}
          {/* Coach identity — portrait + name, matching design spec */}
          {coachName && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 12, borderLeft: "1px solid var(--rule)" }}>
              <Portrait initials={initials} size={32} tone="ochre" />
              <div>
                <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{coachName}</div>
                <div className="ca-mono" style={{ fontSize: 9.5, color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Head coach
                </div>
              </div>
            </div>
          )}
          <button className="ca-btn ca-btn-ghost" onClick={onSignOut} style={{ fontSize: 12 }}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

function Greeting({ athleteCount, racingCount, coachName }: {
  athleteCount: number;
  racingCount: number;
  coachName: string | null;
}) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const firstName = coachName ? coachName.split(" ")[0] : null;

  // Build the subtext dynamically — matches design spec
  const racingClause = racingCount > 0
    ? ` ${racingCount === 1 ? "One" : racingCount} on the start line this weekend.`
    : "";
  const subtext = `${athleteCount} athlete${athleteCount !== 1 ? "s" : ""} in the stable.${racingClause} Here is the day, quietly.`;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      <div>
        <div className="ca-eyebrow ca-eyebrow-terra">{date}</div>
        <h1 className="ca-display" style={{ margin: "6px 0 0 0", fontSize: 42, color: "var(--ink)", letterSpacing: "-0.015em" }}>
          {salutation}{firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className="ca-display-italic" style={{ margin: "8px 0 0 0", fontSize: 17, color: "var(--ink-soft)", maxWidth: 560 }}>
          {subtext}
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="ca-eyebrow ca-eyebrow-aegean">Daily intention</div>
        <div className="ca-display-italic" style={{ fontSize: 15, marginTop: 6, color: "var(--ink-soft)", maxWidth: 240 }}>
          Listen first. Change the plan second.
        </div>
      </div>
    </div>
  );
}

// ─── Daily Digest (COA-102) ───────────────────────────────────────────────────

type DigestFlag = { athlete_id: string; name: string; reason: string };
type DigestData = {
  generated_at: string;
  summary: string;
  athlete_flags: DigestFlag[];
};

function DailyDigest({
  digest,
  loading,
}: {
  digest: DigestData | null;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <div className="ca-panel" style={{ padding: "16px 20px", marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 16, height: 16, border: "2px solid var(--rule)", borderTopColor: "var(--aegean-deep)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span className="ca-eyebrow" style={{ fontSize: 11 }}>Preparing your morning briefing…</span>
      </div>
    );
  }

  if (!digest) return null;

  const genTime = (() => {
    try {
      return new Date(digest.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  })();

  return (
    <div className="ca-panel" style={{ marginTop: 20, overflow: "hidden" }}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <G.Sun size={15} color="var(--terracotta-deep)" />
          <span className="ca-eyebrow ca-eyebrow-terra" style={{ fontSize: 10 }}>Today&apos;s briefing</span>
          {genTime && (
            <span className="ca-eyebrow" style={{ fontSize: 9, color: "var(--ink-mute)" }}>— {genTime}</span>
          )}
          {digest.athlete_flags.length > 0 && (
            <span className="ca-chip ca-chip-terra" style={{ fontSize: 9 }}>
              {digest.athlete_flags.length} {digest.athlete_flags.length === 1 ? "flag" : "flags"}
            </span>
          )}
        </div>
        <G.Arrow size={13} color="var(--ink-mute)" dir={expanded ? "up" : "down"} />
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div style={{ padding: "0 20px 18px 20px", borderTop: "1px solid var(--rule)" }}>
          <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-soft)", margin: "14px 0 0 0" }}>
            {digest.summary}
          </p>
          {digest.athlete_flags.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {digest.athlete_flags.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderLeft: "2px solid var(--terracotta)", borderRadius: 2 }}>
                  <span style={{ fontSize: 11, fontFamily: "var(--serif)", fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>{f.name}</span>
                  <span style={{ fontSize: 11, fontFamily: "var(--serif)", color: "var(--ink-soft)", fontStyle: "italic" }}>{f.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Weekly Digest (COA-104) ──────────────────────────────────────────────────

type WeeklyDigestRow = {
  id: string;
  athlete_id: string;
  week_ending: string;
  summary_text: string;
  status: "draft" | "sent" | "dismissed";
  sent_at: string | null;
  athletes?: { full_name: string | null; display_name: string | null } | null;
};

function WeeklyDigestPanel({
  digests,
  loading,
  generating,
  onGenerate,
  onSend,
  onDismiss,
  onEdit,
}: {
  digests: WeeklyDigestRow[];
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  onSend: (id: string) => Promise<void>;
  onDismiss: (id: string) => void;
  onEdit: (id: string, text: string) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const draftDigests = digests.filter(d => d.status === "draft");

  if (loading) {
    return (
      <div className="ca-panel" style={{ padding: "16px 20px", marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 16, height: 16, border: "2px solid var(--rule)", borderTopColor: "var(--aegean-deep)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span className="ca-eyebrow" style={{ fontSize: 11 }}>Loading weekly summaries…</span>
      </div>
    );
  }

  if (draftDigests.length === 0 && !generating) {
    return (
      <div className="ca-panel" style={{ marginTop: 20, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <G.Scroll size={15} color="var(--aegean-deep)" />
          <span className="ca-eyebrow" style={{ fontSize: 10 }}>Weekly summaries</span>
          <span className="ca-eyebrow" style={{ fontSize: 9, color: "var(--ink-mute)" }}>— none drafted yet</span>
        </div>
        <button
          onClick={onGenerate}
          className="ca-btn ca-btn-primary"
          style={{ fontSize: 11, padding: "6px 14px" }}
        >
          Draft all summaries
        </button>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="ca-panel" style={{ padding: "16px 20px", marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 16, height: 16, border: "2px solid var(--rule)", borderTopColor: "var(--aegean-deep)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span className="ca-eyebrow" style={{ fontSize: 11 }}>Drafting weekly summaries for all athletes…</span>
      </div>
    );
  }

  const weekLabel = (() => {
    try {
      const d = new Date(draftDigests[0]?.week_ending + "T12:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return "this week"; }
  })();

  return (
    <div className="ca-panel" style={{ marginTop: 20, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <G.Scroll size={15} color="var(--aegean-deep)" />
          <span className="ca-eyebrow" style={{ fontSize: 10 }}>Weekly summaries ready</span>
          <span className="ca-eyebrow" style={{ fontSize: 9, color: "var(--ink-mute)" }}>— week ending {weekLabel}</span>
          <span className="ca-chip" style={{ fontSize: 9 }}>
            {draftDigests.length} {draftDigests.length === 1 ? "draft" : "drafts"}
          </span>
        </div>
        <button
          onClick={onGenerate}
          style={{ fontSize: 10, color: "var(--ink-mute)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Regenerate all
        </button>
      </div>

      {/* Digest cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {draftDigests.map((d, idx) => {
          const name = d.athletes?.display_name || d.athletes?.full_name || "Athlete";
          const isExpanded = expandedId === d.id;
          const isEditing = editingId === d.id;

          return (
            <div
              key={d.id}
              style={{
                borderBottom: idx < draftDigests.length - 1 ? "1px solid var(--rule)" : "none",
                padding: "12px 20px",
              }}
            >
              {/* Row header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  style={{ flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span style={{ fontSize: 13, fontFamily: "var(--serif)", fontWeight: 600, color: "var(--ink)" }}>{name}</span>
                  <G.Arrow size={11} color="var(--ink-mute)" dir={isExpanded ? "up" : "down"} />
                </button>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditingId(d.id); setEditText(d.summary_text); setExpandedId(d.id); }}
                    className="ca-btn"
                    style={{ fontSize: 10, padding: "4px 10px" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDismiss(d.id)}
                    className="ca-btn"
                    style={{ fontSize: 10, padding: "4px 10px", color: "var(--ink-mute)" }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={async () => {
                      setSendingId(d.id);
                      try { await onSend(d.id); } finally { setSendingId(null); }
                    }}
                    className="ca-btn ca-btn-primary"
                    style={{ fontSize: 10, padding: "4px 12px" }}
                    disabled={sendingId === d.id}
                  >
                    {sendingId === d.id ? "Sending…" : "Send →"}
                  </button>
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ marginTop: 10 }}>
                  {isEditing ? (
                    <>
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={5}
                        style={{
                          width: "100%", boxSizing: "border-box",
                          fontFamily: "var(--serif)", fontStyle: "italic",
                          fontSize: 13.5, lineHeight: 1.65,
                          color: "var(--ink)", background: "var(--parchment)",
                          border: "1px solid var(--rule)", borderRadius: 2,
                          padding: "10px 12px", resize: "vertical",
                        }}
                      />
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        <button
                          onClick={async () => {
                            setSavingId(d.id);
                            try { await onEdit(d.id, editText); setEditingId(null); }
                            finally { setSavingId(null); }
                          }}
                          className="ca-btn ca-btn-primary"
                          style={{ fontSize: 10, padding: "5px 14px" }}
                          disabled={savingId === d.id}
                        >
                          {savingId === d.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="ca-btn"
                          style={{ fontSize: 10, padding: "5px 14px" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-soft)", margin: 0 }}>
                      {d.summary_text}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Media Review Queue (COA-107) ─────────────────────────────────────────────

type MediaReview = {
  id: string;
  athlete_id: string;
  media_type: "image" | "video";
  ai_analysis: string | null;
  coach_edited_analysis: string | null;
  coach_comment: string | null;
  signed_url: string | null;
  status: string;
  created_at: string;
  athletes?: { full_name: string | null; display_name: string | null } | null;
};

function MediaReviewQueue({
  reviews,
  loading,
  onRefresh,
}: {
  reviews: MediaReview[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnalysis, setEditAnalysis] = useState("");
  const [editComment, setEditComment] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/media-reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coach_edited_analysis: editAnalysis || null,
          coach_comment: editComment || null,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        onRefresh();
      } else {
        showToast("Save failed");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function handleSend(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/media-reviews/${id}?action=send`, { method: "POST" });
      if (res.ok) {
        showToast("Form analysis sent to athlete ✓");
        onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || "Send failed");
      }
    } finally {
      setSendingId(null);
    }
  }

  async function handleDismiss(id: string) {
    const res = await fetch(`/api/media-reviews/${id}?action=dismiss`, { method: "POST" });
    if (res.ok) onRefresh();
  }

  if (loading) {
    return (
      <div className="ca-panel" style={{ padding: "20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 16, height: 16, border: "2px solid var(--rule)", borderTopColor: "var(--aegean-deep)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span className="ca-eyebrow" style={{ fontSize: 11 }}>Loading media queue…</span>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="ca-panel" style={{ padding: "28px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
        <p className="ca-eyebrow" style={{ fontSize: 10 }}>No media to review</p>
        <p style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>
          When athletes send photos or videos via WhatsApp, they&apos;ll appear here for AI-assisted form review.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "var(--aegean-deep)", color: "oklch(0.97 0.02 210)", padding: "8px 16px", borderRadius: 4, fontSize: 12, zIndex: 100, fontFamily: "var(--mono)" }}>
          {toast}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {reviews.map(r => {
          const name = r.athletes?.display_name || r.athletes?.full_name || "Athlete";
          const isOpen = openId === r.id;
          const isEditing = editingId === r.id;
          const displayAnalysis = r.coach_edited_analysis || r.ai_analysis || "";

          return (
            <div key={r.id} className="ca-panel" style={{ overflow: "hidden" }}>
              {/* Header row */}
              <button
                onClick={() => setOpenId(isOpen ? null : r.id)}
                style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 18 }}>{r.media_type === "image" ? "📸" : "📹"}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontFamily: "var(--serif)", fontWeight: 600, color: "var(--ink)" }}>{name}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-mute)" }}>
                    {r.media_type} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <G.Arrow size={12} color="var(--ink-mute)" dir={isOpen ? "up" : "down"} />
              </button>

              {isOpen && (
                <div style={{ borderTop: "1px solid var(--rule)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Media preview */}
                  {r.signed_url && (
                    r.media_type === "image" ? (
                      <img
                        src={r.signed_url}
                        alt="Athlete form photo"
                        style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 4, border: "1px solid var(--rule)", objectFit: "contain" }}
                      />
                    ) : (
                      <video
                        src={r.signed_url}
                        controls
                        style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 4, border: "1px solid var(--rule)" }}
                      />
                    )
                  )}

                  {/* AI analysis + edit */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="ca-eyebrow" style={{ fontSize: 9 }}>AI form analysis</span>
                      {!isEditing && (
                        <button
                          onClick={() => { setEditingId(r.id); setEditAnalysis(displayAnalysis); setEditComment(r.coach_comment || ""); }}
                          className="ca-btn"
                          style={{ fontSize: 9, padding: "3px 10px" }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          value={editAnalysis}
                          onChange={e => setEditAnalysis(e.target.value)}
                          rows={5}
                          placeholder="AI analysis…"
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, lineHeight: 1.6, color: "var(--ink)", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, padding: "10px 12px", resize: "vertical" }}
                        />
                        <textarea
                          value={editComment}
                          onChange={e => setEditComment(e.target.value)}
                          rows={2}
                          placeholder="Add your personal note (optional)…"
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--serif)", fontSize: 12, lineHeight: 1.6, color: "var(--ink-soft)", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, padding: "8px 12px", resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleSave(r.id)}
                            disabled={savingId === r.id}
                            className="ca-btn ca-btn-primary"
                            style={{ fontSize: 10, padding: "5px 14px" }}
                          >
                            {savingId === r.id ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditingId(null)} className="ca-btn" style={{ fontSize: 10, padding: "5px 14px" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, padding: "12px 14px" }}>
                        <p style={{ margin: 0, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-soft)" }}>
                          {displayAnalysis || "Analysis pending…"}
                        </p>
                        {r.coach_comment && (
                          <p style={{ margin: "10px 0 0 0", fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--serif)" }}>
                            <em>Coach&apos;s note: {r.coach_comment}</em>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleDismiss(r.id)}
                        className="ca-btn"
                        style={{ fontSize: 10, padding: "6px 14px", color: "var(--ink-mute)" }}
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleSend(r.id)}
                        disabled={sendingId === r.id}
                        className="ca-btn ca-btn-primary"
                        style={{ fontSize: 10, padding: "6px 18px", marginLeft: "auto" }}
                      >
                        {sendingId === r.id ? "Sending…" : "Send to athlete →"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Athlete Card ─────────────────────────────────────────────────────────────

function AthleteCard({ athlete, href }: { athlete: EnrichedAthlete; href: string; }) {
  const profile = getProfile(athlete);
  const pending = athlete.pending_suggestions ?? 0;
  const tone: "aegean" | "terra" | "ochre" | "linen" = pending > 0 ? "terra" : "aegean";
  const readinessColor = profile.readiness === null ? "var(--ink-soft)" : profile.readiness >= 80 ? "var(--aegean-deep)" : profile.readiness >= 60 ? "var(--ochre)" : "var(--terracotta-deep)";
  const baseline = athlete.biometric_baseline ?? null;  // COA-101
  const weekData = useMemo(() => buildWeekData(athlete.week_workouts), [athlete.week_workouts]);
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleResendPlanLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (resendState === "loading") return;
    setResendState("loading");
    try {
      const res = await fetch(`/api/athletes/${athlete.id}/resend-plan-link`, { method: "POST" });
      setResendState(res.ok ? "sent" : "error");
      setTimeout(() => setResendState("idle"), 3000);
    } catch {
      setResendState("error");
      setTimeout(() => setResendState("idle"), 3000);
    }
  }

  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
    <article className="tessera ca-rise" style={{ padding: 0, cursor: "pointer" }}>
      {/* Top band */}
      <div style={{ padding: "18px 20px 14px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Portrait initials={getInitials(athlete.full_name)} size={52} tone={tone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <h3 className="ca-display" style={{ margin: 0, fontSize: 20, color: "var(--ink)", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
              {athlete.full_name ?? "Unknown"}
            </h3>
            {pending > 0 && <span className="ca-chip ca-chip-terra" style={{ flexShrink: 0 }}>{pending} pending</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span className="ca-eyebrow">{profile.phase}{profile.week !== null ? ` · Wk ${profile.week}` : ""}</span>
            {profile.target_race !== "No race set" && (
              <><span style={{ color: "var(--rule)" }}>•</span><span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{profile.target_race}</span></>
            )}
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 1, background: "var(--rule)", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
        {[
          {
            label: "Readiness",
            value: profile.readiness !== null ? <><span className="ca-num" style={{ fontSize: 26, color: readinessColor, lineHeight: 1 }}>{profile.readiness}</span><span style={{ fontSize: 11, color: "var(--ink-mute)" }}>/100</span></> : <span className="ca-num" style={{ fontSize: 20, color: "var(--ink-mute)" }}>—</span>,
            delta: <BioDelta current={profile.readiness} avg={baseline?.readiness_avg ?? null} />,
            icon: null, wide: true,
          },
          {
            label: "HRV",
            value: <>{profile.hrv}{profile.hrv !== "—" && <span style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 2 }}>ms</span>}</>,
            delta: <BioDelta current={profile.hrv !== "—" ? Number(profile.hrv) : null} avg={baseline?.hrv_avg ?? null} />,
            icon: <G.Heart size={10} />, wide: false,
          },
          {
            label: "Sleep",
            value: profile.sleep,
            delta: <BioDelta current={profile.sleep !== "—" ? Number(profile.sleep) : null} avg={baseline?.sleep_avg ?? null} />,
            icon: <G.Moon size={10} />, wide: false,
          },
          { label: "Load", value: profile.load, delta: null, icon: <G.Flame size={10} />, wide: false },
        ].map((m, i) => (
          <div key={i} style={{ padding: m.wide ? "12px 16px" : "12px 14px", background: "var(--linen)" }}>
            <div className="ca-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>
              {m.icon} {m.label}
            </div>
            <div className="ca-num" style={{ fontSize: m.wide ? undefined : 20, marginTop: 4, lineHeight: 1 }}>
              {m.value}
            </div>
            {m.delta}
          </div>
        ))}
      </div>

      {/* Week strip */}
      <div style={{ padding: "14px 20px 6px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="ca-eyebrow">This week</span>
          <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)" }}>{athlete.total_checkins ?? 0} check-ins</span>
        </div>
        <WeekStrip week_data={weekData} />
      </div>

      {/* AI urgency flags */}
      {profile.predictive_flags.length > 0 && (
        <div style={{ padding: "0 20px 10px 20px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {profile.predictive_flags.slice(0, 3).map(f => (
            <span
              key={f.code}
              className={`ca-chip ${f.priority === "high" ? "ca-chip-terra" : f.priority === "medium" ? "ca-chip-ochre" : ""}`}
              style={{ fontSize: 10 }}
              title={f.reason}
            >
              {f.label}
            </span>
          ))}
        </div>
      )}

      {/* Notes / last heard + resend action */}
      <div style={{ padding: "10px 20px 14px 20px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {profile.notes
            ? <div style={{ borderLeft: "2px solid var(--rule)", paddingLeft: 10, fontSize: 12.5, color: "var(--ink-soft)", fontStyle: "italic", fontFamily: "var(--serif)" }}>"{profile.notes}"</div>
            : <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>Last heard · {relativeTime(athlete.last_checkin_at)}</div>
          }
        </div>
        {/* COA-75: Resend plan link */}
        <button
          onClick={handleResendPlanLink}
          disabled={resendState === "loading"}
          style={{
            flexShrink: 0,
            padding: "5px 10px",
            border: "1px solid var(--rule)",
            borderRadius: 2,
            background: resendState === "sent" ? "var(--aegean-wash)" : resendState === "error" ? "var(--terracotta-soft)" : "transparent",
            color: resendState === "sent" ? "var(--aegean-deep)" : resendState === "error" ? "var(--terracotta-deep)" : "var(--ink-mute)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            cursor: resendState === "loading" ? "not-allowed" : "pointer",
            opacity: resendState === "loading" ? 0.6 : 1,
            whiteSpace: "nowrap",
            transition: "all 160ms ease",
          }}
        >
          {resendState === "loading" ? "Sending…" : resendState === "sent" ? "✓ Link sent" : resendState === "error" ? "Failed" : "Resend plan link"}
        </button>
      </div>
    </article>
    </Link>
  );
}

// ─── Queue View ───────────────────────────────────────────────────────────────

function RhythmRow({ label, value, max, color }: { label: string; value: number | string; max: number | null; color: string; }) {
  const pct = max && typeof value === "number" ? (value / max) * 100 : 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{label}</span>
        <span className="ca-num" style={{ fontSize: 14, fontFamily: "var(--serif)" }}>
          {value}{max !== null && <span style={{ color: "var(--ink-mute)", fontSize: 11 }}> / {max}</span>}
        </span>
      </div>
      <div className="ca-bar-track"><div className={`ca-bar-fill ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// Classification chip colours matching the design spec
const CLASS_CHIP: Record<string, { cls: string; label: string }> = {
  flag:          { cls: "ca-chip-terra",  label: "Flag" },
  plan_question: { cls: "ca-chip-aegean", label: "Plan question" },
  check_in:      { cls: "ca-chip-ochre",  label: "Check-in" },
  noise:         { cls: "",               label: "Noise" },
};

function QueueView({
  suggestions,
  athletes,
  onApprove,
  onIgnore,
  onRefine,
  actionLoading,
}: {
  suggestions: Suggestion[];
  athletes: EnrichedAthlete[];
  onApprove: (id: string) => void;
  onIgnore: (id: string) => void;
  onRefine: (s: Suggestion) => void;
  actionLoading: string | null;
}) {
  const totalCheckins = athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0);

  if (suggestions.length === 0) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="ca-ornament">◆ ◆ ◆</div>
        <p className="ca-display-italic" style={{ fontSize: 20, marginTop: 16, color: "var(--ink-soft)" }}>
          All caught up. Nothing waiting for your reply.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.map((s) => {
          const busy = actionLoading === s.id;
          const cls = s.message_class ? CLASS_CHIP[s.message_class] : CLASS_CHIP.check_in;
          const hasPlanChange = (s as unknown as Record<string, unknown>).plan_modification_payload != null;
          return (
            <article key={s.id} className="tessera ca-rise" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 14 }}>
                <Portrait initials={getInitials(s.athlete_display_name)} size={40} tone="aegean" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div>
                      <span className="ca-display" style={{ fontSize: 17, color: "var(--ink)" }}>
                        {s.athlete_display_name ?? "Unknown athlete"}
                      </span>
                      <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 10, letterSpacing: 0.1 }}>
                        {relativeTime(s.created_at)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className={`ca-chip ${cls.cls}`}>{cls.label}</span>
                      {hasPlanChange && (
                        <span className="ca-chip ca-chip-terra" style={{ fontSize: 9 }}>
                          <G.Scroll size={10} color="var(--terracotta-deep)" /> plan change
                        </span>
                      )}
                    </div>
                  </div>

                  {s.athlete_message && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--parchment-2)", borderLeft: "2px solid var(--ochre)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)" }}>
                      &ldquo;{s.athlete_message}&rdquo;
                    </div>
                  )}

                  {s.suggestion_text && (
                    <div style={{ marginTop: 12 }}>
                      <div className="ca-eyebrow ca-eyebrow-aegean" style={{ fontSize: 9, marginBottom: 6 }}>Suggested reply</div>
                      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>
                        {s.suggestion_text.length > 220 ? s.suggestion_text.slice(0, 220) + "…" : s.suggestion_text}
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="ca-btn ca-btn-primary"
                      style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }}
                      disabled={busy}
                      onClick={() => onApprove(s.id)}
                    >
                      <G.Check size={12} color="oklch(0.97 0.02 190)" />
                      {busy ? "Sending…" : "Approve & send"}
                    </button>
                    <button
                      className="ca-btn"
                      style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }}
                      disabled={busy}
                      onClick={() => onRefine(s)}
                    >
                      <G.Edit size={12} /> Refine
                    </button>
                    <button
                      className="ca-btn ca-btn-ghost"
                      style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }}
                      disabled={busy}
                      onClick={() => onIgnore(s.id)}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Right rail */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ca-panel" style={{ padding: 22 }}>
          <div className="ca-eyebrow ca-eyebrow-terra">This week&apos;s rhythm</div>
          <h3 className="ca-display" style={{ fontSize: 20, margin: "6px 0 16px 0" }}>Reply cadence</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RhythmRow label="Pending replies" value={suggestions.length} max={null} color="terra" />
            <RhythmRow label="Total check-ins" value={totalCheckins} max={null} color="aegean" />
            <RhythmRow label="Athletes active" value={athletes.filter(a => (a.total_checkins ?? 0) > 0).length} max={athletes.length} color="ochre" />
          </div>
          <hr className="ca-hairline" style={{ margin: "18px 0" }} />
          <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.5 }}>
            Review and approve each reply before it reaches your athlete.
          </div>
        </div>

        <div className="ca-panel" style={{ padding: 22, background: "linear-gradient(155deg, oklch(0.58 0.095 195) 0%, oklch(0.48 0.085 200) 100%)", color: "oklch(0.96 0.02 190)" }}>
          <div className="ca-eyebrow" style={{ color: "oklch(0.85 0.05 190)" }}>The stable today</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {athletes.slice(0, 5).map((a) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{(a.full_name ?? "").split(" ").slice(0, 2).join(" ")}</span>
                <span className="ca-chip" style={{ background: "oklch(1 0 0 / 0.15)", borderColor: "oklch(1 0 0 / 0.25)", color: "oklch(0.96 0.02 190)", fontSize: 10 }}>
                  {(a.pending_suggestions ?? 0) > 0 ? `${a.pending_suggestions} pending` : "up to date"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Office Hours View (data-driven) ─────────────────────────────────────────

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatHours(h: unknown): string {
  if (!h || !Array.isArray(h) || h.length < 2) return "Closed";
  return `${h[0]} – ${h[1]}`;
}

function OfficeHoursView({ data, onToggle, toggleLoading }: {
  data: OfficeHoursData | null;
  onToggle: () => void;
  toggleLoading: boolean;
}) {
  const oh = data?.office_hours as Record<string, unknown> | null | undefined;
  const autonomous = data?.is_currently_autonomous ?? false;
  const override = data?.ai_autonomy_override ?? false;

  const DEFAULT_VOICE = "Your coach is off the pitch until morning. I've taken your note and they'll see it first thing. If this is urgent — pain, illness, racing today — reply URGENT.";
  const DEFAULT_KEYWORDS = ["URGENT", "PAIN", "INJURY", "RACE", "EMERGENCY", "SICK"];

  const [voiceModal, setVoiceModal] = useState(false);
  const [urgencyModal, setUrgencyModal] = useState(false);
  const [voiceText, setVoiceText] = useState(DEFAULT_VOICE);
  const [savedVoice, setSavedVoice] = useState(DEFAULT_VOICE);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [newKeyword, setNewKeyword] = useState("");

  const schedule = DAY_KEYS.map((k, i) => ({
    day: DAY_NAMES[i],
    hours: formatHours(oh?.[k]),
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div className="ca-panel" style={{ padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div className="ca-eyebrow ca-eyebrow-terra">When the door is open</div>
          {/* Autonomy status chip */}
          <span className={`ca-chip ${autonomous ? "ca-chip-aegean" : "ca-chip-olive"}`} style={{ fontSize: 9 }}>
            {autonomous ? "AI autonomous now" : "Coach online"}
          </span>
        </div>
        <h2 className="ca-display" style={{ margin: "8px 0 4px 0", fontSize: 28 }}>Office hours</h2>
        <p className="ca-display-italic" style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4, marginBottom: 16 }}>
          Outside these windows, athletes hear from the understudy.
        </p>

        {/* Autonomy override toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>AI fully autonomous</div>
            <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>Override office hours — AI responds to everything</div>
          </div>
          <button
            onClick={onToggle}
            disabled={toggleLoading}
            style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: override ? "var(--aegean-deep)" : "var(--rule)",
              position: "relative", transition: "background 200ms ease", flexShrink: 0,
              opacity: toggleLoading ? 0.6 : 1,
            }}
          >
            <span style={{ position: "absolute", top: 3, left: override ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 200ms ease" }} />
          </button>
        </div>

        <Fret opacity={0.35} />
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column" }}>
          {(data ? schedule : DAY_NAMES.map(d => ({ day: d, hours: "—" }))).map((oh, i) => {
            const closed = oh.hours === "Closed";
            return (
              <div key={oh.day} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0", borderBottom: i < DAY_NAMES.length - 1 ? "1px dashed var(--rule)" : "none" }}>
                <span className="ca-display" style={{ fontSize: 18, color: closed ? "var(--ink-mute)" : "var(--ink)" }}>{oh.day}</span>
                <span className="ca-mono" style={{ fontSize: 14, color: closed ? "var(--ink-mute)" : "var(--aegean-deep)" }}>{oh.hours}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ca-panel" style={{ padding: 28, background: "linear-gradient(155deg, oklch(0.68 0.135 42) 0%, oklch(0.56 0.130 38) 100%)", color: "oklch(0.98 0.02 50)" }}>
        <div className="ca-eyebrow" style={{ color: "oklch(0.88 0.05 45)" }}>The understudy&apos;s voice</div>
        <h2 className="ca-display" style={{ margin: "8px 0 4px 0", fontSize: 28, color: "oklch(0.98 0.02 50)" }}>After-hours reply</h2>
        <Fret opacity={0.3} />
        <div style={{ marginTop: 20, padding: "18px 22px", background: "oklch(1 0 0 / 0.1)", border: "1px solid oklch(1 0 0 / 0.2)", borderRadius: 2, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 17, lineHeight: 1.55, color: "oklch(0.98 0.02 50)" }}>
          &ldquo;{savedVoice}&rdquo;
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button className="ca-btn" onClick={() => { setVoiceText(savedVoice); setVoiceModal(true); }} style={{ background: "oklch(1 0 0 / 0.15)", color: "oklch(0.98 0.02 50)", borderColor: "oklch(1 0 0 / 0.3)", fontSize: 12 }}>
            Edit voice
          </button>
          <button className="ca-btn" onClick={() => setUrgencyModal(true)} style={{ background: "oklch(1 0 0 / 0.15)", color: "oklch(0.98 0.02 50)", borderColor: "oklch(1 0 0 / 0.3)", fontSize: 12 }}>
            Urgency rules
          </button>
        </div>
      </div>

      {/* ── Edit voice modal ── */}
      {voiceModal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.45)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setVoiceModal(false)}>
          <div className="ca-panel" style={{ width: "100%", maxWidth: 540, padding: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 6 }}>After-hours understudy</div>
                <h2 className="ca-display" style={{ fontSize: 24, margin: 0 }}>Edit voice message</h2>
              </div>
              <button className="ca-btn ca-btn-ghost" onClick={() => setVoiceModal(false)} style={{ padding: "4px 8px", fontSize: 18 }}>×</button>
            </div>
            <p style={{ fontFamily: "var(--body)", fontSize: 13, color: "var(--ink-soft)", margin: "0 0 16px", lineHeight: 1.55 }}>
              This message is sent automatically when an athlete messages outside your office hours. Write it in your own tone — they&apos;ll hear you, not a bot.
            </p>
            <textarea
              value={voiceText}
              onChange={e => setVoiceText(e.target.value)}
              rows={5}
              style={{ width: "100%", padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, color: "var(--ink)", outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="ca-btn ca-btn-ghost" onClick={() => setVoiceModal(false)}>Cancel</button>
              <button className="ca-btn ca-btn-primary" onClick={() => { setSavedVoice(voiceText); setVoiceModal(false); }}>Save message</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Urgency rules modal ── */}
      {urgencyModal && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.45)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setUrgencyModal(false)}>
          <div className="ca-panel" style={{ width: "100%", maxWidth: 500, padding: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 6 }}>After-hours escalation</div>
                <h2 className="ca-display" style={{ fontSize: 24, margin: 0 }}>Urgency keywords</h2>
              </div>
              <button className="ca-btn ca-btn-ghost" onClick={() => setUrgencyModal(false)} style={{ padding: "4px 8px", fontSize: 18 }}>×</button>
            </div>
            <p style={{ fontFamily: "var(--body)", fontSize: 13, color: "var(--ink-soft)", margin: "0 0 20px", lineHeight: 1.55 }}>
              If an athlete&apos;s after-hours message contains any of these words, Andes flags it as urgent and will notify you immediately — even outside office hours.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {keywords.map(kw => (
                <span key={kw} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "oklch(0.94 0.025 25)", border: "1px solid oklch(0.80 0.060 25)", borderRadius: 2, padding: "5px 10px", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.10em", color: "oklch(0.38 0.090 25)" }}>
                  {kw}
                  <button onClick={() => setKeywords(keywords.filter(k => k !== kw))} style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(0.52 0.090 25)", fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter" && newKeyword.trim()) { setKeywords([...keywords, newKeyword.trim()]); setNewKeyword(""); } }}
                placeholder="Add keyword…"
                style={{ flex: 1, padding: "9px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "0.08em", color: "var(--ink)", outline: "none" }}
              />
              <button className="ca-btn ca-btn-primary" onClick={() => { if (newKeyword.trim()) { setKeywords([...keywords, newKeyword.trim()]); setNewKeyword(""); } }}>Add</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button className="ca-btn ca-btn-primary" onClick={() => setUrgencyModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Refine Modal ─────────────────────────────────────────────────────────────

function RefineModal({ suggestion, onClose, onSend }: {
  suggestion: Suggestion;
  onClose: () => void;
  onSend: (id: string, text: string) => void;
}) {
  const [text, setText] = useState(suggestion.suggestion_text ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    await onSend(suggestion.id, text);
    setLoading(false);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 560, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 6 }}>Edit before sending</div>
            <h2 className="ca-display" style={{ fontSize: 24, margin: 0 }}>
              Refine reply to {suggestion.athlete_display_name}
            </h2>
          </div>
          <button className="ca-btn ca-btn-ghost" onClick={onClose} style={{ padding: 6 }}><G.X size={16} /></button>
        </div>

        {suggestion.athlete_message && (
          <div style={{ padding: "10px 14px", background: "var(--parchment-2)", borderLeft: "2px solid var(--ochre)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)", marginBottom: 16 }}>
            &ldquo;{suggestion.athlete_message}&rdquo;
          </div>
        )}

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          style={{ width: "100%", padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 14, color: "var(--ink)", outline: "none", resize: "vertical", lineHeight: 1.55, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="ca-btn ca-btn-primary" onClick={handleSend} disabled={loading || !text.trim()} style={{ flex: 1 }}>
            <G.Check size={13} color="oklch(0.97 0.02 190)" />
            {loading ? "Sending…" : "Send modified reply"}
          </button>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite Modal (COA-53 / COA-78) ──────────────────────────────────────────

function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invite_url: string; sent_whatsapp: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combine country code + local number into a single string for the API.
  // Both parts are free-form — no formatting enforced.
  function buildPhoneNumber(): string | undefined {
    const cc = countryCode.trim();
    const local = phoneLocal.trim();
    if (!local) return undefined;
    if (cc) return `${cc}${local}`;
    return local;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/athletes/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: name.trim(),
          email: email.trim(),
          phone_number: buildPhoneNumber(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body?.detail as string | undefined) ?? "Failed to create invite.");
        setLoading(false);
        return;
      }
      setResult({ invite_url: body.invite_url, sent_whatsapp: !!body.sent_whatsapp });
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  async function handleCopy() {
    if (!result?.invite_url) return;
    await navigator.clipboard.writeText(result.invite_url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 12px",
    background: "var(--parchment)",
    border: "1px solid var(--rule)",
    borderRadius: 2,
    fontFamily: "var(--body)",
    fontSize: 13,
    color: "var(--ink)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 440, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>New member</div>
        <h2 className="ca-display" style={{ fontSize: 26, margin: "0 0 20px 0" }}>Invite an athlete</h2>

        {result ? (
          <div>
            {result.sent_whatsapp ? (
              <p style={{ fontSize: 14, color: "var(--ink-soft)", fontFamily: "var(--serif)", marginBottom: 16 }}>
                ✅ Invite sent to {name} via WhatsApp. You can also share this link directly:
              </p>
            ) : (
              <p style={{ fontSize: 14, color: "var(--ink-soft)", fontFamily: "var(--serif)", marginBottom: 16 }}>
                Share this onboarding link with {name}:
              </p>
            )}
            <div style={{ padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontSize: 12, fontFamily: "var(--mono)", color: "var(--aegean-deep)", wordBreak: "break-all", marginBottom: 12 }}>
              {result.invite_url}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ca-btn ca-btn-primary" style={{ flex: 1 }} onClick={handleCopy}>
                {copied ? "✓ Copied!" : "Copy link"}
              </button>
              <button className="ca-btn ca-btn-ghost" onClick={onClose}>Done</button>
            </div>
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic" }}>
              Link expires in 30 days. Athlete completes their profile and is added to your roster.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>

            {/* Full name */}
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Full name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Alex Thompson" style={{ ...inputStyle, width: "100%" }} />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="alex@example.com" style={{ ...inputStyle, width: "100%" }} />
            </div>

            {/* WhatsApp — country code + free-form number */}
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>
                WhatsApp number <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  placeholder="+1"
                  style={{ ...inputStyle, width: 64, flexShrink: 0 }}
                />
                <input
                  type="text"
                  value={phoneLocal}
                  onChange={e => setPhoneLocal(e.target.value)}
                  placeholder="5550001234"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
              <p style={{ marginTop: 5, fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic" }}>
                Any format is fine — spaces, dashes, parentheses all work.
              </p>
            </div>

            <p style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic", margin: 0 }}>
              If a WhatsApp number is provided, the invite link is sent automatically. Otherwise you&apos;ll get a link to share manually.
            </p>
            {error && <div style={{ padding: "10px 14px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="submit" disabled={loading || !name.trim() || !email.trim()} className="ca-btn ca-btn-terra" style={{ flex: 1 }}>{loading ? "Creating…" : "Send invite →"}</button>
              <button type="button" className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Shell (main) ────────────────────────────────────────────────────

export default function DashboardShell({
  athletes,
  suggestions: initialSuggestions,
}: {
  athletes: EnrichedAthlete[];
  suggestions: Suggestion[];
}) {
  const router = useRouter();

  // ── Core state ──
  const [tab, setTab] = useState<Tab>("roster");
  const [filter, setFilter] = useState<Filter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [refineTarget, setRefineTarget] = useState<Suggestion | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Live suggestions (start from SSR data, updated by real-time + actions) ──
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Office hours ──
  const [ohData, setOhData] = useState<OfficeHoursData | null>(null);
  const [ohToggleLoading, setOhToggleLoading] = useState(false);

  // ── COA-102: Daily digest ──
  const [digestData, setDigestData] = useState<DigestData | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);

  // ── COA-104: Weekly digests (Friday–Sunday) ──
  const [weeklyDigests, setWeeklyDigests] = useState<WeeklyDigestRow[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyGenerating, setWeeklyGenerating] = useState(false);

  // ── COA-107: Media review queue ──
  const [mediaReviews, setMediaReviews] = useState<MediaReview[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  // ── Coach identity (for header + greeting) ──
  const [coachName, setCoachName] = useState<string | null>(null);
  useEffect(() => {
    createBrowserSupabase().auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      const name = meta?.full_name ?? meta?.name ?? data.user?.email?.split("@")[0] ?? null;
      setCoachName(name as string | null);
    }).catch(() => {});
  }, []);

  // ── Real-time subscription ──
  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel("dashboard-suggestions-rt")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "suggestions",
      }, (payload) => {
        const newRow = payload.new as Record<string, unknown>;
        if (newRow.status === "pending") {
          setSuggestions(prev => [{
            id: newRow.id as string,
            athlete_id: (newRow.athlete_id as string) ?? null,
            athlete_display_name: (newRow.athlete_display_name as string) ?? null,
            suggestion_text: (newRow.suggestion_text as string) ?? null,
            status: "pending",
            coach_reply: null,
            created_at: newRow.created_at as string,
            updated_at: newRow.updated_at as string,
            athlete_message: null,
          } as Suggestion, ...prev]);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "suggestions",
      }, (payload) => {
        const updated = payload.new as Record<string, unknown>;
        if (updated.status !== "pending") {
          // Remove resolved suggestions from the queue
          setSuggestions(prev => prev.filter(s => s.id !== updated.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── COA-102: Fetch + lazily regenerate daily digest on mount ──
  useEffect(() => {
    const hour = new Date().getHours();
    // Only show the briefing during working hours (6 AM onward)
    if (hour < 6) return;

    async function loadDigest() {
      setDigestLoading(true);
      try {
        // 1. Check for an existing cached digest
        const getRes = await fetch("/api/digest");
        const getJson = getRes.ok ? await getRes.json() : {};
        const existing: DigestData | null = getJson.digest ?? null;

        // If digest is fresh (< 6 hours old), use it directly
        if (existing?.generated_at) {
          const ageHours = (Date.now() - new Date(existing.generated_at).getTime()) / 3_600_000;
          if (ageHours < 6) {
            setDigestData(existing);
            setDigestLoading(false);
            return;
          }
        }

        // 2. Stale or missing — regenerate
        const supabase = createBrowserSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";

        const genRes = await fetch("/api/digest/generate", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const genJson = genRes.ok ? await genRes.json() : {};
        if (genJson.digest) {
          setDigestData(genJson.digest as DigestData);
        } else if (existing) {
          // Generation failed — fall back to stale digest
          setDigestData(existing);
        }
      } catch {
        // Non-fatal — digest is a nice-to-have
      } finally {
        setDigestLoading(false);
      }
    }

    loadDigest();
  }, []); // run once on mount

  // ── COA-104: Load weekly digests on Friday–Sunday ──
  useEffect(() => {
    const dow = new Date().getDay(); // 0=Sun, 5=Fri, 6=Sat
    if (dow !== 0 && dow !== 5 && dow !== 6) return; // only show Fri–Sun

    async function loadWeeklyDigests() {
      setWeeklyLoading(true);
      try {
        const res = await fetch("/api/weekly-digests?status=draft");
        if (res.ok) {
          const json = await res.json();
          setWeeklyDigests(json.digests ?? []);
        }
      } catch {
        // non-fatal
      } finally {
        setWeeklyLoading(false);
      }
    }

    loadWeeklyDigests();
  }, []);

  const handleGenerateWeeklyDigests = async () => {
    setWeeklyGenerating(true);
    try {
      const res = await fetch("/api/weekly-digests/generate", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setWeeklyDigests(json.digests ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setWeeklyGenerating(false);
    }
  };

  const handleSendWeeklyDigest = async (id: string) => {
    const res = await fetch(`/api/weekly-digests/${id}?action=send`, { method: "POST" });
    if (res.ok) {
      setWeeklyDigests(prev => prev.filter(d => d.id !== id));
    }
  };

  const handleDismissWeeklyDigest = async (id: string) => {
    const res = await fetch(`/api/weekly-digests/${id}?action=dismiss`, { method: "POST" });
    if (res.ok) {
      setWeeklyDigests(prev => prev.filter(d => d.id !== id));
    }
  };

  const handleEditWeeklyDigest = async (id: string, summary_text: string) => {
    const res = await fetch(`/api/weekly-digests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary_text }),
    });
    if (res.ok) {
      const json = await res.json();
      const updated = json.digest as WeeklyDigestRow;
      setWeeklyDigests(prev => prev.map(d => d.id === id ? { ...d, summary_text: updated.summary_text } : d));
    }
  };

  // ── COA-107: Load media reviews when media tab is active ──
  useEffect(() => {
    if (tab !== "media") return;
    async function loadMedia() {
      setMediaLoading(true);
      try {
        const res = await fetch("/api/media-reviews");
        if (res.ok) {
          const json = await res.json();
          setMediaReviews(json.reviews ?? []);
        }
      } catch { /* non-fatal */ }
      finally { setMediaLoading(false); }
    }
    loadMedia();
  }, [tab]);

  const handleRefreshMedia = async () => {
    setMediaLoading(true);
    try {
      const res = await fetch("/api/media-reviews");
      if (res.ok) setMediaReviews((await res.json()).reviews ?? []);
    } catch { /* non-fatal */ }
    finally { setMediaLoading(false); }
  };

  // ── Fetch office hours when tab is active ──
  useEffect(() => {
    if (tab !== "officehours" || ohData !== null) return;
    fetch("/api/office-hours")
      .then(r => r.json())
      .then((d: OfficeHoursData) => setOhData(d))
      .catch(() => {}); // non-fatal
  }, [tab, ohData]);

  // ── Suggestion actions ──
  // M5: Added error handling — previously failures were silently swallowed.
  const handleApprove = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approved" }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[approve] Failed:", err);
        alert(`Could not approve suggestion: ${err.error ?? res.statusText}`);
      }
    } catch (err) {
      console.error("[approve] Network error:", err);
      alert("Network error — could not approve suggestion. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleIgnore = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ignored" }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[ignore] Failed:", err);
        alert(`Could not dismiss suggestion: ${err.error ?? res.statusText}`);
      }
    } catch (err) {
      console.error("[ignore] Network error:", err);
      alert("Network error — could not dismiss suggestion. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleModified = useCallback(async (id: string, coach_reply: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "modified", coach_reply }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[modified] Failed:", err);
        alert(`Could not save edit: ${err.error ?? res.statusText}`);
      }
    } catch (err) {
      console.error("[modified] Network error:", err);
      alert("Network error — could not save edit. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }, []);

  // ── Autonomy toggle ──
  const handleToggleAutonomy = useCallback(async () => {
    setOhToggleLoading(true);
    try {
      const res = await fetch("/api/office-hours/toggle", { method: "POST" });
      if (res.ok) {
        const { ai_autonomy_override } = await res.json();
        setOhData(prev => prev ? { ...prev, ai_autonomy_override } : prev);
      }
    } finally {
      setOhToggleLoading(false);
    }
  }, []);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ── Derived values ──
  const totalPending = suggestions.length;
  // "To watch" = readiness < 70 OR high-priority AI flag (matches design spec)
  const watching = athletes.filter(a => {
    const cs = a.current_state as CurrentState | null | undefined;
    const readiness = cs?.oura_readiness_score ?? null;
    const flags = (cs?.predictive_flags ?? []) as PredictiveFlag[];
    return (readiness !== null && readiness < 70) || flags.some(f => f.priority === "high");
  }).length;
  // "On the line" = racing within 2 weeks
  const racing = athletes.filter(a => {
    const sp = a.stable_profile as { race_date?: string } | null | undefined;
    if (!sp?.race_date) return false;
    const diff = Math.ceil((new Date(sp.race_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
    return diff >= 0 && diff <= 2;
  }).length;

  const filteredAthletes = useMemo(() => {
    const base = (() => {
      if (filter === "pending") return athletes.filter(a => (a.pending_suggestions ?? 0) > 0);
      if (filter === "watch")   return athletes.filter(a => {
        const cs = a.current_state as CurrentState | null | undefined;
        const readiness = cs?.oura_readiness_score ?? null;
        const flags = (cs?.predictive_flags ?? []) as PredictiveFlag[];
        return (readiness !== null && readiness < 70) || flags.some(f => f.priority === "high");
      });
      if (filter === "race") return athletes.filter(a => {
        const sp = a.stable_profile as { race_date?: string } | null | undefined;
        if (!sp?.race_date) return false;
        const diff = Math.ceil((new Date(sp.race_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
        return diff >= 0 && diff <= 4; // show ≤4 weeks for "racing soon" filter
      });
      return athletes;
    })().filter(a => searchQuery === '' || a.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));

    // Urgency sort: high AI flags → pending suggestions → medium AI flags → rest
    return [...base].sort((a, b) => {
      const csA = a.current_state as CurrentState | null | undefined;
      const csB = b.current_state as CurrentState | null | undefined;
      const flagsA = csA?.predictive_flags ?? [];
      const flagsB = csB?.predictive_flags ?? [];
      const highA = flagsA.some(f => f.priority === "high") ? 1 : 0;
      const highB = flagsB.some(f => f.priority === "high") ? 1 : 0;
      if (highA !== highB) return highB - highA;
      const pendA = a.pending_suggestions ?? 0;
      const pendB = b.pending_suggestions ?? 0;
      if (pendA !== pendB) return pendB - pendA;
      const medA = flagsA.some(f => f.priority === "medium") ? 1 : 0;
      const medB = flagsB.some(f => f.priority === "medium") ? 1 : 0;
      if (medA !== medB) return medB - medA;
      return 0;
    });
  }, [filter, athletes]);

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh" }}>
      <TopBand totalPending={totalPending} onInvite={() => setInviteOpen(true)} onSignOut={handleSignOut} coachName={coachName} searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 60px 32px" }}>
        <Greeting athleteCount={athletes.length} racingCount={racing} coachName={coachName} />

        {/* COA-102: Daily briefing panel */}
        <DailyDigest digest={digestData} loading={digestLoading} />

        {/* COA-104: Weekly summaries (Friday–Sunday only) */}
        {(weeklyLoading || weeklyGenerating || new Date().getDay() === 0 || new Date().getDay() === 5 || new Date().getDay() === 6) && (
          <WeeklyDigestPanel
            digests={weeklyDigests}
            loading={weeklyLoading}
            generating={weeklyGenerating}
            onGenerate={handleGenerateWeeklyDigests}
            onSend={handleSendWeeklyDigest}
            onDismiss={handleDismissWeeklyDigest}
            onEdit={handleEditWeeklyDigest}
          />
        )}

        {/* KPI mosaic row */}
        <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
          <KpiTile eyebrow="The stable" value={athletes.length} label="athletes under guidance" glyph={<G.Column size={22} color="var(--aegean-deep)" />} large />
          <KpiTile eyebrow="Need reply" value={totalPending} label={totalPending === 1 ? "message waiting" : "messages waiting"} glyph={<G.Scroll size={20} color="var(--terracotta-deep)" />} valueColor="var(--terracotta-deep)" />
          <KpiTile eyebrow="To watch" value={watching} label={watching === 1 ? "low readiness" : "low readiness"} glyph={<G.Heart size={20} color="var(--ochre)" />} valueColor="oklch(0.50 0.09 75)" />
          <KpiTile eyebrow="On the line" value={racing} label="racing in ≤2 weeks" glyph={<G.Mountain size={20} color="var(--aegean-deep)" />} valueColor="var(--aegean-deep)" />
        </section>

        {/* Tabs */}
        <nav style={{ marginTop: 32, borderBottom: "1px solid var(--rule)", display: "flex", gap: 4, alignItems: "center" }}>
          {([
            { id: "roster" as Tab, label: "The stable", badge: athletes.length },
            { id: "queue" as Tab, label: "Replies to approve", badge: totalPending, badgeAlert: totalPending > 0 },
            { id: "media" as Tab, label: "Media queue", badge: mediaReviews.length, badgeAlert: mediaReviews.length > 0 },
            { id: "officehours" as Tab, label: "Office hours", badge: null },
          ] as { id: Tab; label: string; badge: number | null; badgeAlert?: boolean }[]).map(t => (
            <button key={t.id} className={`ca-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.badge !== null && (
                <span style={{ marginLeft: 8, background: t.badgeAlert ? "var(--terracotta)" : "transparent", color: t.badgeAlert ? "oklch(0.98 0.01 50)" : "var(--ink-mute)", fontSize: t.badgeAlert ? 10 : undefined, padding: t.badgeAlert ? "2px 7px" : undefined, borderRadius: t.badgeAlert ? 10 : undefined, fontFamily: t.badgeAlert ? "var(--serif)" : undefined, letterSpacing: 0 }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
          <Link
            href="/dashboard/workouts"
            className="ca-tab"
            style={{ textDecoration: "none" }}
          >
            Training plans
          </Link>
          <Link
            href="/dashboard/onboarding"
            className="ca-tab"
            style={{ textDecoration: "none" }}
          >
            AI voice setup
          </Link>
          <div style={{ flex: 1 }} />
          {tab === "roster" && (
            <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
              {([
                { id: "all",     label: "All" },
                { id: "watch",   label: "To watch" },
                { id: "race",    label: "Racing soon" },
                { id: "pending", label: "Pending" },
              ] as { id: Filter; label: string }[]).map(f => (
                <button key={f.id} onClick={() => setFilter(f.id as Filter)} style={{ padding: "6px 12px", border: `1px solid ${filter === f.id ? "var(--ink)" : "var(--rule)"}`, background: filter === f.id ? "var(--ink)" : "transparent", color: filter === f.id ? "var(--parchment)" : "var(--ink-soft)", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 2, cursor: "pointer", transition: "all 160ms ease" }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Content */}
        <div style={{ marginTop: 24 }}>
          {tab === "roster" && (
            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {filteredAthletes.map(a => (
                <AthleteCard
                  key={a.id}
                  athlete={a}
                  href={`/dashboard/athletes/${a.id}`}
                />
              ))}
              {filteredAthletes.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center", color: "var(--ink-mute)" }}>
                  <div className="ca-ornament">◆ ◆ ◆</div>
                  <p className="ca-display-italic" style={{ fontSize: 20, marginTop: 16 }}>No athletes match this filter.</p>
                </div>
              )}
            </section>
          )}

          {tab === "queue" && (
            <QueueView
              suggestions={suggestions}
              athletes={athletes}
              onApprove={handleApprove}
              onIgnore={handleIgnore}
              onRefine={s => setRefineTarget(s)}
              actionLoading={actionLoading}
            />
          )}

          {/* COA-107: Media review queue */}
          {tab === "media" && (
            <MediaReviewQueue
              reviews={mediaReviews}
              loading={mediaLoading}
              onRefresh={handleRefreshMedia}
            />
          )}

          {tab === "officehours" && (
            <OfficeHoursView
              data={ohData}
              onToggle={handleToggleAutonomy}
              toggleLoading={ohToggleLoading}
            />
          )}
        </div>

        {/* Footer ornament */}
        <div style={{ marginTop: 48 }}>
          <Fret opacity={0.35} />
          <div className="ca-ornament" style={{ marginTop: 20, fontSize: 13, color: "var(--ink-mute)" }}>
            COACH · ATHLETE · PURPOSE
          </div>
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
      {refineTarget && (
        <RefineModal
          suggestion={refineTarget}
          onClose={() => setRefineTarget(null)}
          onSend={handleModified}
        />
      )}
    </div>
  );
}
