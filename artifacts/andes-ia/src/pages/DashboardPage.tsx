import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { BACKEND, getAuthToken } from "../lib/api";
import type { Athlete, Suggestion, StableProfile, CurrentState, PredictiveFlag } from "../lib/types";

type WeekWorkout = { scheduled_date: string; status: string; distance_km: number | null };
type BiometricBaseline = { readiness_avg: number | null; hrv_avg: number | null; sleep_avg: number | null };
type EnrichedAthlete = Athlete & { pending_suggestions?: number; total_checkins?: number; last_checkin_at?: string | null; week_workouts?: WeekWorkout[]; biometric_baseline?: BiometricBaseline | null };
type Tab = "roster" | "queue" | "media" | "officehours";
type Filter = "all" | "pending";
interface OfficeHoursData { office_hours: Record<string, unknown> | null; ai_autonomy_override: boolean; is_currently_autonomous: boolean }
type DigestData = { generated_at: string; summary: string; athlete_flags: { athlete_id: string; name: string; reason: string }[] };
type MediaReview = { id: string; athlete_id: string; media_type: "image" | "video"; ai_analysis: string | null; coach_edited_analysis: string | null; coach_comment: string | null; signed_url: string | null; status: string; created_at: string; athletes?: { full_name: string | null; display_name: string | null } | null };

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
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
  let weeksToRace = 99;
  if (sp?.race_date) {
    const diff = Math.ceil((new Date(sp.race_date).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
    weeksToRace = diff > 0 ? diff : 0;
  }
  return {
    readiness: (cs?.oura_readiness_score ?? null) as number | null,
    hrv: cs?.oura_avg_hrv != null ? String(Math.round(cs.oura_avg_hrv)) : "—",
    sleep: cs?.oura_sleep_score != null ? String(cs.oura_sleep_score) : "—",
    load: cs?.strava_last_distance_km != null ? `${cs.strava_last_distance_km}km` : "—",
    phase: cs?.training_phase ?? "General",
    week: (cs?.training_week ?? null) as number | null,
    target_race: sp?.target_race ?? "No race set",
    weeks_to_race: weeksToRace,
    notes: cs?.coach_notes ?? sp?.notes ?? null,
    predictive_flags: (cs?.predictive_flags ?? []) as PredictiveFlag[],
  };
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function buildWeekData(workouts: WeekWorkout[] = []) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1;
  const byDate: Record<string, { km: number; type: string }> = {};
  for (const w of workouts) {
    const date = w.scheduled_date.split("T")[0];
    if (!byDate[date]) byDate[date] = { km: 0, type: "" };
    byDate[date].km += w.distance_km ?? 0;
    const wDate = new Date(date + "T12:00:00");
    const isToday = wDate.toDateString() === today.toDateString();
    const isPast = wDate < today;
    byDate[date].type = isToday ? (w.status === "completed" ? "done" : "planned today") : isPast ? (w.status === "completed" ? "done" : "missed") : "planned";
  }
  return DAY_LABELS.map((day, i) => {
    const d = new Date(today); d.setDate(today.getDate() - todayIdx + i);
    const dateStr = d.toISOString().split("T")[0];
    const entry = byDate[dateStr];
    return { day, type: entry?.type ?? "", km: entry?.km ?? 0 };
  });
}

const G = {
  Plus: () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5 L12 19 M5 12 L19 12" /></svg>,
  Search: () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="6" /><path d="M15 15 L20 20" /></svg>,
  Check: () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12 L10 17 L19 7" /></svg>,
  Edit: () => <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  X: () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>,
  Arrow: ({ dir = "right" }: { dir?: "up" | "down" | "right" | "left" }) => {
    const rot = { right: 0, left: 180, up: -90, down: 90 }[dir] ?? 0;
    return <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: `rotate(${rot}deg)` }}><path d="M5 12 L19 12 M14 7 L19 12 L14 17" /></svg>;
  },
  Sun: () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>,
  Column: () => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 4h12v2H6zM7 6v12M17 6v12M10 6v12M14 6v12M5 18h14v2H5z" /></svg>,
  Heart: () => <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M12 20C4 14 3 9 6 6c3-3 6 0 6 2c0-2 3-5 6-2c3 3 2 8-6 14z" /></svg>,
  Moon: () => <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M20 14c-1 4-5 7-9 7-5 0-8-4-8-9 0-4 3-8 7-9-2 3-1 8 2 10 3 2 6 1 8 1z" /></svg>,
  Flame: () => <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M12 3c-4 4-6 7-6 11 0 4 3 7 6 7s6-3 6-7c0-4-3-5-4-8-.5 2-1.5 3-2 3z" /></svg>,
  Scroll: () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M5 4c0 0 0 4 3 4h11v10c0 2-2 2-2 2H6c-2 0-2-2-2-4V4z" /><path d="M8 8v10M11 12h5M11 15h5" /></svg>,
  Mountain: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 20l6-10 4 5 4-9 6 14z" /></svg>,
};

