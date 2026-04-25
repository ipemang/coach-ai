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

type Tab = "roster" | "queue" | "officehours";
type Filter = "all" | "pending";

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

function TopBand({ totalPending, onInvite, onSignOut }: { totalPending: number; onInvite: () => void; onSignOut: () => void; }) {
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
          <input placeholder="Find an athlete…" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)" }} />
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
          <button className="ca-btn ca-btn-ghost" onClick={onSignOut} style={{ fontSize: 12 }}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

function Greeting({ athleteCount }: { athleteCount: number }) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      <div>
        <div className="ca-eyebrow ca-eyebrow-terra">{date}</div>
        <h1 className="ca-display" style={{ margin: "6px 0 0 0", fontSize: 42, color: "var(--ink)", letterSpacing: "-0.015em" }}>
          {salutation}.
        </h1>
        <p className="ca-display-italic" style={{ margin: "8px 0 0 0", fontSize: 17, color: "var(--ink-soft)", maxWidth: 560 }}>
          {athleteCount} athlete{athleteCount !== 1 ? "s" : ""} in the stable. Here is the day, quietly.
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
                    <span className="ca-chip ca-chip-ochre">Check-in</span>
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
          &ldquo;Your coach is off the pitch until morning. I&apos;ve taken your note and they&apos;ll see it first thing. If this is urgent — pain, illness, racing today — reply URGENT.&rdquo;
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          {[{ label: "Edit voice" }, { label: "Urgency rules" }].map(b => (
            <button key={b.label} className="ca-btn" style={{ background: "oklch(1 0 0 / 0.15)", color: "oklch(0.98 0.02 50)", borderColor: "oklch(1 0 0 / 0.3)", fontSize: 12 }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
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
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invite_url: string; sent_whatsapp: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
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
          phone_number: phone.trim() || undefined,
          expires_in_days: 30,
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
              <button
                className="ca-btn ca-btn-primary"
                style={{ flex: 1 }}
                onClick={handleCopy}
              >
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
            {[
              { label: "Full name", value: name, set: setName, type: "text", placeholder: "Alex Thompson", required: true },
              { label: "WhatsApp number (optional)", value: phone, set: setPhone, type: "tel", placeholder: "+1 555 000 0000", required: false },
            ].map((f) => (
              <div key={f.label}>
                <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>{f.label}</label>
                <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} required={f.required} placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)", outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic", margin: 0 }}>
              If a WhatsApp number is provided, the invite link is sent automatically. Otherwise you&apos;ll get a link to share manually.
            </p>
            {error && <div style={{ padding: "10px 14px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="submit" disabled={loading || !name.trim()} className="ca-btn ca-btn-terra" style={{ flex: 1 }}>{loading ? "Creating…" : "Create invite →"}</button>
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

  // ── Live suggestions (start from SSR data, updated by real-time + actions) ──
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Office hours ──
  const [ohData, setOhData] = useState<OfficeHoursData | null>(null);
  const [ohToggleLoading, setOhToggleLoading] = useState(false);

  // ── COA-102: Daily digest ──
  const [digestData, setDigestData] = useState<DigestData | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);

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

  // ── Fetch office hours when tab is active ──
  useEffect(() => {
    if (tab !== "officehours" || ohData !== null) return;
    fetch("/api/office-hours")
      .then(r => r.json())
      .then((d: OfficeHoursData) => setOhData(d))
      .catch(() => {}); // non-fatal
  }, [tab, ohData]);

  // ── Suggestion actions ──
  const handleApprove = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approved" }),
      });
      if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id));
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
      if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id));
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
      if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id));
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
  const watching = athletes.filter(a => (a.pending_suggestions ?? 0) > 0).length;
  const filteredAthletes = useMemo(() => {
    const base = filter === "pending"
      ? athletes.filter(a => (a.pending_suggestions ?? 0) > 0)
      : athletes;

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
      <TopBand totalPending={totalPending} onInvite={() => setInviteOpen(true)} onSignOut={handleSignOut} />

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 60px 32px" }}>
        <Greeting athleteCount={athletes.length} />

        {/* COA-102: Daily briefing panel */}
        <DailyDigest digest={digestData} loading={digestLoading} />

        {/* KPI mosaic row */}
        <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
          <KpiTile eyebrow="The stable" value={athletes.length} label="athletes under guidance" glyph={<G.Column size={22} color="var(--aegean-deep)" />} large />
          <KpiTile eyebrow="Need reply" value={totalPending} label={totalPending === 1 ? "message waiting" : "messages waiting"} glyph={<G.Scroll size={20} color="var(--terracotta-deep)" />} valueColor="var(--terracotta-deep)" />
          <KpiTile eyebrow="Pending replies" value={watching} label="athletes with messages" glyph={<G.Heart size={20} color="var(--ochre)" />} valueColor="oklch(0.50 0.09 75)" />
          <KpiTile eyebrow="Check-ins total" value={athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0)} label="across all athletes" glyph={<G.Mountain size={20} color="var(--aegean-deep)" />} valueColor="var(--aegean-deep)" />
        </section>

        {/* Tabs */}
        <nav style={{ marginTop: 32, borderBottom: "1px solid var(--rule)", display: "flex", gap: 4, alignItems: "center" }}>
          {([
            { id: "roster" as Tab, label: "The stable", badge: athletes.length },
            { id: "queue" as Tab, label: "Replies to approve", badge: totalPending, badgeAlert: totalPending > 0 },
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
              {(["all", "pending"] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 12px", border: `1px solid ${filter === f ? "var(--ink)" : "var(--rule)"}`, background: filter === f ? "var(--ink)" : "transparent", color: filter === f ? "var(--parchment)" : "var(--ink-soft)", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 2, cursor: "pointer", transition: "all 160ms ease" }}>
                  {f === "all" ? "All" : "Pending"}
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
