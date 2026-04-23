"use client";

/**
 * COA-97: Athlete onboarding flow — 5 steps.
 *
 * Steps:
 *   1. Identity   — date of birth, gender, fitness level
 *   2. Sports     — primary sport, secondary sports, years training, weekly hours
 *   3. Goals      — target event, goal description, success definition, previous bests
 *   4. History    — injury history, medical notes, current limiters
 *   5. Done       — POST /complete triggers AI profile generation; show the result
 *
 * Requires: athlete Supabase session with athlete_id in JWT (set after /auth/callback link-account + refresh).
 * Redirects to /athlete/dashboard when complete.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "24px 16px",
  } as React.CSSProperties,
  card: {
    background: "#1a1d2e",
    border: "1px solid #2a2d3e",
    borderRadius: "20px",
    padding: "44px",
    width: "100%",
    maxWidth: "520px",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: "#9ca3af",
    marginBottom: "6px",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 14px",
    background: "#0f1117",
    border: "1px solid #2a2d3e",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    boxSizing: "border-box" as const,
    outline: "none",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    padding: "12px 14px",
    background: "#0f1117",
    border: "1px solid #2a2d3e",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    boxSizing: "border-box" as const,
    outline: "none",
    resize: "vertical" as const,
    lineHeight: 1.6,
  } as React.CSSProperties,
  select: {
    width: "100%",
    padding: "10px 14px",
    background: "#0f1117",
    border: "1px solid #2a2d3e",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    boxSizing: "border-box" as const,
    outline: "none",
    appearance: "none" as const,
  } as React.CSSProperties,
  primaryBtn: (disabled?: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "12px",
    background: disabled ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    marginTop: "8px",
  }),
  ghostBtn: {
    width: "100%",
    padding: "11px",
    background: "transparent",
    border: "1px solid #2a2d3e",
    borderRadius: "8px",
    color: "#6b7280",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "8px",
  } as React.CSSProperties,
  error: {
    background: "#3b1219",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    marginTop: "4px",
  } as React.CSSProperties,
};

const TOTAL_STEPS = 4;

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 700,
              background: s < step ? "#4f46e5" : s === step ? "linear-gradient(135deg, #6c63ff, #4f46e5)" : "#1e2235",
              border: s <= step ? "none" : "1px solid #2a2d3e",
              color: s <= step ? "#fff" : "#4b5563",
            }}>
              {s < step ? "✓" : s}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex" }}>
        {Array.from({ length: TOTAL_STEPS - 1 }, (_, i) => i + 1).map((i) => (
          <div key={i} style={{
            flex: 1,
            height: "2px",
            background: i < step ? "#4f46e5" : "#1e2235",
            margin: "0 4px",
          }} />
        ))}
      </div>
    </div>
  );
}

const SPORTS = ["Triathlon", "Running", "Cycling", "Swimming", "Duathlon", "Trail Running", "Mountain Biking"];
const DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "Sprint Triathlon", "Olympic Triathlon", "70.3 Half Ironman", "Full Ironman", "Other"];
const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced", "Elite"];

// ── Step 1: Identity ──────────────────────────────────────────────────────────

function StepIdentity({ onNext }: { onNext: (d: object) => Promise<void> }) {
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [fitnessLevel, setFitnessLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await onNext({ date_of_birth: dob || null, gender: gender || null, fitness_level: fitnessLevel.toLowerCase() || null });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "18px" }}>
      <div>
        <label style={S.label}>Date of birth <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} style={S.input} />
      </div>
      <div>
        <label style={S.label}>Gender <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <select value={gender} onChange={(e) => setGender(e.target.value)} style={S.select}>
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non_binary">Non-binary</option>
        </select>
      </div>
      <div>
        <label style={S.label}>Current fitness level *</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {FITNESS_LEVELS.map((level) => (
            <button
              key={level} type="button"
              onClick={() => setFitnessLevel(level)}
              style={{
                padding: "7px 16px", borderRadius: "20px", fontSize: "13px", fontWeight: 500,
                cursor: "pointer",
                border: fitnessLevel === level ? "1px solid #6c63ff" : "1px solid #2a2d3e",
                background: fitnessLevel === level ? "rgba(108,99,255,0.15)" : "#0f1117",
                color: fitnessLevel === level ? "#a5b4fc" : "#6b7280",
              }}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
      {error && <div style={S.error}>{error}</div>}
      <button type="submit" disabled={loading || !fitnessLevel} style={S.primaryBtn(loading || !fitnessLevel)}>
        {loading ? "Saving…" : "Continue →"}
      </button>
    </form>
  );
}

// ── Step 2: Sports ────────────────────────────────────────────────────────────

function StepSports({ onNext, onBack }: { onNext: (d: object) => Promise<void>; onBack: () => void }) {
  const [primarySport, setPrimarySport] = useState("");
  const [secondary, setSecondary] = useState<string[]>([]);
  const [years, setYears] = useState("");
  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSecondary(s: string) {
    setSecondary((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!primarySport) { setError("Please select your primary sport."); return; }
    setLoading(true); setError(null);
    try {
      await onNext({
        primary_sport: primarySport.toLowerCase(),
        secondary_sports: secondary.map((s) => s.toLowerCase()),
        years_training: years ? parseInt(years) : null,
        current_weekly_hours: hours ? parseFloat(hours) : null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "20px" }}>
      <div>
        <label style={S.label}>Primary sport *</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {SPORTS.map((s) => (
            <button key={s} type="button" onClick={() => setPrimarySport(s)}
              style={{
                padding: "7px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: 500, cursor: "pointer",
                border: primarySport === s ? "1px solid #6c63ff" : "1px solid #2a2d3e",
                background: primarySport === s ? "rgba(108,99,255,0.15)" : "#0f1117",
                color: primarySport === s ? "#a5b4fc" : "#6b7280",
              }}
            >{s}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={S.label}>Other sports you train <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {SPORTS.filter((s) => s !== primarySport).map((s) => (
            <button key={s} type="button" onClick={() => toggleSecondary(s)}
              style={{
                padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, cursor: "pointer",
                border: secondary.includes(s) ? "1px solid #4b5563" : "1px solid #1e2235",
                background: secondary.includes(s) ? "#1e2235" : "transparent",
                color: secondary.includes(s) ? "#9ca3af" : "#4b5563",
              }}
            >{s}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={S.label}>Years training</label>
          <input type="number" min="0" max="50" value={years} onChange={(e) => setYears(e.target.value)}
            placeholder="e.g. 3" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Weekly hours</label>
          <input type="number" min="0" max="40" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
            placeholder="e.g. 10" style={S.input} />
        </div>
      </div>
      {error && <div style={S.error}>{error}</div>}
      <div style={{ display: "grid", gap: "8px" }}>
        <button type="submit" disabled={loading} style={S.primaryBtn(loading)}>
          {loading ? "Saving…" : "Continue →"}
        </button>
        <button type="button" onClick={onBack} style={S.ghostBtn}>← Back</button>
      </div>
    </form>
  );
}

// ── Step 3: Goals ─────────────────────────────────────────────────────────────

function StepGoals({ onNext, onBack }: { onNext: (d: object) => Promise<void>; onBack: () => void }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventDistance, setEventDistance] = useState("");
  const [goal, setGoal] = useState("");
  const [success, setSuccess] = useState("");
  const [bests, setBests] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) { setError("Please describe your main goal."); return; }
    setLoading(true); setError(null);
    try {
      await onNext({
        target_event_name: eventName || null,
        target_event_date: eventDate || null,
        target_event_distance: eventDistance || null,
        goal_description: goal,
        success_definition: success || null,
        previous_bests: bests || null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "18px" }}>
      <div>
        <label style={S.label}>Target event <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
          placeholder="e.g. Miami 70.3, Boston Marathon" style={S.input} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={S.label}>Event date</label>
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={S.input} />
        </div>
        <div>
          <label style={S.label}>Distance</label>
          <select value={eventDistance} onChange={(e) => setEventDistance(e.target.value)} style={S.select}>
            <option value="">Select…</option>
            {DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={S.label}>Your main goal *</label>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
          placeholder="e.g. Finish my first half ironman under 6 hours"
          style={S.textarea} />
      </div>
      <div>
        <label style={S.label}>How will you know you succeeded? <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <textarea value={success} onChange={(e) => setSuccess(e.target.value)} rows={2}
          placeholder="e.g. Cross the finish line feeling strong, not just survive it"
          style={S.textarea} />
      </div>
      <div>
        <label style={S.label}>Personal bests / past race times <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <textarea value={bests} onChange={(e) => setBests(e.target.value)} rows={2}
          placeholder="e.g. 5K: 22 min, 70.3: 5:45"
          style={S.textarea} />
      </div>
      {error && <div style={S.error}>{error}</div>}
      <div style={{ display: "grid", gap: "8px" }}>
        <button type="submit" disabled={loading} style={S.primaryBtn(loading)}>
          {loading ? "Saving…" : "Continue →"}
        </button>
        <button type="button" onClick={onBack} style={S.ghostBtn}>← Back</button>
      </div>
    </form>
  );
}

// ── Step 4: Health History ────────────────────────────────────────────────────

function StepHistory({ onNext, onBack }: { onNext: (d: object) => Promise<void>; onBack: () => void }) {
  const [injuries, setInjuries] = useState("");
  const [medical, setMedical] = useState("");
  const [limiters, setLimiters] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await onNext({
        injury_history: injuries || null,
        medical_notes: medical || null,
        current_limiters: limiters || null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "18px" }}>
      <p style={{ color: "#6b7280", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>
        This information helps your coach and AI understand your body. All fields are optional — share only what you're comfortable with.
      </p>
      <div>
        <label style={S.label}>Injury history <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} rows={3}
          placeholder="e.g. Right IT band flares up above 15K. Had a stress fracture in 2023, fully healed."
          style={S.textarea} />
      </div>
      <div>
        <label style={S.label}>Medical notes <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <textarea value={medical} onChange={(e) => setMedical(e.target.value)} rows={2}
          placeholder="e.g. Asthma — use inhaler before hard sessions. No other conditions."
          style={S.textarea} />
      </div>
      <div>
        <label style={S.label}>What's currently limiting your performance? <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <textarea value={limiters} onChange={(e) => setLimiters(e.target.value)} rows={2}
          placeholder="e.g. Poor swim technique, low overall weekly volume, work schedule limits morning training"
          style={S.textarea} />
      </div>
      {error && <div style={S.error}>{error}</div>}
      <div style={{ display: "grid", gap: "8px" }}>
        <button type="submit" disabled={loading} style={S.primaryBtn(loading)}>
          {loading ? "Saving…" : "Generate my profile →"}
        </button>
        <button type="button" onClick={onBack} style={S.ghostBtn}>← Back</button>
      </div>
    </form>
  );
}

// ── Step 5: Done ──────────────────────────────────────────────────────────────

function StepDone({ athleteName, aiProfile }: { athleteName: string; aiProfile: string }) {
  const router = useRouter();
  const firstName = athleteName.split(" ")[0] || "Athlete";

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "52px", marginBottom: "16px" }}>🎉</div>
      <h2 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: "0 0 8px" }}>
        You&apos;re all set, {firstName}!
      </h2>
      <p style={{ color: "#6b7280", fontSize: "14px", margin: "0 0 28px", lineHeight: 1.6 }}>
        Your AI training profile has been generated. Your coach can now see exactly who you are and tailor your plan accordingly.
      </p>

      {/* AI Profile card */}
      <div style={{
        background: "rgba(79,70,229,0.08)",
        border: "1px solid rgba(79,70,229,0.25)",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "28px",
        textAlign: "left",
      }}>
        <p style={{ color: "#6c63ff", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
          ⚡ Your AI profile
        </p>
        <p style={{ color: "#c4c9d4", fontSize: "14px", lineHeight: 1.7, margin: 0 }}>
          {aiProfile}
        </p>
      </div>

      <button
        onClick={() => router.push("/athlete/dashboard")}
        style={{
          ...S.primaryBtn(false),
          fontSize: "15px",
          padding: "14px",
        }}
      >
        Go to my dashboard →
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STEP_LABELS = ["Your info", "Sport profile", "Goals", "Health history"];

function OnboardingInner() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [athleteName, setAthleteName] = useState("");
  const [aiProfile, setAiProfile] = useState("");
  const [completing, setCompleting] = useState(false);

  async function getToken(): Promise<string> {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");
    return token;
  }

  async function getAthleteName(): Promise<string> {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user?.user_metadata?.full_name ?? data.user?.email ?? "";
  }

  // Check if already complete on mount
  useEffect(() => {
    getToken().then((token) =>
      fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json()).then((data) => {
      if (data.onboarding_complete) router.replace("/athlete/dashboard");
      if (data.full_name) setAthleteName(data.full_name);
    }).catch(() => {});
  }, [router]);

  async function post(endpoint: string, body: object) {
    const token = await getToken();
    const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail ?? "Failed to save. Please try again.");
    }
    return res.json();
  }

  async function handleStep1(data: object) { await post("identity", data); setStep(2); }
  async function handleStep2(data: object) { await post("sports", data); setStep(3); }
  async function handleStep3(data: object) { await post("goals", data); setStep(4); }

  async function handleStep4(data: object) {
    await post("history", data);
    setCompleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Profile generation failed");
      const result = await res.json();
      setAiProfile(result.ai_profile_summary ?? "");
      const name = await getAthleteName();
      setAthleteName(name);
      setStep(5);
    } catch {
      setAiProfile("Your profile has been saved. Your coach will review it shortly.");
      const name = await getAthleteName();
      setAthleteName(name);
      setStep(5);
    } finally {
      setCompleting(false);
    }
  }

  // Generating profile loading screen
  if (completing) {
    return (
      <div style={S.page}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "52px", height: "52px", borderRadius: "14px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 20px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "26px",
          }}>⚡</div>
          <h2 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: "0 0 10px" }}>
            Generating your AI profile…
          </h2>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>This takes about 10 seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`select option { background: #1a1d2e; color: #fff; }`}</style>
      <div style={S.card}>
        {/* Header */}
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "11px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 14px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px",
          }}>⚡</div>
          <h1 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: "0 0 4px" }}>
            {step < 5 ? "Set up your athlete profile" : "Welcome to Coach.AI"}
          </h1>
          {step < 5 && (
            <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
              Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
            </p>
          )}
        </div>

        {step < 5 && <ProgressBar step={step} />}

        {step === 1 && <StepIdentity onNext={handleStep1} />}
        {step === 2 && <StepSports onNext={handleStep2} onBack={() => setStep(1)} />}
        {step === 3 && <StepGoals onNext={handleStep3} onBack={() => setStep(2)} />}
        {step === 4 && <StepHistory onNext={handleStep4} onBack={() => setStep(3)} />}
        {step === 5 && <StepDone athleteName={athleteName} aiProfile={aiProfile} />}
      </div>
    </div>
  );
}

export default function AthleteOnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6b7280", fontFamily: "sans-serif", fontSize: "14px" }}>Loading…</p>
      </div>
    }>
      <OnboardingInner />
    </Suspense>
  );
}
