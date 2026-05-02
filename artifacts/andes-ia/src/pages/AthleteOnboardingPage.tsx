import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { BACKEND, getAuthToken } from "../lib/api";

const SPORTS = ["Triathlon", "Running", "Cycling", "Swimming", "Duathlon", "Trail Running", "Other"];
const GOALS = ["Complete my first race", "Achieve a personal best", "Qualify for a championship", "Build base fitness", "Recover from injury", "Lose weight and get fit"];
const DISTANCES = ["Sprint triathlon", "Olympic triathlon", "70.3 Half Iron", "Full Ironman", "5K", "10K", "Half marathon", "Marathon", "Other"];

export default function AthleteOnboardingPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const inviteToken = params.get("token") ?? undefined;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sport, setSport] = useState("");
  const [goal, setGoal] = useState("");
  const [targetRace, setTargetRace] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [distance, setDistance] = useState("");
  const [injuryHistory, setInjuryHistory] = useState("");
  const [maxWeeklyHours, setMaxWeeklyHours] = useState("8");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", background: "#f5f2ec",
    border: "1px solid #c9b59a", borderRadius: 2, fontSize: 14,
    color: "#2a2018", fontFamily: "'Work Sans', sans-serif", outline: "none", boxSizing: "border-box",
  };

  async function handleFinish() {
    setLoading(true); setError(null);
    const token = await getAuthToken();
    if (!token) { navigate("/login"); return; }
    try {
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: `${firstName} ${lastName}`.trim(),
          invite_token: inviteToken,
          stable_profile: {
            target_race: targetRace || undefined,
            race_date: raceDate || undefined,
            max_weekly_hours: maxWeeklyHours ? parseInt(maxWeeklyHours) : undefined,
            injury_history: injuryHistory || undefined,
            primary_sport: sport || undefined,
            goal: goal || undefined,
            target_distance: distance || undefined,
          },
        }),
      });
      if (res.ok) { navigate("/athlete/dashboard"); }
      else { const b = await res.json().catch(() => ({})); setError(b.detail ?? "Setup failed. Please try again."); }
    } catch { setError("Network error — please try again."); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f2ec", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "'Work Sans', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#ede8df", border: "1px solid #c9b59a", borderRadius: 4, padding: 40 }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#c0704a" : "#c9b59a" }} />
          ))}
        </div>

        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c0704a", margin: "0 0 8px" }}>Step {step} of 3</p>

        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, fontWeight: 500, margin: "0 0 8px" }}>Welcome, athlete.</h2>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 16, color: "#6a5a4a", margin: "0 0 28px", lineHeight: 1.65 }}>
              Let's set up your profile so your coach can personalize your training.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>First name</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Alex" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Last name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Thompson" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Primary sport</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SPORTS.map(s => (
                    <button key={s} type="button" onClick={() => setSport(s)} style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, fontFamily: "'Work Sans', sans-serif", cursor: "pointer", border: `1px solid ${sport === s ? "#4a6b7a" : "#c9b59a"}`, background: sport === s ? "#d4e0e8" : "#f5f2ec", color: sport === s ? "#4a6b7a" : "#6a5a4a" }}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Primary goal</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {GOALS.map(g => (
                    <button key={g} type="button" onClick={() => setGoal(g)} style={{ padding: "9px 14px", borderRadius: 2, fontSize: 13, textAlign: "left", cursor: "pointer", border: `1px solid ${goal === g ? "#4a6b7a" : "#c9b59a"}`, background: goal === g ? "#d4e0e8" : "#f5f2ec", color: goal === g ? "#4a6b7a" : "#6a5a4a" }}>{g}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, fontWeight: 500, margin: "0 0 8px" }}>Your target event</h2>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 16, color: "#6a5a4a", margin: "0 0 24px" }}>Give your coach something to aim at.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Race name</label>
                <input value={targetRace} onChange={e => setTargetRace(e.target.value)} placeholder="e.g. Ironman 70.3 Miami" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Race date</label>
                <input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Distance</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DISTANCES.map(d => (
                    <button key={d} type="button" onClick={() => setDistance(d)} style={{ padding: "7px 14px", borderRadius: 2, fontSize: 13, cursor: "pointer", border: `1px solid ${distance === d ? "#4a6b7a" : "#c9b59a"}`, background: distance === d ? "#d4e0e8" : "#f5f2ec", color: distance === d ? "#4a6b7a" : "#6a5a4a" }}>{d}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, fontWeight: 500, margin: "0 0 8px" }}>A little more</h2>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 16, color: "#6a5a4a", margin: "0 0 24px" }}>Help your coach keep you healthy and progressing.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Max hours/week available to train</label>
                <input type="number" value={maxWeeklyHours} onChange={e => setMaxWeeklyHours(e.target.value)} min={1} max={30} placeholder="8" style={{ ...inputStyle, width: 120 }} />
              </div>
              <div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: 6 }}>Injury history <span style={{ opacity: 0.6 }}>(optional)</span></label>
                <textarea value={injuryHistory} onChange={e => setInjuryHistory(e.target.value)} rows={3} placeholder="Any chronic or recent injuries your coach should know about…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }} />
              </div>
            </div>
            {error && <div style={{ marginTop: 16, padding: "10px 14px", background: "#f5d8d4", borderRadius: 2, color: "#8a2010", fontSize: 13 }}>{error}</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 32 }}>
          {step > 1 && <button onClick={() => setStep(s => (s - 1) as typeof step)} style={{ padding: "10px 18px", background: "transparent", border: "1px solid #c9b59a", borderRadius: 2, color: "#6a5a4a", fontSize: 13, cursor: "pointer" }}>← Back</button>}
          <div style={{ flex: 1 }} />
          {step < 3 ? (
            <button onClick={() => setStep(s => (s + 1) as typeof step)} style={{ padding: "10px 24px", background: "#4a6b7a", color: "#fff", border: "none", borderRadius: 2, fontSize: 14, cursor: "pointer", fontFamily: "'Work Sans', sans-serif" }}>Continue →</button>
          ) : (
            <button onClick={handleFinish} disabled={loading} style={{ padding: "10px 24px", background: loading ? "#8a7a6a" : "#4a6b7a", color: "#fff", border: "none", borderRadius: 2, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Work Sans', sans-serif" }}>
              {loading ? "Setting up…" : "Go to my dashboard →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
