"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";
import type { Athlete, Suggestion } from "@/app/lib/types";

// ─── Extended types ───────────────────────────────────────────────────────────

type EnrichedAthlete = Athlete & {
  pending_suggestions?: number;
  total_checkins?: number;
  last_checkin_at?: string | null;
};

type Tab = "roster" | "queue" | "officehours";
type Filter = "all" | "pending";

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
  const sp = a.stable_profile as Record<string, unknown> | null | undefined;
  const cs = a.current_state as Record<string, unknown> | null | undefined;
  return {
    readiness: (sp?.readiness as number | undefined) ?? null,
    hrv:       String(sp?.hrv ?? "—"),
    sleep:     String(sp?.sleep ?? "—"),
    load:      String(sp?.load ?? "—"),
    trend:     (sp?.trend as string | undefined) ?? null,
    phase:     String(sp?.phase ?? "General"),
    week:      (sp?.week as number | undefined) ?? null,
    target_race:   String(sp?.target_race ?? "No race set"),
    weeks_to_race: (sp?.weeks_to_race as number | undefined) ?? 99,
    notes: (cs?.notes as string | undefined) ?? null,
  };
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
function buildWeekData() {
  const todayDow = new Date().getDay(); // 0=Sun
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1; // 0=Mon..6=Sun
  return DAY_LABELS.map((day, i) => ({
    day,
    type: i < todayIdx ? "done" : i === todayIdx ? "planned today" : "planned",
    km: [10, 0, 14, 8, 0, 20, 0][i],
  }));
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
  const bg = {
    linen:  "var(--linen-deep)",
    aegean: "var(--aegean-wash)",
    terra:  "var(--terracotta-soft)",
    ochre:  "var(--ochre-soft)",
  }[tone];
  const fg = {
    linen:  "var(--ink)",
    aegean: "var(--aegean-deep)",
    terra:  "var(--terracotta-deep)",
    ochre:  "oklch(0.40 0.08 75)",
  }[tone];

  return (
    <div
      className="ca-avatar"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.4 }}
    >
      <span>{initials}</span>
    </div>
  );
}

// ─── WeekStrip ─────────────────────────────────────────────────────────────────