function Portrait({ initials, size = 44, tone = "linen" }: { initials: string; size?: number; tone?: "linen" | "aegean" | "terra" | "ochre" }) {
  const bg = { linen: "var(--linen-deep)", aegean: "var(--aegean-wash)", terra: "var(--terracotta-soft)", ochre: "var(--ochre-soft)" }[tone];
  const fg = { linen: "var(--ink)", aegean: "var(--aegean-deep)", terra: "var(--terracotta-deep)", ochre: "oklch(0.40 0.08 75)" }[tone];
  return (
    <div className="ca-avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.4 }}>
      <span>{initials}</span>
    </div>
  );
}

function WeekStrip({ week_data }: { week_data: { day: string; type: string; km: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
      {week_data.map((d, i) => (
        <div key={i} className={`ca-week-tile ${d.type}`}>
          <div style={{ textAlign: "center", padding: 2 }}>
            <div style={{ fontSize: 9, opacity: 0.7 }}>{d.day}</div>
            {d.km > 0 ? <div style={{ fontSize: 13, marginTop: 1, fontFamily: "var(--serif)" }}>{d.km}</div> : <div style={{ fontSize: 8, opacity: 0.4, marginTop: 1 }}>·</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiTile({ eyebrow, value, label, glyph, large = false, valueColor = "var(--ink)" }: { eyebrow: string; value: number; label: string; glyph: React.ReactNode; large?: boolean; valueColor?: string }) {
  return (
    <div style={{ padding: large ? "24px 28px" : "22px 24px", background: "var(--linen)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 130 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="ca-eyebrow">{eyebrow}</div>
        {glyph}
      </div>
      <div>
        <div style={{ fontSize: large ? 52 : 44, lineHeight: 0.95, color: valueColor, fontFamily: "var(--serif)" }}>{value}</div>
        <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic" }}>{label}</div>
      </div>
    </div>
  );
}

function Greeting({ athleteCount }: { athleteCount: number }) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      <div>
        <div className="ca-eyebrow ca-eyebrow-terra">{date}</div>
        <h1 className="ca-display" style={{ margin: "6px 0 0 0", fontSize: 42, color: "var(--ink)", letterSpacing: "-0.015em" }}>{salutation}.</h1>
        <p className="ca-display-italic" style={{ margin: "8px 0 0 0", fontSize: 17, color: "var(--ink-soft)", maxWidth: 560 }}>
          {athleteCount} athlete{athleteCount !== 1 ? "s" : ""} in the stable. Here is the day, quietly.
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="ca-eyebrow ca-eyebrow-aegean">Daily intention</div>
        <div className="ca-display-italic" style={{ fontSize: 15, marginTop: 6, color: "var(--ink-soft)", maxWidth: 240 }}>Listen first. Change the plan second.</div>
      </div>
    </div>
  );
}

function AthleteCard({ athlete, href }: { athlete: EnrichedAthlete; href: string }) {
  const profile = getProfile(athlete);
  const pending = athlete.pending_suggestions ?? 0;
  const tone: "terra" | "aegean" = pending > 0 ? "terra" : "aegean";
  const readinessColor = profile.readiness === null ? "var(--ink-soft)" : profile.readiness >= 80 ? "var(--aegean-deep)" : profile.readiness >= 60 ? "var(--ochre)" : "var(--terracotta-deep)";
  const weekData = useMemo(() => buildWeekData(athlete.week_workouts), [athlete.week_workouts]);
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleResendPlanLink(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (resendState === "loading") return;
    setResendState("loading");
    try {
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND}/api/v1/athletes/${athlete.id}/resend-plan-link`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      setResendState(res.ok ? "sent" : "error");
      setTimeout(() => setResendState("idle"), 3000);
    } catch { setResendState("error"); setTimeout(() => setResendState("idle"), 3000); }
  }

  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      <article className="tessera ca-rise" style={{ padding: 0, cursor: "pointer" }}>
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
              {profile.target_race !== "No race set" && (<><span style={{ color: "var(--rule)" }}>•</span><span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{profile.target_race}</span></>)}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", gap: 1, background: "var(--rule)", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
          {[
            { label: "Readiness", value: profile.readiness !== null ? <><span style={{ fontSize: 26, color: readinessColor, fontFamily: "var(--serif)" }}>{profile.readiness}</span><span style={{ fontSize: 11, color: "var(--ink-mute)" }}>/100</span></> : <span style={{ fontSize: 20, color: "var(--ink-mute)", fontFamily: "var(--serif)" }}>—</span>, icon: null },
            { label: "HRV", value: <>{profile.hrv}{profile.hrv !== "—" && <span style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 2 }}>ms</span>}</>, icon: <G.Heart /> },
            { label: "Sleep", value: profile.sleep, icon: <G.Moon /> },
            { label: "Load", value: profile.load, icon: <G.Flame /> },
          ].map((m, i) => (
            <div key={i} style={{ padding: "12px 14px", background: "var(--linen)" }}>
              <div className="ca-eyebrow" style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>{m.icon} {m.label}</div>
              <div style={{ fontSize: 20, marginTop: 4, lineHeight: 1, fontFamily: "var(--serif)" }}>{m.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "14px 20px 6px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className="ca-eyebrow">This week</span>
            <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)" }}>{athlete.total_checkins ?? 0} check-ins</span>
          </div>
          <WeekStrip week_data={weekData} />
        </div>

        {profile.predictive_flags.length > 0 && (
          <div style={{ padding: "0 20px 10px 20px", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {profile.predictive_flags.slice(0, 3).map(f => (
              <span key={f.code} className={`ca-chip ${f.priority === "high" ? "ca-chip-terra" : f.priority === "medium" ? "ca-chip-ochre" : ""}`} style={{ fontSize: 10 }} title={f.reason}>{f.label}</span>
            ))}
          </div>
        )}

        <div style={{ padding: "10px 20px 14px 20px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {profile.notes
              ? <div style={{ borderLeft: "2px solid var(--rule)", paddingLeft: 10, fontSize: 12.5, color: "var(--ink-soft)", fontStyle: "italic", fontFamily: "var(--serif)" }}>"{profile.notes}"</div>
              : <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>Last heard · {relativeTime(athlete.last_checkin_at)}</div>
            }
          </div>
          <button onClick={handleResendPlanLink} disabled={resendState === "loading"} style={{ flexShrink: 0, padding: "5px 10px", border: "1px solid var(--rule)", borderRadius: 2, background: resendState === "sent" ? "var(--aegean-wash)" : resendState === "error" ? "var(--terracotta-soft)" : "transparent", color: resendState === "sent" ? "var(--aegean-deep)" : resendState === "error" ? "var(--terracotta-deep)" : "var(--ink-mute)", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.08em", cursor: resendState === "loading" ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            {resendState === "loading" ? "Sending…" : resendState === "sent" ? "✓ Link sent" : resendState === "error" ? "Failed" : "Resend plan link"}
          </button>
        </div>
      </article>
    </Link>
  );
}

function QueueView({ suggestions, athletes, onApprove, onIgnore, onRefine, actionLoading }: { suggestions: Suggestion[]; athletes: EnrichedAthlete[]; onApprove: (id: string) => void; onIgnore: (id: string) => void; onRefine: (s: Suggestion) => void; actionLoading: string | null }) {
  if (suggestions.length === 0) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <div className="ca-ornament">◆ ◆ ◆</div>
        <p className="ca-display-italic" style={{ fontSize: 20, marginTop: 16, color: "var(--ink-soft)" }}>All caught up. Nothing waiting for your reply.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.map(s => {
          const busy = actionLoading === s.id;
          return (
            <article key={s.id} className="tessera ca-rise" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 14 }}>
                <Portrait initials={getInitials(s.athlete_display_name)} size={40} tone="aegean" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div>
                      <span className="ca-display" style={{ fontSize: 17, color: "var(--ink)" }}>{s.athlete_display_name ?? "Unknown athlete"}</span>
                      <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 10 }}>{relativeTime(s.created_at)}</span>
                    </div>
                    <span className="ca-chip ca-chip-ochre">Check-in</span>
                  </div>
                  {s.athlete_message && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--parchment-2)", borderLeft: "2px solid var(--ochre)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)" }}>&ldquo;{s.athlete_message}&rdquo;</div>
                  )}
                  {s.suggestion_text && (
                    <div style={{ marginTop: 12 }}>
                      <div className="ca-eyebrow ca-eyebrow-aegean" style={{ fontSize: 9, marginBottom: 6 }}>Suggested reply</div>
                      <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.55 }}>{s.suggestion_text.length > 220 ? s.suggestion_text.slice(0, 220) + "…" : s.suggestion_text}</p>
                    </div>
                  )}
                  <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="ca-btn ca-btn-primary" style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => onApprove(s.id)}><G.Check /> {busy ? "Sending…" : "Approve & send"}</button>
                    <button className="ca-btn" style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => onRefine(s)}><G.Edit /> Refine</button>
                    <button className="ca-btn ca-btn-ghost" style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => onIgnore(s.id)}>Ignore</button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ca-panel" style={{ padding: 22 }}>
          <div className="ca-eyebrow ca-eyebrow-terra">This week's rhythm</div>
          <h3 className="ca-display" style={{ fontSize: 20, margin: "6px 0 16px 0" }}>Reply cadence</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Pending replies</span><span style={{ fontFamily: "var(--serif)", fontSize: 14, color: "var(--terracotta-deep)" }}>{suggestions.length}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Total check-ins</span><span style={{ fontFamily: "var(--serif)", fontSize: 14 }}>{athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0)}</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function RefineModal({ suggestion, onClose, onSend }: { suggestion: Suggestion; onClose: () => void; onSend: (id: string, text: string) => void }) {
  const [text, setText] = useState(suggestion.suggestion_text ?? "");
  const [loading, setLoading] = useState(false);
  async function handleSend() { setLoading(true); await onSend(suggestion.id, text); setLoading(false); onClose(); }
  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 560, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 6 }}>Edit before sending</div>
            <h2 className="ca-display" style={{ fontSize: 24, margin: 0 }}>Refine reply to {suggestion.athlete_display_name}</h2>
          </div>
          <button className="ca-btn ca-btn-ghost" onClick={onClose} style={{ padding: 6 }}><G.X /></button>
        </div>
        {suggestion.athlete_message && (
          <div style={{ padding: "10px 14px", background: "var(--parchment-2)", borderLeft: "2px solid var(--ochre)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)", marginBottom: 16 }}>&ldquo;{suggestion.athlete_message}&rdquo;</div>
        )}
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6} style={{ width: "100%", padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 14, color: "var(--ink)", outline: "none", resize: "vertical", lineHeight: 1.55, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="ca-btn ca-btn-primary" onClick={handleSend} disabled={loading || !text.trim()} style={{ flex: 1 }}><G.Check /> {loading ? "Sending…" : "Send modified reply"}</button>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false); const [result, setResult] = useState<{ invite_url: string; sent_whatsapp: boolean } | null>(null);
  const [copied, setCopied] = useState(false); const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim() || !email.trim()) return;
    setLoading(true); setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND}/api/v1/athletes/invite`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ full_name: name.trim(), email: email.trim(), phone_number: phone.trim() || undefined }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError((body?.detail as string) ?? "Failed to create invite."); } else { setResult({ invite_url: body.invite_url, sent_whatsapp: !!body.sent_whatsapp }); }
    } catch { setError("Network error — please try again."); }
    setLoading(false);
  }

  const inputStyle: React.CSSProperties = { padding: "9px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)", outline: "none", boxSizing: "border-box", width: "100%" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 440, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>New member</div>
        <h2 className="ca-display" style={{ fontSize: 26, margin: "0 0 20px 0" }}>Invite an athlete</h2>
        {result ? (
          <div>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", fontFamily: "var(--serif)", marginBottom: 16 }}>{result.sent_whatsapp ? `✅ Invite sent to ${name} via WhatsApp. You can also share this link:` : `Share this onboarding link with ${name}:`}</p>
            <div style={{ padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontSize: 12, fontFamily: "var(--mono)", color: "var(--aegean-deep)", wordBreak: "break-all", marginBottom: 12 }}>{result.invite_url}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ca-btn ca-btn-primary" style={{ flex: 1 }} onClick={async () => { await navigator.clipboard.writeText(result.invite_url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? "✓ Copied!" : "Copy link"}</button>
              <button className="ca-btn ca-btn-ghost" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <div><label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Full name</label><input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Alex Thompson" style={inputStyle} /></div>
            <div><label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="alex@example.com" style={inputStyle} /></div>
            <div><label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>WhatsApp number <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label><input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 1234" style={inputStyle} /></div>
            {error && <div style={{ padding: "10px 14px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={loading || !name.trim() || !email.trim()} className="ca-btn ca-btn-terra" style={{ flex: 1 }}>{loading ? "Creating…" : "Send invite →"}</button>
              <button type="button" className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [athletes, setAthletes] = useState<EnrichedAthlete[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("roster");
  const [filter, setFilter] = useState<Filter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [refineTarget, setRefineTarget] = useState<Suggestion | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [ohData, setOhData] = useState<OfficeHoursData | null>(null);
  const [digestData, setDigestData] = useState<DigestData | null>(null);
  const [mediaReviews, setMediaReviews] = useState<MediaReview[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaActionLoading, setMediaActionLoading] = useState<string | null>(null);
  const [mediaComment, setMediaComment] = useState<Record<string, string>>({});
  const [digestDismissed, setDigestDismissed] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getAuthToken();
      if (!token) { navigate("/login"); return; }
      try {
        const [athletesRes, suggestionsRes] = await Promise.all([
          fetch(`${BACKEND}/api/v1/athletes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND}/api/v1/suggestions/pending`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (athletesRes.status === 401) { navigate("/login"); return; }
        if (athletesRes.ok) setAthletes(await athletesRes.json());
        if (suggestionsRes.ok) setSuggestions(await suggestionsRes.json());
      } catch { setError("Could not load dashboard. Please check your connection."); }
      setLoading(false);
    }
    load();
  }, [navigate]);

  useEffect(() => {
    if (tab !== "media") return;
    async function loadMedia() {
      setMediaLoading(true);
      const token = await getAuthToken();
      try {
        const res = await fetch(`${BACKEND}/api/v1/media-reviews`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (res.ok) setMediaReviews((await res.json()).reviews ?? []);
      } catch {} finally { setMediaLoading(false); }
    }
    loadMedia();
  }, [tab]);

  useEffect(() => {
    if (tab !== "officehours" || ohData) return;
    (async () => {
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND}/api/v1/office-hours`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setOhData(await res.json());
      else setOhData({ office_hours: null, ai_autonomy_override: false, is_currently_autonomous: false });
    })();
  }, [tab, ohData]);

  useEffect(() => {
    async function loadDigest() {
      const token = await getAuthToken();
      if (!token) return;
      try {
        const res = await fetch(`${BACKEND}/api/v1/coach/daily-digest`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setDigestData(await res.json());
      } catch {}
    }
    loadDigest();
  }, []);

  useEffect(() => {
    if (!athletes.length) return;
    const sb = createBrowserSupabase();
    if (!sb) return;
    const channel = sb.channel("dashboard-suggestions-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "suggestions" }, (payload: { new: Record<string, unknown> }) => {
        const r = payload.new as Record<string, unknown>;
        if (r.status === "pending") {
          setSuggestions(prev => [{ id: r.id as string, athlete_id: r.athlete_id as string ?? null, athlete_display_name: r.athlete_display_name as string ?? null, suggestion_text: r.suggestion_text as string ?? null, status: "pending", coach_reply: null, created_at: r.created_at as string, updated_at: r.updated_at as string, athlete_message: null } as Suggestion, ...prev]);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "suggestions" }, (payload: { new: Record<string, unknown> }) => {
        if (payload.new.status !== "pending") setSuggestions(prev => prev.filter(s => s.id !== (payload.new.id as string)));
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [athletes.length]);

  const handleApprove = useCallback(async (id: string) => {
    setActionLoading(id);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/suggestions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "approved" }) });
      if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id));
    } finally { setActionLoading(null); }
  }, []);

  const handleIgnore = useCallback(async (id: string) => {
    setActionLoading(id);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/suggestions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "ignored" }) });
      if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id));
    } finally { setActionLoading(null); }
  }, []);

  const handleModified = useCallback(async (id: string, coach_reply: string) => {
    setActionLoading(id);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/suggestions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: "modified", coach_reply }) });
      if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id));
    } finally { setActionLoading(null); }
  }, []);

  async function handleSignOut() { const sb = createBrowserSupabase(); if (sb) await sb.auth.signOut(); navigate("/login"); }

  const handleMediaAction = useCallback(async (id: string, action: "approved" | "rejected", comment?: string) => {
    setMediaActionLoading(id);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/media-reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, coach_comment: comment ?? null }),
      });
      if (res.ok) setMediaReviews(prev => prev.filter(r => r.id !== id));
    } finally { setMediaActionLoading(null); }
  }, []);

  const totalPending = suggestions.length;
  const filteredAthletes = useMemo(() => {
    const base = filter === "pending" ? athletes.filter(a => (a.pending_suggestions ?? 0) > 0) : athletes;
    return [...base].sort((a, b) => (b.pending_suggestions ?? 0) - (a.pending_suggestions ?? 0));
  }, [filter, athletes]);

  if (loading) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="ca-avatar" style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 20px" }}><span>A</span></div>
          <p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="ca-panel" style={{ padding: 40, textAlign: "center", maxWidth: 400 }}>
          <p style={{ fontSize: 13, color: "var(--terracotta-deep)", marginBottom: 16 }}>{error}</p>
          <button className="ca-btn ca-btn-primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }

  const DAY_KEYS_OH = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_NAMES_OH = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--rule)", background: "var(--linen)", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 32px", display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 32 32">
              <rect x="2" y="2" width="28" height="28" fill="none" stroke="var(--ink)" strokeWidth="1" />
              <g fill="var(--terracotta)" opacity="0.85"><rect x="5" y="5" width="5" height="5" /><rect x="16" y="5" width="5" height="5" /><rect x="11" y="11" width="5" height="5" /><rect x="22" y="11" width="5" height="5" /><rect x="5" y="17" width="5" height="5" /><rect x="16" y="17" width="5" height="5" /></g>
              <g fill="var(--aegean-deep)" opacity="0.9"><rect x="11" y="5" width="5" height="5" /><rect x="22" y="5" width="5" height="5" /><rect x="5" y="11" width="5" height="5" /><rect x="16" y="11" width="5" height="5" /><rect x="11" y="17" width="5" height="5" /><rect x="22" y="17" width="5" height="5" /></g>
            </svg>
            <div>
              <div className="ca-display" style={{ fontSize: 20, lineHeight: 1 }}>Andes<span style={{ color: "var(--terracotta-deep)" }}>.</span>IA</div>
              <div className="ca-eyebrow" style={{ fontSize: 8.5, marginTop: 2 }}>THE ATHLETE'S ATHLETE</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="ca-btn ca-btn-terra" onClick={() => setInviteOpen(true)} style={{ fontSize: 12 }}><G.Plus /> Invite athlete</button>
          {totalPending > 0 && <div style={{ fontSize: 12, color: "var(--terracotta-deep)", fontFamily: "var(--mono)" }}>{totalPending} pending</div>}
          <button className="ca-btn ca-btn-ghost" onClick={handleSignOut} style={{ fontSize: 12 }}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 60px 32px" }}>
        <Greeting athleteCount={athletes.length} />

        {/* KPI strip */}
        <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden" }}>
          <KpiTile eyebrow="The stable" value={athletes.length} label="athletes under guidance" glyph={<G.Column />} large />
          <KpiTile eyebrow="Need reply" value={totalPending} label={totalPending === 1 ? "message waiting" : "messages waiting"} glyph={<G.Scroll />} valueColor="var(--terracotta-deep)" />
          <KpiTile eyebrow="Pending replies" value={athletes.filter(a => (a.pending_suggestions ?? 0) > 0).length} label="athletes with messages" glyph={<G.Heart />} valueColor="oklch(0.50 0.09 75)" />
          <KpiTile eyebrow="Check-ins total" value={athletes.reduce((s, a) => s + (a.total_checkins ?? 0), 0)} label="across all athletes" glyph={<G.Mountain />} valueColor="var(--aegean-deep)" />
        </section>

        {/* Daily digest banner */}
        {digestData && !digestDismissed && (
          <div className="ca-panel" style={{ marginTop: 20, padding: "18px 24px", display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "start", borderLeft: "3px solid var(--aegean-deep)" }}>
            <div>
              <div className="ca-eyebrow ca-eyebrow-aegean" style={{ marginBottom: 8 }}>Today's digest · {new Date(digestData.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
              <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-soft)", margin: 0 }}>{digestData.summary}</p>
              {(digestData.athlete_flags ?? []).length > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(digestData.athlete_flags ?? []).map(f => (
                    <span key={f.athlete_id} className="ca-chip ca-chip-terra" style={{ fontSize: 10 }} title={f.reason}>{f.name}</span>
                  ))}
                </div>
              )}
            </div>
            <button className="ca-btn ca-btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setDigestDismissed(true)}>Dismiss</button>
          </div>
        )}

        {/* Tabs */}
        <nav style={{ marginTop: 32, borderBottom: "1px solid var(--rule)", display: "flex", gap: 4, alignItems: "center" }}>
          {([
            { id: "roster" as Tab, label: "The stable", badge: athletes.length },
            { id: "queue" as Tab, label: "Replies to approve", badge: totalPending, alert: totalPending > 0 },
            { id: "media" as Tab, label: "Media queue", badge: mediaReviews.length, alert: mediaReviews.length > 0 },
            { id: "officehours" as Tab, label: "Office hours", badge: null },
          ]).map(t => (
            <button key={t.id} className={`ca-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.badge !== null && t.badge > 0 && (
                <span style={{ marginLeft: 8, background: t.alert ? "var(--terracotta)" : "transparent", color: t.alert ? "oklch(0.98 0.01 50)" : "var(--ink-mute)", fontSize: t.alert ? 10 : undefined, padding: t.alert ? "2px 7px" : undefined, borderRadius: t.alert ? 10 : undefined, fontFamily: t.alert ? "var(--serif)" : undefined, letterSpacing: 0 }}>{t.badge}</span>
              )}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {tab === "roster" && (
            <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
              {(["all", "pending"] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 12px", border: `1px solid ${filter === f ? "var(--ink)" : "var(--rule)"}`, background: filter === f ? "var(--ink)" : "transparent", color: filter === f ? "var(--parchment)" : "var(--ink-soft)", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", borderRadius: 2, cursor: "pointer", transition: "all 160ms ease" }}>{f === "all" ? "All" : "Pending"}</button>
              ))}
            </div>
          )}
        </nav>

        <div style={{ marginTop: 24 }}>
          {tab === "roster" && (
            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {filteredAthletes.map(a => <AthleteCard key={a.id} athlete={a} href={`/dashboard/athletes/${a.id}`} />)}
              {filteredAthletes.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: 60, textAlign: "center" }}>
                  <div className="ca-ornament">◆ ◆ ◆</div>
                  <p className="ca-display-italic" style={{ fontSize: 20, marginTop: 16, color: "var(--ink-soft)" }}>No athletes match this filter.</p>
                </div>
              )}
            </section>
          )}

          {tab === "queue" && <QueueView suggestions={suggestions} athletes={athletes} onApprove={handleApprove} onIgnore={handleIgnore} onRefine={s => setRefineTarget(s)} actionLoading={actionLoading} />}

          {tab === "media" && (
            <div>
              {mediaLoading ? <p className="ca-eyebrow" style={{ textAlign: "center", padding: 40 }}>Loading media queue…</p> : mediaReviews.length === 0 ? (
                <div style={{ padding: "60px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                  <p className="ca-eyebrow" style={{ fontSize: 11 }}>No media to review</p>
                  <p style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>Athletes' photos/videos from WhatsApp appear here.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {mediaReviews.map(r => {
                    const busy = mediaActionLoading === r.id;
                    const comment = mediaComment[r.id] ?? "";
                    return (
                      <article key={r.id} className="ca-panel" style={{ padding: 24 }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                          {r.signed_url && (
                            <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: 2, overflow: "hidden", border: "1px solid var(--rule)", background: "var(--linen-deep)" }}>
                              {r.media_type === "image"
                                ? <img src={r.signed_url} alt="athlete media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <video src={r.signed_url} style={{ width: "100%", height: "100%" }} controls />}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                              <div>
                                <span className="ca-display" style={{ fontSize: 16 }}>{r.athletes?.full_name ?? "Athlete"}</span>
                                <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 10 }}>{r.media_type} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              </div>
                              <span className={`ca-chip ${r.status === "pending" ? "ca-chip-ochre" : r.status === "approved" ? "ca-chip-aegean" : "ca-chip-terra"}`} style={{ fontSize: 9 }}>{r.status}</span>
                            </div>
                            {(r.ai_analysis || r.coach_edited_analysis) && (
                              <div style={{ padding: "10px 14px", background: "var(--parchment-2)", borderLeft: "2px solid var(--aegean-soft)", fontSize: 13, fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 12 }}>
                                {r.coach_edited_analysis ?? r.ai_analysis}
                              </div>
                            )}
                            {r.status === "pending" && (
                              <>
                                <textarea
                                  value={comment}
                                  onChange={e => setMediaComment(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  placeholder="Add a note for the athlete (optional)…"
                                  rows={2}
                                  style={{ width: "100%", padding: "8px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)", outline: "none", resize: "none", lineHeight: 1.5, boxSizing: "border-box", marginBottom: 10 }}
                                />
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="ca-btn ca-btn-primary" style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => handleMediaAction(r.id, "approved", comment || undefined)}>
                                    <G.Check /> {busy ? "Sending…" : "Approve"}
                                  </button>
                                  <button className="ca-btn ca-btn-ghost" style={{ fontSize: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => handleMediaAction(r.id, "rejected", comment || undefined)}>
                                    <G.X /> Reject
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "officehours" && !ohData && (
            <div style={{ padding: "60px 0", textAlign: "center" }}>
              <p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading office hours…</p>
            </div>
          )}

          {tab === "officehours" && ohData && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div className="ca-panel" style={{ padding: 28 }}>
                <div className="ca-eyebrow ca-eyebrow-terra">When the door is open</div>
                <h2 className="ca-display" style={{ margin: "8px 0 4px 0", fontSize: 28 }}>Office hours</h2>
                <div style={{ marginTop: 20, display: "flex", flexDirection: "column" }}>
                  {DAY_KEYS_OH.map((k, i) => {
                    const oh = ohData.office_hours as Record<string, unknown> | null;
                    const h = oh?.[k];
                    const hours = Array.isArray(h) && h.length >= 2 ? `${h[0]} – ${h[1]}` : "Closed";
                    return (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 0", borderBottom: i < 6 ? "1px dashed var(--rule)" : "none" }}>
                        <span className="ca-display" style={{ fontSize: 18, color: hours === "Closed" ? "var(--ink-mute)" : "var(--ink)" }}>{DAY_NAMES_OH[i]}</span>
                        <span className="ca-mono" style={{ fontSize: 14, color: hours === "Closed" ? "var(--ink-mute)" : "var(--aegean-deep)" }}>{hours}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="ca-panel" style={{ padding: 28, background: "linear-gradient(155deg, oklch(0.68 0.135 42) 0%, oklch(0.56 0.130 38) 100%)", color: "oklch(0.98 0.02 50)" }}>
                <div className="ca-eyebrow" style={{ color: "oklch(0.88 0.05 45)" }}>The understudy's voice</div>
                <h2 className="ca-display" style={{ margin: "8px 0 4px 0", fontSize: 28, color: "oklch(0.98 0.02 50)" }}>After-hours reply</h2>
                <div style={{ marginTop: 20, padding: "18px 22px", background: "oklch(1 0 0 / 0.1)", border: "1px solid oklch(1 0 0 / 0.2)", borderRadius: 2, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 17, lineHeight: 1.55, color: "oklch(0.98 0.02 50)" }}>
                  &ldquo;Your coach is off the pitch until morning. I've taken your note and they'll see it first thing.&rdquo;
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 48, textAlign: "center" }}>
          <div className="ca-ornament">COACH · ATHLETE · PURPOSE</div>
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
      {refineTarget && <RefineModal suggestion={refineTarget} onClose={() => setRefineTarget(null)} onSend={handleModified} />}
    </div>
  );
}
