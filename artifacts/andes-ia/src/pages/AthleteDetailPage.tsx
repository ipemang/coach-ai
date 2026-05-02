import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { BACKEND, getAuthToken } from "../lib/api";
import type { Athlete, Suggestion, Workout, CheckIn, StableProfile, CurrentState } from "../lib/types";

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

const SESSION_COLORS: Record<string, string> = {
  swim: "var(--aegean-deep)", bike: "var(--terracotta)", run: "var(--ochre)",
  strength: "var(--olive)", rest: "var(--ink-mute)", brick: "var(--terracotta-deep)",
};

function sessionColor(type: string): string {
  const t = type?.toLowerCase() ?? "";
  return SESSION_COLORS[t] ?? "var(--ink-mute)";
}

type AthleteDetailData = {
  athlete: Athlete & { email?: string; ai_profile_summary?: string; primary_sport?: string; target_event_name?: string; target_event_date?: string };
  suggestions: Suggestion[];
  workouts: Workout[];
  checkins: CheckIn[];
};

export default function AthleteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [data, setData] = useState<AthleteDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "suggestions" | "plan" | "history">("overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refineId, setRefineId] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const [sendMsg, setSendMsg] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = await getAuthToken();
      if (!token) { navigate("/login"); return; }
      try {
        const res = await fetch(`${BACKEND}/api/v1/athletes/${id}?include_suggestions=true&include_workouts=true&include_checkins=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) { navigate("/login"); return; }
        if (res.status === 404) { navigate("/dashboard"); return; }
        if (res.ok) { setData(await res.json()); }
        else { setError("Could not load athlete data."); }
      } catch { setError("Network error."); }
      setLoading(false);
    }
    load();
  }, [id, navigate]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function handleApprove(suggestionId: string) {
    setActionLoading(suggestionId);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/suggestions/${suggestionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "approved" }),
      });
      if (res.ok) {
        setData(prev => prev ? { ...prev, suggestions: prev.suggestions.map(s => s.id === suggestionId ? { ...s, status: "sent" as const } : s) } : prev);
        showToast("Reply approved & sent");
      }
    } finally { setActionLoading(null); }
  }

  async function handleIgnore(suggestionId: string) {
    setActionLoading(suggestionId);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/suggestions/${suggestionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "ignored" }),
      });
      if (res.ok) {
        setData(prev => prev ? { ...prev, suggestions: prev.suggestions.map(s => s.id === suggestionId ? { ...s, status: "ignored" as const } : s) } : prev);
      }
    } finally { setActionLoading(null); }
  }

  async function handleModified(suggestionId: string, text: string) {
    setActionLoading(suggestionId);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/suggestions/${suggestionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "modified", coach_reply: text }),
      });
      if (res.ok) {
        setData(prev => prev ? { ...prev, suggestions: prev.suggestions.map(s => s.id === suggestionId ? { ...s, status: "sent" as const } : s) } : prev);
        setRefineId(null); showToast("Modified reply sent");
      }
    } finally { setActionLoading(null); }
  }

  async function handleSendMessage() {
    if (!msgText.trim()) return;
    setMsgSending(true);
    const token = await getAuthToken();
    try {
      const res = await fetch(`${BACKEND}/api/v1/athletes/${id}/message`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: msgText }),
      });
      if (res.ok) { setSendMsg(false); setMsgText(""); showToast("Message sent"); }
      else { showToast("Failed to send message"); }
    } catch { showToast("Network error"); }
    setMsgSending(false);
  }

  if (loading) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}><div className="ca-avatar" style={{ width: 52, height: 52, margin: "0 auto 20px", fontSize: 22 }}><span>A</span></div><p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading athlete…</p></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="ca-panel" style={{ padding: 40, textAlign: "center", maxWidth: 400 }}>
          <p style={{ color: "var(--terracotta-deep)", marginBottom: 16 }}>{error ?? "Athlete not found."}</p>
          <Link href="/dashboard" className="ca-btn ca-btn-primary" style={{ textDecoration: "none" }}>← Dashboard</Link>
        </div>
      </div>
    );
  }

  const { athlete, suggestions, workouts, checkins } = data;
  const sp = athlete.stable_profile as StableProfile | null | undefined;
  const cs = athlete.current_state as CurrentState | null | undefined;
  const pendingSuggestions = suggestions.filter(s => s.status === "pending");

  const readiness = cs?.oura_readiness_score ?? null;
  const readinessColor = readiness === null ? "var(--ink-soft)" : readiness >= 80 ? "var(--aegean-deep)" : readiness >= 60 ? "var(--ochre)" : "var(--terracotta-deep)";

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "var(--aegean-deep)", color: "oklch(0.97 0.02 210)", padding: "8px 16px", borderRadius: 4, fontSize: 12, zIndex: 100, fontFamily: "var(--mono)" }}>{toast}</div>
      )}

      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--rule)", background: "var(--linen)", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 32px", display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="22" height="22" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" fill="none" stroke="var(--ink)" strokeWidth="1" /><g fill="var(--terracotta)" opacity="0.85"><rect x="5" y="5" width="5" height="5" /><rect x="16" y="5" width="5" height="5" /></g><g fill="var(--aegean-deep)" opacity="0.9"><rect x="11" y="5" width="5" height="5" /><rect x="22" y="5" width="5" height="5" /></g></svg>
              <span className="ca-eyebrow" style={{ fontSize: 10 }}>← Dashboard</span>
            </div>
          </Link>
          <span style={{ color: "var(--rule)" }}>·</span>
          <div className="ca-display" style={{ fontSize: 18 }}>{athlete.full_name}</div>
          <div style={{ flex: 1 }} />
          <button className="ca-btn" onClick={() => setSendMsg(true)} style={{ fontSize: 12 }}>Send message</button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px 60px 32px" }}>
        {/* Athlete hero */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "start", marginBottom: 28 }}>
          <div className="ca-avatar" style={{ width: 72, height: 72, fontSize: 28 }}><span>{getInitials(athlete.full_name)}</span></div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h1 className="ca-display" style={{ fontSize: 36, margin: 0 }}>{athlete.full_name}</h1>
              {pendingSuggestions.length > 0 && <span className="ca-chip ca-chip-terra">{pendingSuggestions.length} pending</span>}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              {cs?.training_phase && <span className="ca-chip ca-chip-aegean">{cs.training_phase}{cs.training_week ? ` · Wk ${cs.training_week}` : ""}</span>}
              {sp?.target_race && <span className="ca-chip">{sp.target_race}</span>}
              {athlete.primary_sport && <span className="ca-chip">{athlete.primary_sport}</span>}
              {athlete.phone_number && <span className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)", alignSelf: "center" }}>{athlete.phone_number}</span>}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 4, overflow: "hidden", marginBottom: 28 }}>
          {[
            { label: "Readiness", value: readiness !== null ? <><span style={{ fontSize: 36, fontFamily: "var(--serif)", color: readinessColor }}>{readiness}</span><span style={{ fontSize: 12, color: "var(--ink-mute)" }}>/100</span></> : <span style={{ fontSize: 24, fontFamily: "var(--serif)", color: "var(--ink-mute)" }}>—</span> },
            { label: "HRV", value: <span style={{ fontSize: 36, fontFamily: "var(--serif)" }}>{cs?.oura_avg_hrv != null ? Math.round(cs.oura_avg_hrv) : "—"}</span> },
            { label: "Sleep score", value: <span style={{ fontSize: 36, fontFamily: "var(--serif)" }}>{cs?.oura_sleep_score ?? "—"}</span> },
            { label: "Check-ins", value: <span style={{ fontSize: 36, fontFamily: "var(--serif)" }}>{checkins.length}</span> },
          ].map((k, i) => (
            <div key={i} style={{ padding: "18px 20px", background: "var(--linen)" }}>
              <div className="ca-eyebrow" style={{ marginBottom: 10 }}>{k.label}</div>
              {k.value}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <nav style={{ borderBottom: "1px solid var(--rule)", display: "flex", gap: 4, marginBottom: 24 }}>
          {([
            { id: "overview", label: "Overview" },
            { id: "suggestions", label: `Replies (${pendingSuggestions.length})`, alert: pendingSuggestions.length > 0 },
            { id: "plan", label: "Training plan" },
            { id: "history", label: "Check-in history" },
          ] as { id: typeof activeTab; label: string; alert?: boolean }[]).map(t => (
            <button key={t.id} className={`ca-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* AI profile summary */}
              {athlete.ai_profile_summary && (
                <div className="ca-panel" style={{ padding: 24 }}>
                  <div className="ca-eyebrow ca-eyebrow-aegean" style={{ marginBottom: 10 }}>AI athlete profile</div>
                  <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.65, color: "var(--ink-soft)", margin: 0 }}>{athlete.ai_profile_summary}</p>
                </div>
              )}

              {/* Coach notes */}
              {cs?.coach_notes && (
                <div className="ca-panel" style={{ padding: 24, borderLeft: "3px solid var(--ochre)" }}>
                  <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>Coach notes</div>
                  <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0 }}>"{cs.coach_notes}"</p>
                </div>
              )}

              {/* Stable profile */}
              <div className="ca-panel" style={{ padding: 24 }}>
                <div className="ca-eyebrow" style={{ marginBottom: 14 }}>Profile</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Target race", value: sp?.target_race ?? "—" },
                    { label: "Race date", value: sp?.race_date ? new Date(sp.race_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
                    { label: "Max weekly hours", value: sp?.max_weekly_hours ? `${sp.max_weekly_hours}h` : "—" },
                    { label: "Swim CSS", value: sp?.swim_css ?? "—" },
                    { label: "Injury history", value: sp?.injury_history ?? "None noted" },
                    { label: "Joined", value: new Date(athlete.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="ca-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{f.label}</div>
                      <div style={{ fontSize: 13, color: "var(--ink)" }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Biometrics */}
              <div className="ca-panel" style={{ padding: 20 }}>
                <div className="ca-eyebrow" style={{ marginBottom: 14 }}>Biometrics today</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Readiness", value: cs?.oura_readiness_score ?? "—" },
                    { label: "HRV", value: cs?.oura_avg_hrv != null ? `${Math.round(cs.oura_avg_hrv)} ms` : "—" },
                    { label: "Sleep", value: cs?.oura_sleep_score ?? "—" },
                    { label: "Strava last", value: cs?.strava_last_activity_type ?? "—" },
                    { label: "Distance", value: cs?.strava_last_distance_km != null ? `${cs.strava_last_distance_km} km` : "—" },
                  ].map(b => (
                    <div key={b.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: "1px dashed var(--rule)" }}>
                      <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{b.label}</span>
                      <span style={{ fontFamily: "var(--serif)", fontSize: 14, color: "var(--ink)" }}>{b.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Predictive flags */}
              {(cs?.predictive_flags?.length ?? 0) > 0 && (
                <div className="ca-panel" style={{ padding: 20 }}>
                  <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 12 }}>AI flags</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {cs?.predictive_flags?.map(f => (
                      <div key={f.code} style={{ padding: "8px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderLeft: `2px solid ${f.priority === "high" ? "var(--terracotta)" : f.priority === "medium" ? "var(--ochre)" : "var(--rule)"}`, borderRadius: 2 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{f.label}</div>
                        {f.reason && <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 3 }}>{f.reason}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggestions tab */}
        {activeTab === "suggestions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {suggestions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="ca-ornament">◆ ◆ ◆</div>
                <p className="ca-display-italic" style={{ fontSize: 18, marginTop: 16, color: "var(--ink-soft)" }}>No suggestions yet for this athlete.</p>
              </div>
            ) : suggestions.map(s => (
              <article key={s.id} className="ca-panel" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div>
                    <span className={`ca-chip ${s.status === "pending" ? "ca-chip-terra" : s.status === "sent" || s.status === "approved" ? "ca-chip-aegean" : ""}`}>{s.status}</span>
                    <span className="ca-mono" style={{ fontSize: 10, color: "var(--ink-mute)", marginLeft: 10 }}>{relativeTime(s.created_at)}</span>
                  </div>
                </div>
                {s.athlete_message && (
                  <div style={{ padding: "10px 14px", background: "var(--parchment-2)", borderLeft: "2px solid var(--ochre)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)", marginBottom: 12 }}>&ldquo;{s.athlete_message}&rdquo;</div>
                )}
                {s.suggestion_text && (
                  <div style={{ padding: "10px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)", marginBottom: 12 }}>
                    {refineId === s.id ? (
                      <>
                        <textarea value={refineText} onChange={e => setRefineText(e.target.value)} rows={5} style={{ width: "100%", fontFamily: "var(--body)", fontSize: 14, color: "var(--ink)", background: "transparent", border: "none", outline: "none", resize: "vertical", lineHeight: 1.55, boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button className="ca-btn ca-btn-primary" style={{ fontSize: 11 }} disabled={actionLoading === s.id} onClick={() => handleModified(s.id, refineText)}>{actionLoading === s.id ? "Sending…" : "Send"}</button>
                          <button className="ca-btn ca-btn-ghost" style={{ fontSize: 11 }} onClick={() => setRefineId(null)}>Cancel</button>
                        </div>
                      </>
                    ) : s.suggestion_text}
                  </div>
                )}
                {s.status === "pending" && refineId !== s.id && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ca-btn ca-btn-primary" style={{ fontSize: 12 }} disabled={!!actionLoading} onClick={() => handleApprove(s.id)}>✓ Approve & send</button>
                    <button className="ca-btn" style={{ fontSize: 12 }} disabled={!!actionLoading} onClick={() => { setRefineId(s.id); setRefineText(s.suggestion_text ?? ""); }}>Refine</button>
                    <button className="ca-btn ca-btn-ghost" style={{ fontSize: 12 }} disabled={!!actionLoading} onClick={() => handleIgnore(s.id)}>Ignore</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Training plan tab */}
        {activeTab === "plan" && (
          <div>
            {workouts.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="ca-ornament">◆ ◆ ◆</div>
                <p className="ca-display-italic" style={{ fontSize: 18, marginTop: 16, color: "var(--ink-soft)" }}>No workouts scheduled this week.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {workouts.map(w => (
                  <div key={w.id} className="ca-panel" style={{ padding: 18, display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <div style={{ flexShrink: 0, textAlign: "center", minWidth: 48 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: sessionColor(w.session_type), margin: "0 auto 6px" }} />
                      <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--ink-mute)" }}>{new Date(w.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 4 }}>
                        <span className="ca-display" style={{ fontSize: 16 }}>{w.title ?? w.session_type}</span>
                        <span className={`ca-chip ${w.status === "completed" ? "ca-chip-aegean" : w.status === "missed" ? "ca-chip-terra" : ""}`} style={{ fontSize: 9 }}>{w.status}</span>
                      </div>
                      <div style={{ display: "flex", gap: 16 }}>
                        {w.duration_min && <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{w.duration_min} min</span>}
                        {w.distance_km && <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{w.distance_km} km</span>}
                        {w.hr_zone && <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>Zone {w.hr_zone}</span>}
                      </div>
                      {w.coaching_notes && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-soft)", fontStyle: "italic", fontFamily: "var(--serif)" }}>{w.coaching_notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checkins.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="ca-ornament">◆ ◆ ◆</div>
                <p className="ca-display-italic" style={{ fontSize: 18, marginTop: 16, color: "var(--ink-soft)" }}>No check-ins yet.</p>
              </div>
            ) : checkins.map(c => (
              <div key={c.id} className="ca-panel" style={{ padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: 18 }}>{c.message_type === "voice" ? "🎙️" : "💬"}</span>
                </div>
                <div style={{ flex: 1 }}>
                  {c.message_text && <p style={{ margin: 0, fontSize: 13.5, fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-soft)", lineHeight: 1.55 }}>&ldquo;{c.message_text}&rdquo;</p>}
                  <div style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-mute)" }}>{relativeTime(c.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send message modal */}
      {sendMsg && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0.28 0.022 55 / 0.4)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setSendMsg(false)}>
          <div className="ca-panel" style={{ width: "100%", maxWidth: 480, padding: 32 }} onClick={e => e.stopPropagation()}>
            <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>Direct message</div>
            <h2 className="ca-display" style={{ fontSize: 22, margin: "0 0 20px" }}>Message {athlete.full_name}</h2>
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} rows={5} placeholder="Type your message…" style={{ width: "100%", padding: "12px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 14, color: "var(--ink)", outline: "none", resize: "vertical", lineHeight: 1.55, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="ca-btn ca-btn-primary" onClick={handleSendMessage} disabled={msgSending || !msgText.trim()} style={{ flex: 1 }}>{msgSending ? "Sending…" : "Send via WhatsApp →"}</button>
              <button className="ca-btn ca-btn-ghost" onClick={() => setSendMsg(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