function WeekStrip({ week_data }: { week_data: { day: string; type: string; km: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
      {week_data.map((d, i) => {
        const cls = ["ca-week-tile", d.type].filter(Boolean).join(" ");
        return (
          <div key={i} className={cls}>
            <div style={{ textAlign: "center", padding: 2 }}>
              <div style={{ fontSize: 9, opacity: 0.7 }}>{d.day}</div>
              {d.km > 0 ? (
                <div className="ca-num" style={{ fontSize: 13, marginTop: 1, fontFamily: "var(--serif)" }}>
                  {d.km}
                </div>
              ) : (
                <div style={{ fontSize: 8, opacity: 0.4, marginTop: 1 }}>·</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Fret border ──────────────────────────────────────────────────────────────

function Fret({ opacity = 0.5 }: { opacity?: number }) {
  return <div className="ca-fret" style={{ opacity }} />;
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  eyebrow,
  value,
  label,
  glyph,
  large = false,
  valueColor = "var(--ink)",
}: {
  eyebrow: string;
  value: number;
  label: string;
  glyph: React.ReactNode;
  large?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        padding: large ? "24px 28px" : "22px 24px",
        background: "var(--linen)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 130,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="ca-eyebrow">{eyebrow}</div>
        {glyph}
      </div>
      <div>
        <div
          className="ca-num"
          style={{ fontSize: large ? 52 : 44, lineHeight: 0.95, color: valueColor, fontFamily: "var(--serif)" }}
        >
          {value}
        </div>
        <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── TopBand ──────────────────────────────────────────────────────────────────

function TopBand({
  totalPending,
  onInvite,
  onSignOut,
}: {
  totalPending: number;
  onInvite: () => void;
  onSignOut: () => void;
}) {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--rule)",
        background: "var(--linen)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Mosaic wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 32 32">
            <rect x="2" y="2" width="28" height="28" fill="none" stroke="var(--ink)" strokeWidth="1" />
            <g fill="var(--terracotta)" opacity="0.85">
              <rect x="5" y="5" width="5" height="5" />
              <rect x="16" y="5" width="5" height="5" />
              <rect x="11" y="11" width="5" height="5" />
              <rect x="22" y="11" width="5" height="5" />
              <rect x="5" y="17" width="5" height="5" />
              <rect x="16" y="17" width="5" height="5" />
            </g>
            <g fill="var(--aegean-deep)" opacity="0.9">
              <rect x="11" y="5" width="5" height="5" />
              <rect x="22" y="5" width="5" height="5" />
              <rect x="5" y="11" width="5" height="5" />
              <rect x="16" y="11" width="5" height="5" />
              <rect x="11" y="17" width="5" height="5" />
              <rect x="22" y="17" width="5" height="5" />
            </g>
          </svg>
          <div>
            <div className="ca-display" style={{ fontSize: 20, lineHeight: 1 }}>
              Coach<span style={{ color: "var(--terracotta-deep)" }}>.</span>ai
            </div>
            <div className="ca-eyebrow" style={{ fontSize: 8.5, marginTop: 2 }}>
              THE ATHLETE'S ATHLETE
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            background: "var(--parchment)",
            border: "1px solid var(--rule)",
            borderRadius: 2,
            width: 260,
          }}
        >
          <G.Search size={14} color="var(--ink-mute)" />
          <input
            placeholder="Find an athlete…"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontFamily: "var(--body)",
              fontSize: 13,
              color: "var(--ink)",
            }}
          />
        </div>

        {/* Invite + sign-out */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="ca-btn ca-btn-terra" onClick={onInvite} style={{ fontSize: 12 }}>
            <G.Plus size={13} color="oklch(0.98 0.01 50)" />
            Invite athlete
          </button>
          <button className="ca-btn ca-btn-ghost" onClick={onSignOut} style={{ fontSize: 12 }}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

function Greeting({ athleteCount }: { athleteCount: number }) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const racingCount = 0; // TODO: wire up when race data available

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      <div>
        <div className="ca-eyebrow ca-eyebrow-terra">{date}</div>
        <h1
          className="ca-display"
          style={{ margin: "6px 0 0 0", fontSize: 42, color: "var(--ink)", letterSpacing: "-0.015em" }}
        >
          {salutation}.
        </h1>
        <p
          className="ca-display-italic"
          style={{ margin: "8px 0 0 0", fontSize: 17, color: "var(--ink-soft)", maxWidth: 560 }}
        >
          {athleteCount} athlete{athleteCount !== 1 ? "s" : ""} in the stable.{" "}
          {racingCount > 0 ? `${racingCount} on the start line this weekend.` : "Here is the day, quietly."}
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

// ─── Athlete Card ─────────────────────────────────────────────────────────────

function AthleteCard({
  athlete,
  onOpen,
}: {
  athlete: EnrichedAthlete;
  onOpen: (a: EnrichedAthlete) => void;
}) {
  const profile = getProfile(athlete);
  const pending = athlete.pending_suggestions ?? 0;
  const tone: "aegean" | "terra" | "ochre" | "linen" =
    pending > 0 ? "terra" : profile.readiness !== null && profile.readiness < 60 ? "ochre" : "aegean";

  const readinessColor =
    profile.readiness === null
      ? "var(--ink-soft)"
      : profile.readiness >= 80
      ? "var(--aegean-deep)"
      : profile.readiness >= 60
      ? "var(--ochre)"
      : "var(--terracotta-deep)";

  const weekData = useMemo(() => buildWeekData(), []);

  return (
    <article
      className="tessera ca-rise"
      style={{ padding: 0, cursor: "pointer" }}
      onClick={() => onOpen(athlete)}
    >
      {/* Top band — portrait + name + race */}
      <div style={{ padding: "18px 20px 14px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Portrait initials={getInitials(athlete.full_name)} size={52} tone={tone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <h3
              className="ca-display"
              style={{
                margin: 0,
                fontSize: 20,
                color: "var(--ink)",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {athlete.full_name ?? "Unknown"}
            </h3>
            {pending > 0 && (
              <span className="ca-chip ca-chip-terra" style={{ flexShrink: 0 }}>
                {pending} pending
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <span className="ca-eyebrow">
              {profile.phase}
              {profile.week !== null ? ` · Wk ${profile.week}` : ""}
            </span>
            {profile.target_race !== "No race set" && (
              <>
                <span style={{ color: "var(--rule)" }}>•</span>
                <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{profile.target_race}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr 1fr 1fr",
          gap: 1,
          background: "var(--rule)",
          borderTop: "1px solid var(--rule)",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <div style={{ padding: "12px 16px", background: "var(--linen)" }}>
          <div className="ca-eyebrow" style={{ fontSize: 9 }}>Readiness</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
            {profile.readiness !== null ? (
              <>
                <span className="ca-num" style={{ fontSize: 26, color: readinessColor, lineHeight: 1 }}>
                  {profile.readiness}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>/100</span>
                {profile.trend === "rising" && <G.Arrow size={10} dir="up" color={readinessColor} />}
                {profile.trend === "falling" && <G.Arrow size={10} dir="down" color={readinessColor} />}
              </>
            ) : (
              <span className="ca-num" style={{ fontSize: 20, color: "var(--ink-mute)", lineHeight: 1 }}>—</span>
            )}
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--linen)" }}>
          <div className="ca-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>
            <G.Heart size={10} /> HRV
          </div>
          <div className="ca-num" style={{ fontSize: 20, marginTop: 4, lineHeight: 1 }}>
            {profile.hrv}
            {profile.hrv !== "—" && <span style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 2 }}>ms</span>}
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--linen)" }}>
          <div className="ca-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>
            <G.Moon size={10} /> Sleep
          </div>
          <div className="ca-num" style={{ fontSize: 20, marginTop: 4, lineHeight: 1 }}>{profile.sleep}</div>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--linen)" }}>
          <div className="ca-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>
            <G.Flame size={10} /> Load
          </div>
          <div className="ca-num" style={{ fontSize: 20, marginTop: 4, lineHeight: 1 }}>{profile.load}</div>
        </div>
      </div>

      {/* Week strip */}
      <div style={{ padding: "14px 20px 6px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span className="ca-eyebrow">This week</span>
          <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)" }}>
            {athlete.total_checkins ?? 0} check-ins total
          </span>
        </div>
        <WeekStrip week_data={weekData} />
      </div>

      {/* Notes / last heard */}
      <div style={{ padding: "10px 20px 16px 20px" }}>
        {profile.notes ? (
          <div
            style={{
              borderLeft: "2px solid var(--rule)",
              paddingLeft: 10,
              fontSize: 12.5,
              color: "var(--ink-soft)",
              fontStyle: "italic",
              fontFamily: "var(--serif)",
            }}
          >
            "{profile.notes}"
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>
            Last heard · {relativeTime(athlete.last_checkin_at)}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Queue View ───────────────────────────────────────────────────────────────

const OFFICE_HOURS = [
  { day: "Monday",    hours: "07:00 – 09:00" },
  { day: "Tuesday",   hours: "07:00 – 09:00" },
  { day: "Wednesday", hours: "07:00 – 08:30" },
  { day: "Thursday",  hours: "07:00 – 09:00" },
  { day: "Friday",    hours: "07:00 – 08:00" },
  { day: "Saturday",  hours: "08:00 – 10:00" },
  { day: "Sunday",    hours: "Closed" },
];

function RhythmRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number | string;
  max: number | null;
  color: string;
}) {
  const pct = max && typeof value === "number" ? (value / max) * 100 : 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{label}</span>
        <span className="ca-num" style={{ fontSize: 14, fontFamily: "var(--serif)" }}>
          {value}
          {max !== null && (
            <span style={{ color: "var(--ink-mute)", fontSize: 11 }}> / {max}</span>
          )}
        </span>
      </div>
      <div className="ca-bar-track">
        <div className={`ca-bar-fill ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QueueView({
  suggestions,
  athletes,
}: {
  suggestions: Suggestion[];
  athletes: EnrichedAthlete[];
}) {
  const totalReplied = athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0);

  if (suggestions.length === 0) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="ca-ornament">◆ ◆ ◆</div>
        <p
          className="ca-display-italic"
          style={{ fontSize: 20, marginTop: 16, color: "var(--ink-soft)" }}
        >
          All caught up. Nothing waiting for your reply.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      {/* Suggestion list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.map((s) => (
          <article
            key={s.id}
            className="tessera ca-rise"
            style={{ padding: 20 }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              <Portrait
                initials={getInitials(s.athlete_display_name)}
                size={40}
                tone="aegean"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <div>
                    <span className="ca-display" style={{ fontSize: 17, color: "var(--ink)" }}>
                      {s.athlete_display_name ?? "Unknown athlete"}
                    </span>
                    <span
                      className="ca-mono"
                      style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 10, letterSpacing: 0.1 }}
                    >
                      {relativeTime(s.created_at)}
                    </span>
                  </div>
                  <span className="ca-chip ca-chip-ochre">Check-in</span>
                </div>

                {/* Athlete message */}
                {s.athlete_message && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      background: "var(--parchment-2)",
                      borderLeft: "2px solid var(--ochre)",
                      fontFamily: "var(--serif)",
                      fontStyle: "italic",
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "var(--ink-soft)",
                    }}
                  >
                    &ldquo;{s.athlete_message}&rdquo;
                  </div>
                )}

                {/* Suggested reply */}
                {s.suggestion_text && (
                  <div style={{ marginTop: 12 }}>
                    <div className="ca-eyebrow ca-eyebrow-aegean" style={{ fontSize: 9, marginBottom: 6 }}>
                      Suggested reply
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>
                      {s.suggestion_text.length > 220
                        ? s.suggestion_text.slice(0, 220) + "…"
                        : s.suggestion_text}
                    </p>
                  </div>
                )}

                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <button className="ca-btn ca-btn-primary" style={{ fontSize: 12 }}>
                    <G.Check size={12} color="oklch(0.97 0.02 190)" /> Approve & send
                  </button>
                  <button className="ca-btn" style={{ fontSize: 12 }}>Refine</button>
                  <button className="ca-btn ca-btn-ghost" style={{ fontSize: 12 }}>Ignore</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Right rail */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ca-panel" style={{ padding: 22 }}>
          <div className="ca-eyebrow ca-eyebrow-terra">This week&apos;s rhythm</div>
          <h3 className="ca-display" style={{ fontSize: 20, margin: "6px 0 16px 0" }}>
            Reply cadence
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RhythmRow label="Pending replies" value={suggestions.length} max={null} color="terra" />
            <RhythmRow label="Total check-ins" value={totalReplied} max={null} color="aegean" />
            <RhythmRow label="Athletes active" value={athletes.filter(a => (a.total_checkins ?? 0) > 0).length} max={athletes.length} color="ochre" />
          </div>
          <hr className="ca-hairline" style={{ margin: "18px 0" }} />
          <div
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-soft)",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            Review and approve each reply before it reaches your athlete.
          </div>
        </div>

        <div
          className="ca-panel"
          style={{
            padding: 22,
            background: "linear-gradient(155deg, oklch(0.58 0.095 195) 0%, oklch(0.48 0.085 200) 100%)",
            color: "oklch(0.96 0.02 190)",
          }}
        >
          <div className="ca-eyebrow" style={{ color: "oklch(0.85 0.05 190)" }}>The stable today</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {athletes.slice(0, 5).map((a) => (
              <div
                key={a.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 13 }}>
                  {(a.full_name ?? "").split(" ").slice(0, 2).join(" ")}
                </span>
                <span
                  className="ca-chip"
                  style={{
                    background: "oklch(1 0 0 / 0.15)",
                    borderColor: "oklch(1 0 0 / 0.25)",
                    color: "oklch(0.96 0.02 190)",
                    fontSize: 10,
                  }}
                >
                  {(a.pending_suggestions ?? 0) > 0
                    ? `${a.pending_suggestions} pending`
                    : "up to date"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Office Hours View ────────────────────────────────────────────────────────

function OfficeHoursView() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div className="ca-panel" style={{ padding: 28 }}>
        <div className="ca-eyebrow ca-eyebrow-terra">When the door is open</div>
        <h2 className="ca-display" style={{ margin: "8px 0 4px 0", fontSize: 28 }}>Office hours</h2>
        <p
          className="ca-display-italic"
          style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 4 }}
        >
          Outside these windows, athletes hear from the understudy. You hear everything tomorrow.
        </p>
        <Fret opacity={0.35} />
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 0 }}>
          {OFFICE_HOURS.map((oh, i) => {
            const closed = oh.hours === "Closed";
            return (
              <div
                key={oh.day}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "14px 0",
                  borderBottom:
                    i < OFFICE_HOURS.length - 1 ? "1px dashed var(--rule)" : "none",
                }}
              >
                <span
                  className="ca-display"
                  style={{ fontSize: 18, color: closed ? "var(--ink-mute)" : "var(--ink)" }}
                >
                  {oh.day}
                </span>
                <span
                  className="ca-mono"
                  style={{
                    fontSize: 14,
                    color: closed ? "var(--ink-mute)" : "var(--aegean-deep)",
                    letterSpacing: 0.05,
                  }}
                >
                  {oh.hours}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="ca-panel"
        style={{
          padding: 28,
          background: "linear-gradient(155deg, oklch(0.68 0.135 42) 0%, oklch(0.56 0.130 38) 100%)",
          color: "oklch(0.98 0.02 50)",
        }}
      >
        <div className="ca-eyebrow" style={{ color: "oklch(0.88 0.05 45)" }}>The understudy&apos;s voice</div>
        <h2
          className="ca-display"
          style={{ margin: "8px 0 4px 0", fontSize: 28, color: "oklch(0.98 0.02 50)" }}
        >
          After-hours reply
        </h2>
        <Fret opacity={0.3} />
        <div
          style={{
            marginTop: 20,
            padding: "18px 22px",
            background: "oklch(1 0 0 / 0.1)",
            border: "1px solid oklch(1 0 0 / 0.2)",
            borderRadius: 2,
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.55,
            color: "oklch(0.98 0.02 50)",
          }}
        >
          &ldquo;Your coach is off the pitch until morning. I&apos;ve taken your note and they&apos;ll see
          it first thing. If this is urgent — pain, illness, racing today — reply URGENT.&rdquo;
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button
            className="ca-btn"
            style={{
              background: "oklch(1 0 0 / 0.15)",
              color: "oklch(0.98 0.02 50)",
              borderColor: "oklch(1 0 0 / 0.3)",
              fontSize: 12,
            }}
          >
            Edit voice
          </button>
          <button
            className="ca-btn"
            style={{
              background: "oklch(1 0 0 / 0.15)",
              color: "oklch(0.98 0.02 50)",
              borderColor: "oklch(1 0 0 / 0.3)",
              fontSize: 12,
            }}
          >
            Urgency rules
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite Modal (lightweight) ────────────────────────────────────────────────

function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${BACKEND}/api/v1/athlete/auth/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: name, email, phone_number: phone }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.detail ?? "Failed to send invite.");
        setLoading(false);
        return;
      }
      const body = await res.json();
      setDone(body.invite_link ?? "Invite sent!");
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0.28 0.022 55 / 0.4)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="ca-panel"
        style={{ width: "100%", maxWidth: 440, padding: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>New member</div>
        <h2 className="ca-display" style={{ fontSize: 26, margin: "0 0 20px 0" }}>Invite an athlete</h2>

        {done ? (
          <div>
            <div
              style={{
                padding: "14px 18px",
                background: "var(--aegean-wash)",
                border: "1px solid var(--aegean-soft)",
                borderRadius: 2,
                fontFamily: "var(--serif)",
                fontSize: 14,
                color: "var(--aegean-deep)",
                wordBreak: "break-all",
                marginBottom: 20,
              }}
            >
              {done}
            </div>
            <p className="ca-display-italic" style={{ color: "var(--ink-soft)", fontSize: 14 }}>
              Invite sent! The athlete will receive an email with their account setup link.
            </p>
            <button className="ca-btn ca-btn-primary" onClick={onClose} style={{ marginTop: 20, width: "100%" }}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            {[
              { label: "Full name", value: name, set: setName, type: "text", placeholder: "Alex Thompson", required: true },
              { label: "Email address", value: email, set: setEmail, type: "email", placeholder: "alex@example.com", required: true },
              { label: "WhatsApp number", value: phone, set: setPhone, type: "tel", placeholder: "+1 555 000 0000", required: false },
            ].map((f) => (
              <div key={f.label}>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                    marginBottom: 6,
                  }}
                >
                  {f.label}
                </label>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  required={f.required}
                  placeholder={f.placeholder}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: "var(--parchment)",
                    border: "1px solid var(--rule)",
                    borderRadius: 2,
                    fontFamily: "var(--body)",
                    fontSize: 13,
                    color: "var(--ink)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--terracotta-soft)",
                  border: "1px solid oklch(0.80 0.08 45)",
                  borderRadius: 2,
                  color: "var(--terracotta-deep)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="submit"
                disabled={loading}
                className="ca-btn ca-btn-terra"
                style={{ flex: 1 }}
              >
                {loading ? "Sending…" : "Send invite →"}
              </button>
              <button type="button" className="ca-btn ca-btn-ghost" onClick={onClose}>
                Cancel
              </button>
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
  suggestions,
}: {
  athletes: EnrichedAthlete[];
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("roster");
  const [filter, setFilter] = useState<Filter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);

  const totalPending = suggestions.length;
  const watching = athletes.filter((a) => (a.pending_suggestions ?? 0) > 0).length;

  const filteredAthletes = useMemo(() => {
    if (filter === "pending") return athletes.filter((a) => (a.pending_suggestions ?? 0) > 0);
    return athletes;
  }, [filter, athletes]);

  async function handleSignOut() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh" }}>
      <TopBand
        totalPending={totalPending}
        onInvite={() => setInviteOpen(true)}
        onSignOut={handleSignOut}
      />

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 60px 32px" }}>
        <Greeting athleteCount={athletes.length} />

        {/* KPI mosaic row */}
        <section
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr 1fr 1fr",
            gap: 1,
            background: "var(--rule)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <KpiTile
            eyebrow="The stable"
            value={athletes.length}
            label="athletes under guidance"
            glyph={<G.Column size={22} color="var(--aegean-deep)" />}
            large
          />
          <KpiTile
            eyebrow="Need reply"
            value={totalPending}
            label={totalPending === 1 ? "message waiting" : "messages waiting"}
            glyph={<G.Scroll size={20} color="var(--terracotta-deep)" />}
            valueColor="var(--terracotta-deep)"
          />
          <KpiTile
            eyebrow="Pending replies"
            value={watching}
            label="athletes with messages"
            glyph={<G.Heart size={20} color="var(--ochre)" />}
            valueColor="oklch(0.50 0.09 75)"
          />
          <KpiTile
            eyebrow="Check-ins total"
            value={athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0)}
            label="across all athletes"
            glyph={<G.Mountain size={20} color="var(--aegean-deep)" />}
            valueColor="var(--aegean-deep)"
          />
        </section>

        {/* Tabs */}
        <nav
          style={{
            marginTop: 32,
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            gap: 4,
            alignItems: "center",
          }}
        >
          <button
            className={`ca-tab ${tab === "roster" ? "active" : ""}`}
            onClick={() => setTab("roster")}
          >
            The stable{" "}
            <span style={{ marginLeft: 8, color: "var(--ink-mute)", fontFamily: "var(--serif)", letterSpacing: 0 }}>
              {athletes.length}
            </span>
          </button>
          <button
            className={`ca-tab ${tab === "queue" ? "active" : ""}`}
            onClick={() => setTab("queue")}
          >
            Replies to approve
            {totalPending > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  background: "var(--terracotta)",
                  color: "oklch(0.98 0.01 50)",
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 10,
                  fontFamily: "var(--serif)",
                  letterSpacing: 0,
                }}
              >
                {totalPending}
              </span>
            )}
          </button>
          <button
            className={`ca-tab ${tab === "officehours" ? "active" : ""}`}
            onClick={() => setTab("officehours")}
          >
            Office hours
          </button>
          <div style={{ flex: 1 }} />
          {tab === "roster" && (
            <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
              {(["all", "pending"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${filter === f ? "var(--ink)" : "var(--rule)"}`,
                    background: filter === f ? "var(--ink)" : "transparent",
                    color: filter === f ? "var(--parchment)" : "var(--ink-soft)",
                    fontFamily: "var(--mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    borderRadius: 2,
                    cursor: "pointer",
                    transition: "all 160ms ease",
                  }}
                >
                  {f === "all" ? "All" : "Pending"}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Content */}
        <div style={{ marginTop: 24 }}>
          {tab === "roster" && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              {filteredAthletes.map((a) => (
                <AthleteCard
                  key={a.id}
                  athlete={a}
                  onOpen={() => {}}
                />
              ))}
              {filteredAthletes.length === 0 && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: 60,
                    textAlign: "center",
                    color: "var(--ink-mute)",
                  }}
                >
                  <div className="ca-ornament">◆ ◆ ◆</div>
                  <p
                    className="ca-display-italic"
                    style={{ fontSize: 20, marginTop: 16 }}
                  >
                    No athletes match this filter.
                  </p>
                </div>
              )}
            </section>
          )}

          {tab === "queue" && (
            <QueueView suggestions={suggestions} athletes={athletes} />
          )}

          {tab === "officehours" && <OfficeHoursView />}
        </div>

        {/* Footer ornament */}
        <div style={{ marginTop: 48 }}>
          <Fret opacity={0.35} />
          <div
            className="ca-ornament"
            style={{ marginTop: 20, fontSize: 13, color: "var(--ink-mute)" }}
          >
            COACH · ATHLETE · PURPOSE
          </div>
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
