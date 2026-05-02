import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { BACKEND, getAuthToken } from "../lib/api";

const SPORTS = ["Triathlon", "Running", "Cycling", "Swimming", "Duathlon", "Mountain Biking", "Road Cycling", "Trail Running", "Open Water Swimming"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "America/Bogota", "America/Mexico_City", "Europe/London", "Europe/Madrid", "UTC"];

interface AthleteEntry { name: string; whatsapp: string }

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [coachName, setCoachName] = useState(decodeURIComponent(params.get("name") ?? ""));
  const [email, setEmail] = useState(decodeURIComponent(params.get("email") ?? ""));
  const [whatsapp, setWhatsapp] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [sports, setSports] = useState<string[]>([]);
  const [athletes, setAthletes] = useState<AthleteEntry[]>([{ name: "", whatsapp: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", background: "var(--parchment)",
    border: "1px solid var(--rule)", borderRadius: 2, fontSize: 13,
    color: "var(--ink)", fontFamily: "var(--body)", outline: "none", boxSizing: "border-box",
  };

  async function handleFinish() {
    setLoading(true); setError(null);
    const token = await getAuthToken();
    if (!token) { navigate("/login"); return; }
    try {
      const res = await fetch(`${BACKEND}/api/v1/coach/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: coachName, email, whatsapp_number: whatsapp, timezone, specialties: sports, athletes: athletes.filter(a => a.name.trim()) }),
      });
      if (res.ok) { navigate("/dashboard"); }
      else { const b = await res.json().catch(() => ({})); setError(b.detail ?? "Setup failed. Please try again."); }
    } catch { setError("Network error — please try again."); }
    setLoading(false);
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 520, padding: "48px" }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "var(--terracotta)" : "var(--rule)" }} />
          ))}
        </div>

        <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>Step {step} of 4</div>

        {step === 1 && (
          <div>
            <h2 className="ca-display" style={{ fontSize: 28, margin: "0 0 8px" }}>Welcome, coach.</h2>
            <p className="ca-display-italic" style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 0 28px" }}>Let's set up your Andes.IA workspace.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Your name</label>
                <input value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="Felipe Deidan" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>WhatsApp number</label>
                <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+1 555 000 1234" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{ ...inputStyle, appearance: "none" as const }}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="ca-display" style={{ fontSize: 28, margin: "0 0 8px" }}>Your sport specialties</h2>
            <p className="ca-display-italic" style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 0 20px" }}>Select all sports you coach.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SPORTS.map(s => (
                <button key={s} type="button" onClick={() => setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, fontFamily: "var(--body)", cursor: "pointer", border: `1px solid ${sports.includes(s) ? "var(--aegean-deep)" : "var(--rule)"}`, background: sports.includes(s) ? "var(--aegean-wash)" : "var(--parchment)", color: sports.includes(s) ? "var(--aegean-deep)" : "var(--ink-soft)" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="ca-display" style={{ fontSize: 28, margin: "0 0 8px" }}>Add your athletes</h2>
            <p className="ca-display-italic" style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 0 20px" }}>You can always add more later.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {athletes.map((a, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "start" }}>
                  <input value={a.name} onChange={e => setAthletes(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" style={inputStyle} />
                  <input value={a.whatsapp} onChange={e => setAthletes(prev => prev.map((x, j) => j === i ? { ...x, whatsapp: e.target.value } : x))} placeholder="WhatsApp" style={inputStyle} />
                  {athletes.length > 1 && (
                    <button onClick={() => setAthletes(prev => prev.filter((_, j) => j !== i))} className="ca-btn ca-btn-ghost" style={{ fontSize: 18, padding: "8px 10px" }}>×</button>
                  )}
                </div>
              ))}
              {athletes.length < 10 && (
                <button onClick={() => setAthletes(prev => [...prev, { name: "", whatsapp: "" }])} className="ca-btn" style={{ fontSize: 12, width: "fit-content" }}>
                  + Add another athlete
                </button>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="ca-display" style={{ fontSize: 28, margin: "0 0 8px" }}>All set, {coachName.split(" ")[0]}.</h2>
            <p className="ca-display-italic" style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 0 24px", lineHeight: 1.65 }}>
              Your coaching dashboard is ready. Athletes will check in via WhatsApp, and Andes.IA will draft replies in your voice for your approval.
            </p>
            <div style={{ padding: "16px 20px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, marginBottom: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>COACH</span><span style={{ fontSize: 13, color: "var(--ink)" }}>{coachName}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>SPORTS</span><span style={{ fontSize: 13, color: "var(--ink)" }}>{sports.join(", ") || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>ATHLETES</span><span style={{ fontSize: 13, color: "var(--ink)" }}>{athletes.filter(a => a.name.trim()).length}</span></div>
              </div>
            </div>
            {error && <div style={{ padding: "10px 14px", background: "var(--terracotta-soft)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 32 }}>
          {step > 1 && <button className="ca-btn ca-btn-ghost" onClick={() => setStep(s => (s - 1) as typeof step)}>← Back</button>}
          <div style={{ flex: 1 }} />
          {step < 4 ? (
            <button className="ca-btn ca-btn-primary" disabled={step === 1 && !coachName.trim()} onClick={() => setStep(s => (s + 1) as typeof step)} style={{ opacity: step === 1 && !coachName.trim() ? 0.45 : 1, cursor: step === 1 && !coachName.trim() ? "not-allowed" : "pointer" }}>Continue →</button>
          ) : (
            <button className="ca-btn ca-btn-primary" onClick={handleFinish} disabled={loading}>{loading ? "Setting up…" : "Go to dashboard →"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
