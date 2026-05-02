import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { BACKEND, getAuthToken, storeLoginRedirect } from "../lib/api";
import type { Athlete, Suggestion, StableProfile, CurrentState, PredictiveFlag } from "../lib/types";

type WeekWorkout = { scheduled_date: string; status: string; distance_km: number | null };
type BiometricBaseline = { readiness_avg: number | null; hrv_avg: number | null; sleep_avg: number | null };
type EnrichedAthlete = Athlete & { pending_suggestions?: number; total_checkins?: number; last_checkin_at?: string | null; week_workouts?: WeekWorkout[]; biometric_baseline?: BiometricBaseline | null };
type Tab = "roster" | "queue" | "media" | "officehours";
type Filter = "all" | "pending";
interface OfficeHoursData { office_hours: Record<string, unknown> | null; ai_autonomy_override: boolean; is_currently_autonomous: boolean; after_hours_message?: string | null; urgency_keywords?: string[] | null; }
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

function CsvImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<{ name: string; email: string; phone: string }[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(null);

  function parseCSV(text: string): { name: string; email: string; phone: string }[] | string {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const firstLine = normalized.split("\n")[0];
    const delim = firstLine.includes(";") ? ";" : ",";
    const lines: string[][] = [];
    let cur = "", inQ = false;
    let row: string[] = [];
    for (const ch of normalized + "\n") {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { row.push(cur.trim()); cur = ""; }
      else if (ch === "\n" && !inQ) {
        row.push(cur.trim());
        if (row.some(c => c)) lines.push(row);
        row = []; cur = "";
      } else { cur += ch; }
    }
    if (lines.length < 2) return "The file must have a header row and at least one data row.";
    const headers = lines[0].map(h => h.replace(/"/g, "").toLowerCase().replace(/[\s_-]+/g, " ").trim());
    function findCol(candidates: string[]): number {
      for (const c of candidates) { const i = headers.findIndex(h => h === c || h.includes(c)); if (i !== -1) return i; }
      return -1;
    }
    const nameIdx = findCol(["full name", "name", "athlete name", "athlete", "fullname"]);
    const emailIdx = findCol(["email", "email address", "e mail", "e-mail"]);
    const phoneIdx = findCol(["phone", "whatsapp", "mobile", "phone number", "mobile number", "cell"]);
    if (nameIdx === -1) return `No "Name" column found. Detected: ${lines[0].join(", ")}`;
    if (emailIdx === -1) return `No "Email" column found. Detected: ${lines[0].join(", ")}`;
    const parsed: { name: string; email: string; phone: string }[] = [];
    for (const line of lines.slice(1)) {
      const name = line[nameIdx]?.replace(/"/g, "").trim() ?? "";
      const email = line[emailIdx]?.replace(/"/g, "").trim() ?? "";
      const phone = phoneIdx >= 0 ? (line[phoneIdx]?.replace(/"/g, "").trim() ?? "") : "";
      if (name && email && email.includes("@")) parsed.push({ name, email, phone });
    }
    if (!parsed.length) return "No valid rows found. Each row needs a Name and a valid Email.";
    return parsed;
  }

  async function handleFile(file: File) {
    setParseError(null); setRows([]); setResults(null); setFileName(file.name);
    const text = await file.text();
    const out = parseCSV(text);
    if (typeof out === "string") setParseError(out);
    else setRows(out);
  }

  async function handleImport() {
    setImporting(true); setProgress({ done: 0, total: rows.length });
    const token = await getAuthToken();
    const res: { name: string; ok: boolean; error?: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const resp = await fetch(`${BACKEND}/api/v1/athletes/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ full_name: r.name, email: r.email, phone_number: r.phone || undefined }),
        });
        const body = await resp.json().catch(() => ({}));
        res.push({ name: r.name, ok: resp.ok, error: resp.ok ? undefined : ((body?.detail as string) ?? "Failed") });
      } catch { res.push({ name: r.name, ok: false, error: "Network error" }); }
      setProgress({ done: i + 1, total: rows.length });
    }
    setResults(res); setImporting(false);
    if (res.some(r => r.ok)) onImported();
  }

  function downloadTemplate() {
    const csv = "Full Name,Email,WhatsApp\nAlex Thompson,alex@example.com,+1 555 000 1234\nJordan Rivera,jordan@example.com,";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "andes-ia-roster-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const succeeded = results?.filter(r => r.ok).length ?? 0;
  const failed = results?.filter(r => !r.ok).length ?? 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 560, padding: 32, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div className="ca-eyebrow ca-eyebrow-aegean" style={{ marginBottom: 8 }}>Bulk import</div>
        <h2 className="ca-display" style={{ fontSize: 26, margin: "0 0 4px" }}>Import athlete roster</h2>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, color: "var(--ink-soft)", margin: "0 0 24px", lineHeight: 1.55 }}>
          Works with exports from TrainingPeaks, TrainHeroic, Google Sheets, or any CSV. Needs at minimum a Name and Email column.
        </p>

        {!results ? (
          <>
            <label style={{ display: "block", border: `2px dashed ${fileName && !parseError ? "var(--aegean-soft)" : parseError ? "oklch(0.80 0.08 45)" : "var(--rule)"}`, borderRadius: 4, padding: "28px 24px", textAlign: "center", cursor: "pointer", background: fileName && !parseError ? "var(--aegean-wash)" : parseError ? "var(--terracotta-soft)" : "var(--parchment)", transition: "all 200ms ease", marginBottom: 16 }}>
              <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
              {fileName ? (
                <>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: parseError ? "var(--terracotta-deep)" : "var(--aegean-deep)", marginBottom: 4 }}>{fileName}</div>
                  {rows.length > 0 && <div style={{ fontSize: 13, color: "var(--aegean-deep)", fontFamily: "var(--serif)", fontStyle: "italic" }}>{rows.length} athlete{rows.length !== 1 ? "s" : ""} ready to import</div>}
                </>
              ) : (
                <>
                  <div style={{ fontFamily: "var(--body)", fontSize: 14, color: "var(--ink)", marginBottom: 4 }}>Click to choose a CSV file</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)" }}>Columns needed: Name, Email — WhatsApp optional</div>
                </>
              )}
            </label>

            {parseError && (
              <div style={{ padding: "12px 16px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                <strong>Could not parse file:</strong> {parseError}
              </div>
            )}

            {rows.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="ca-eyebrow" style={{ marginBottom: 10 }}>Preview — first {Math.min(5, rows.length)} of {rows.length}</div>
                <div style={{ border: "1px solid var(--rule)", borderRadius: 2, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--linen-deep)" }}>
                        {["Name", "Email", "WhatsApp"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-mute)", borderBottom: "1px solid var(--rule)", fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "var(--parchment)" : "var(--linen)" }}>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--serif)", fontSize: 13 }}>{r.name}</td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)" }}>{r.email}</td>
                          <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 11, color: r.phone ? "var(--ink-soft)" : "var(--ink-faint)" }}>{r.phone || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 5 && (
                    <div style={{ padding: "8px 12px", background: "var(--linen)", borderTop: "1px solid var(--rule)", fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-mute)", textAlign: "center" }}>
                      + {rows.length - 5} more athlete{rows.length - 5 !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            )}

            {importing && progress && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)" }}>Importing athletes…</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)" }}>{progress.done} / {progress.total}</span>
                </div>
                <div className="ca-bar-track"><div className="ca-bar-fill" style={{ width: `${(progress.done / progress.total) * 100}%`, transition: "width 200ms ease" }} /></div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="ca-btn ca-btn-primary" disabled={rows.length === 0 || importing} onClick={handleImport} style={{ opacity: rows.length === 0 || importing ? 0.45 : 1, cursor: rows.length === 0 || importing ? "not-allowed" : "pointer" }}>
                {importing ? `Importing ${progress?.done ?? 0} of ${rows.length}…` : `Import ${rows.length > 0 ? `${rows.length} athlete${rows.length !== 1 ? "s" : ""}` : "athletes"} →`}
              </button>
              <button className="ca-btn ca-btn-ghost" onClick={onClose} disabled={importing}>Cancel</button>
              <div style={{ flex: 1 }} />
              <button className="ca-btn ca-btn-ghost" style={{ fontSize: 11 }} onClick={downloadTemplate}>↓ Template CSV</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
              <div className="ca-panel" style={{ flex: 1, padding: "20px", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 44, color: "var(--aegean-deep)", lineHeight: 1 }}>{succeeded}</div>
                <div className="ca-eyebrow ca-eyebrow-aegean" style={{ marginTop: 8, fontSize: 9.5 }}>Imported</div>
              </div>
              {failed > 0 && (
                <div className="ca-panel" style={{ flex: 1, padding: "20px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 44, color: "var(--terracotta-deep)", lineHeight: 1 }}>{failed}</div>
                  <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginTop: 8, fontSize: 9.5 }}>Failed</div>
                </div>
              )}
            </div>

            {failed > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="ca-eyebrow" style={{ marginBottom: 8 }}>Could not import</div>
                <div style={{ border: "1px solid var(--rule)", borderRadius: 2, overflow: "hidden" }}>
                  {results.filter(r => !r.ok).map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: i % 2 === 0 ? "var(--terracotta-soft)" : "var(--parchment)", borderBottom: "1px solid oklch(0.86 0.04 45)" }}>
                      <span style={{ fontFamily: "var(--serif)", fontSize: 13 }}>{r.name}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--terracotta-deep)" }}>{r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 20px" }}>
              {succeeded > 0 ? `${succeeded} invitation${succeeded !== 1 ? "s" : ""} sent. Athletes will receive an onboarding link to set up their profile.` : "No athletes were imported successfully."}
            </p>

            <button className="ca-btn ca-btn-primary" onClick={onClose} style={{ width: "100%", justifyContent: "center" }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

const DEFAULT_URGENCY_KEYWORDS = ["injury", "illness", "URGENT", "pain", "emergency", "racing today", "sick"];

function EditVoiceModal({ current, onClose, onSaved }: { current: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [message, setMessage] = useState(current);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true); setError(null);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/office-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ after_hours_message: message.trim() }),
      });
      if (res.ok) { onSaved(message.trim()); onClose(); }
      else { const b = await res.json().catch(() => ({})); setError((b?.detail as string) ?? "Failed to save."); }
    } catch { setError("Network error."); }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 520, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>The understudy's voice</div>
        <h2 className="ca-display" style={{ fontSize: 24, margin: "0 0 6px" }}>Edit after-hours message</h2>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, margin: "0 0 20px" }}>
          This is the opening message athletes receive when they reach out outside your office hours. Write in your own voice — the AI will adapt from here.
        </p>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          style={{ width: "100%", padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.65, color: "var(--ink)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          placeholder="Your coach is off the pitch until morning…"
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, marginBottom: 14 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-faint)" }}>{message.length} chars</span>
        </div>
        {error && <div style={{ padding: "10px 14px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ca-btn ca-btn-terra" style={{ flex: 1 }} disabled={loading || !message.trim()} onClick={handleSave}>{loading ? "Saving…" : "Save voice →"}</button>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function UrgencyRulesModal({ current, onClose, onSaved }: { current: string[]; onClose: () => void; onSaved: (keywords: string[]) => void }) {
  const [keywords, setKeywords] = useState<string[]>(current.length ? current : DEFAULT_URGENCY_KEYWORDS);
  const [newKw, setNewKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addKeyword() {
    const kw = newKw.trim();
    if (kw && !keywords.includes(kw)) { setKeywords(k => [...k, kw]); setNewKw(""); }
  }

  async function handleSave() {
    setLoading(true); setError(null);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/office-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ urgency_keywords: keywords }),
      });
      if (res.ok) { onSaved(keywords); onClose(); }
      else { const b = await res.json().catch(() => ({})); setError((b?.detail as string) ?? "Failed to save."); }
    } catch { setError("Network error."); }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 480, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div className="ca-eyebrow ca-eyebrow-ochre" style={{ marginBottom: 8 }}>Emergency response</div>
        <h2 className="ca-display" style={{ fontSize: 24, margin: "0 0 6px" }}>Urgency rules</h2>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55, margin: "0 0 20px" }}>
          When an athlete's message contains any of these words or phrases, the AI flags it as urgent and notifies you immediately — regardless of office hours.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, minHeight: 36 }}>
          {keywords.map((kw, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "var(--ochre-soft)", border: "1px solid var(--ochre)", borderRadius: 2 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" }}>{kw}</span>
              <button onClick={() => setKeywords(k => k.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-mute)", fontSize: 16, lineHeight: 1, padding: "0 0 1px 2px" }}>×</button>
            </div>
          ))}
          {keywords.length === 0 && <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-faint)" }}>No rules yet — add one below.</span>}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            type="text" value={newKw} onChange={e => setNewKw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKeyword())}
            placeholder="Add a word or phrase…"
            style={{ flex: 1, padding: "8px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)", outline: "none" }}
          />
          <button className="ca-btn ca-btn-ghost" onClick={addKeyword} disabled={!newKw.trim()}>Add</button>
        </div>
        {error && <div style={{ padding: "10px 14px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ca-btn ca-btn-primary" style={{ flex: 1 }} disabled={loading} onClick={handleSave}>{loading ? "Saving…" : "Save rules →"}</button>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
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
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refineTarget, setRefineTarget] = useState<Suggestion | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [ohData, setOhData] = useState<OfficeHoursData | null>(null);
  const [digestData, setDigestData] = useState<DigestData | null>(null);
  const [mediaReviews, setMediaReviews] = useState<MediaReview[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaActionLoading, setMediaActionLoading] = useState<string | null>(null);
  const [mediaComment, setMediaComment] = useState<Record<string, string>>({});
  const [digestDismissed, setDigestDismissed] = useState(false);
  const [voiceEditOpen, setVoiceEditOpen] = useState(false);
  const [urgencyRulesOpen, setUrgencyRulesOpen] = useState(false);
  const [ohSaving, setOhSaving] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [dayDraft, setDayDraft] = useState<{ open: string; close: string; enabled: boolean }>({ open: "09:00", close: "17:00", enabled: true });
  const [ohHoursSaving, setOhHoursSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getAuthToken();
      if (!token) { storeLoginRedirect(); navigate("/login?expired=1"); return; }
      try {
        const [athletesRes, suggestionsRes] = await Promise.all([
          fetch(`${BACKEND}/api/v1/athletes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND}/api/v1/suggestions/pending`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (athletesRes.status === 401) { storeLoginRedirect(); navigate("/login?expired=1"); return; }
        if (athletesRes.ok) setAthletes(await athletesRes.json());
        if (suggestionsRes.ok) setSuggestions(await suggestionsRes.json());
      } catch { setError("Could not load dashboard. Please check your connection."); }
      setLoading(false);
    }
    load();
  }, [navigate, refreshKey]);

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

  function startEditDay(key: string) {
    const oh = ohData?.office_hours as Record<string, unknown> | null;
    const h = oh?.[key];
    const arr = Array.isArray(h) && h.length >= 2 ? h as string[] : null;
    setDayDraft({ open: arr?.[0] ?? "09:00", close: arr?.[1] ?? "17:00", enabled: arr !== null });
    setEditingDay(key);
  }

  async function handleSaveDay(key: string) {
    if (!ohData || ohHoursSaving) return;
    const updatedOh = { ...(ohData.office_hours as Record<string, unknown> ?? {}), [key]: dayDraft.enabled ? [dayDraft.open, dayDraft.close] : null };
    const prevOh = ohData.office_hours;
    setOhData(d => d ? { ...d, office_hours: updatedOh } : d);
    setEditingDay(null);
    setOhHoursSaving(true);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/office-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ office_hours: updatedOh }),
      });
      if (!res.ok) setOhData(d => d ? { ...d, office_hours: prevOh } : d);
    } catch { setOhData(d => d ? { ...d, office_hours: prevOh } : d); }
    setOhHoursSaving(false);
  }

  async function handleToggleAutonomy() {
    if (!ohData || ohSaving) return;
    const newVal = !ohData.ai_autonomy_override;
    setOhData(d => d ? { ...d, ai_autonomy_override: newVal } : d);
    setOhSaving(true);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/office-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ai_autonomy_override: newVal }),
      });
      if (!res.ok) setOhData(d => d ? { ...d, ai_autonomy_override: !newVal } : d);
    } catch { setOhData(d => d ? { ...d, ai_autonomy_override: !newVal } : d); }
    setOhSaving(false);
  }

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
          <button className="ca-btn ca-btn-ghost" onClick={() => setCsvImportOpen(true)} style={{ fontSize: 12 }}>↑ Import CSV</button>
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

              {/* Left: schedule + autonomy toggle */}
              <div className="ca-panel" style={{ padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div className="ca-eyebrow ca-eyebrow-terra">When the door is open</div>
                  <div style={{ padding: "3px 10px", background: ohData.is_currently_autonomous ? "var(--olive)" : "var(--aegean-deep)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.96 0.02 80)" }}>
                    {ohData.is_currently_autonomous ? "Coach online" : "After hours"}
                  </div>
                </div>
                <h2 className="ca-display" style={{ margin: "4px 0 2px", fontSize: 28 }}>Office hours</h2>
                <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-soft)", margin: "0 0 20px", lineHeight: 1.5 }}>Outside these windows, athletes hear from the understudy.</p>

                {/* AI autonomy toggle */}
                <div style={{ marginBottom: 20, padding: "14px 16px", background: "var(--linen)", border: "1px solid var(--rule)", borderRadius: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: "var(--body)", fontWeight: 600, fontSize: 13.5, color: "var(--ink)", marginBottom: 2 }}>AI fully autonomous</div>
                    <div style={{ fontFamily: "var(--body)", fontSize: 12, color: "var(--ink-soft)" }}>Override office hours — AI responds to everything</div>
                  </div>
                  <button
                    onClick={handleToggleAutonomy}
                    disabled={ohSaving}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: "none", cursor: ohSaving ? "not-allowed" : "pointer",
                      background: ohData.ai_autonomy_override ? "var(--aegean-deep)" : "var(--rule)",
                      position: "relative", flexShrink: 0, transition: "background 200ms ease", opacity: ohSaving ? 0.6 : 1,
                    }}
                    aria-label={ohData.ai_autonomy_override ? "Disable AI autonomy" : "Enable AI autonomy"}
                  >
                    <span style={{
                      position: "absolute", top: 3, left: ohData.ai_autonomy_override ? 23 : 3, width: 18, height: 18,
                      background: "white", borderRadius: "50%", transition: "left 200ms ease",
                      boxShadow: "0 1px 3px oklch(0.3 0.02 60 / 0.3)",
                    }} />
                  </button>
                </div>

                {/* Day grid */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {DAY_KEYS_OH.map((k, i) => {
                    const oh = ohData.office_hours as Record<string, unknown> | null;
                    const h = oh?.[k];
                    const hours = Array.isArray(h) && h.length >= 2 ? `${h[0]} – ${h[1]}` : "Closed";
                    const isEditing = editingDay === k;
                    return (
                      <div key={k} style={{ borderBottom: i < 6 ? "1px dashed var(--rule)" : "none" }}>
                        {/* Collapsed row — click to edit */}
                        {!isEditing && (
                          <div
                            onClick={() => startEditDay(k)}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 0", cursor: "pointer" }}
                            title="Click to edit"
                          >
                            <span className="ca-display" style={{ fontSize: 17, color: hours === "Closed" ? "var(--ink-mute)" : "var(--ink)" }}>{DAY_NAMES_OH[i]}</span>
                            <span className="ca-mono" style={{ fontSize: 13, color: hours === "Closed" ? "var(--ink-mute)" : "var(--aegean-deep)" }}>{hours}</span>
                          </div>
                        )}
                        {/* Expanded editor */}
                        {isEditing && (
                          <div style={{ padding: "12px 0 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <span className="ca-display" style={{ fontSize: 17, color: "var(--ink)" }}>{DAY_NAMES_OH[i]}</span>
                              {/* Open / Closed toggle */}
                              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: dayDraft.enabled ? "var(--aegean-deep)" : "var(--ink-mute)" }}>
                                <button
                                  onClick={() => setDayDraft(d => ({ ...d, enabled: !d.enabled }))}
                                  style={{
                                    width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                                    background: dayDraft.enabled ? "var(--aegean-deep)" : "var(--rule)",
                                    position: "relative", flexShrink: 0, transition: "background 180ms ease",
                                  }}
                                >
                                  <span style={{
                                    position: "absolute", top: 2, left: dayDraft.enabled ? 18 : 2, width: 16, height: 16,
                                    background: "white", borderRadius: "50%", transition: "left 180ms ease",
                                    boxShadow: "0 1px 2px oklch(0.3 0.02 60 / 0.25)",
                                  }} />
                                </button>
                                {dayDraft.enabled ? "Open" : "Closed"}
                              </label>
                            </div>
                            {/* Time inputs */}
                            {dayDraft.enabled && (
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                                <input
                                  type="time" value={dayDraft.open}
                                  onChange={e => setDayDraft(d => ({ ...d, open: e.target.value }))}
                                  style={{ flex: 1, padding: "6px 10px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink)", outline: "none" }}
                                />
                                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-mute)" }}>to</span>
                                <input
                                  type="time" value={dayDraft.close}
                                  onChange={e => setDayDraft(d => ({ ...d, close: e.target.value }))}
                                  style={{ flex: 1, padding: "6px 10px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink)", outline: "none" }}
                                />
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => handleSaveDay(k)}
                                disabled={ohHoursSaving}
                                className="ca-btn ca-btn-primary"
                                style={{ fontSize: 11, padding: "5px 14px" }}
                              >
                                {ohHoursSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingDay(null)}
                                className="ca-btn ca-btn-ghost"
                                style={{ fontSize: 11, padding: "5px 12px" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: after-hours voice + buttons */}
              <div className="ca-panel" style={{ padding: 28, background: "linear-gradient(155deg, oklch(0.68 0.135 42) 0%, oklch(0.56 0.130 38) 100%)", color: "oklch(0.98 0.02 50)", display: "flex", flexDirection: "column" }}>
                <div className="ca-eyebrow" style={{ color: "oklch(0.88 0.05 45)", marginBottom: 4 }}>The understudy's voice</div>
                <h2 className="ca-display" style={{ margin: "0 0 20px", fontSize: 28, color: "oklch(0.98 0.02 50)" }}>After-hours reply</h2>

                <div style={{ flex: 1, padding: "18px 22px", background: "oklch(1 0 0 / 0.10)", border: "1px solid oklch(1 0 0 / 0.20)", borderRadius: 2, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16.5, lineHeight: 1.6, color: "oklch(0.98 0.02 50)", marginBottom: 20 }}>
                  &ldquo;{ohData.after_hours_message ?? "Your coach is off the pitch until morning. I've taken your note and they'll see it first thing. If this is urgent — pain, illness, racing today — reply URGENT."}&rdquo;
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="ca-btn"
                    onClick={() => setVoiceEditOpen(true)}
                    style={{ background: "oklch(1 0 0 / 0.14)", border: "1px solid oklch(1 0 0 / 0.28)", color: "oklch(0.98 0.02 50)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 16px", cursor: "pointer", borderRadius: 2 }}
                  >
                    Edit voice
                  </button>
                  <button
                    className="ca-btn"
                    onClick={() => setUrgencyRulesOpen(true)}
                    style={{ background: "oklch(1 0 0 / 0.14)", border: "1px solid oklch(1 0 0 / 0.28)", color: "oklch(0.98 0.02 50)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 16px", cursor: "pointer", borderRadius: 2 }}
                  >
                    Urgency rules
                  </button>
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
      {csvImportOpen && <CsvImportModal onClose={() => setCsvImportOpen(false)} onImported={() => { setCsvImportOpen(false); setRefreshKey(k => k + 1); }} />}
      {refineTarget && <RefineModal suggestion={refineTarget} onClose={() => setRefineTarget(null)} onSend={handleModified} />}
      {voiceEditOpen && ohData && (
        <EditVoiceModal
          current={ohData.after_hours_message ?? "Your coach is off the pitch until morning. I've taken your note and they'll see it first thing. If this is urgent — pain, illness, racing today — reply URGENT."}
          onClose={() => setVoiceEditOpen(false)}
          onSaved={(msg) => setOhData(d => d ? { ...d, after_hours_message: msg } : d)}
        />
      )}
      {urgencyRulesOpen && ohData && (
        <UrgencyRulesModal
          current={ohData.urgency_keywords ?? []}
          onClose={() => setUrgencyRulesOpen(false)}
          onSaved={(kws) => setOhData(d => d ? { ...d, urgency_keywords: kws } : d)}
        />
      )}
    </div>
  );
}
