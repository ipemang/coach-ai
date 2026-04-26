"use client";

/**
 * COA-97: Athlete onboarding flow — 5 steps.
 * Identity → Sports → Goals → Health history → Done
 */

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Web Speech API Types ───────────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const TOTAL_STEPS = 4;
const STEP_LABELS = ["Your info", "Sport profile", "Goals", "Health history"];

const SPORTS = ["Triathlon", "Running", "Cycling", "Swimming", "Duathlon", "Trail Running", "Mountain Biking"];
const DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "Sprint Triathlon", "Olympic Triathlon", "70.3 Half Ironman", "Full Ironman", "Other"];
const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced", "Elite"];

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--parchment)",
  border: "1px solid var(--rule)",
  borderRadius: 2,
  fontSize: 13,
  color: "var(--ink)",
  fontFamily: "var(--body)",
  outline: "none",
  boxSizing: "border-box",
};

const textareaSt: React.CSSProperties = {
  ...inputSt,
  resize: "vertical",
  lineHeight: 1.6,
};

const selectSt: React.CSSProperties = {
  ...inputSt,
  appearance: "none",
  cursor: "pointer",
};

// ── Voice Button ──────────────────────────────────────────────────────────────

function VoiceButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) onTranscript(transcript.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stopListening : startListening}
      disabled={disabled}
      title={listening ? "Stop recording" : "Dictate your answer"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        background: listening ? "var(--terracotta-deep)" : "var(--parchment)",
        border: `1px solid ${listening ? "var(--terracotta-deep)" : "var(--rule)"}`,
        borderRadius: 2,
        color: listening ? "#fff" : "var(--ink-mute)",
        fontSize: 11,
        fontFamily: "var(--mono)",
        letterSpacing: "0.06em",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap" as const,
        flexShrink: 0,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      {listening ? "Recording…" : "Voice"}
    </button>
  );
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 5,
        fontSize: 10,
        fontFamily: "var(--mono)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ink-mute)",
      }}
    >
      {children}
      {optional && (
        <span style={{ marginLeft: 6, color: "var(--rule)", textTransform: "none", letterSpacing: 0, fontSize: 11, fontFamily: "var(--body)" }}>
          optional
        </span>
      )}
    </label>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "0.625rem 0.875rem",
        background: "var(--terracotta-soft)",
        border: "1px solid oklch(0.75 0.10 45)",
        borderRadius: 2,
        fontSize: 12,
        color: "var(--terracotta-deep)",
      }}
    >
      {msg}
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
  small,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: small ? "4px 11px" : "6px 14px",
        borderRadius: 2,
        fontSize: small ? 11 : 12,
        fontFamily: "var(--body)",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--aegean-deep)" : "var(--rule)"}`,
        background: active ? "var(--aegean-wash)" : "var(--parchment)",
        color: active ? "var(--aegean-deep)" : "var(--ink-soft)",
        transition: "all 140ms",
      }}
    >
      {label}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      {/* Step dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                background: s < step ? "var(--aegean-deep)" : s === step ? "var(--terracotta)" : "var(--linen-deep)",
                border: `1px solid ${s < step ? "var(--aegean-deep)" : s === step ? "var(--terracotta)" : "var(--rule)"}`,
                color: s <= step ? "oklch(0.97 0.01 50)" : "var(--ink-mute)",
                flexShrink: 0,
              }}
            >
              {s < step ? "✓" : s}
            </div>
            {i < TOTAL_STEPS - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: s < step ? "var(--aegean-deep)" : "var(--rule)",
                  margin: "0 4px",
                }}
              />
            )}
          </div>
        ))}
      </div>
      {/* Step label */}
      <p
        className="ca-mono"
        style={{
          marginTop: 10,
          fontSize: 10.5,
          color: "var(--terracotta-deep)",
          letterSpacing: "0.10em",
        }}
      >
        Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
      </p>
    </div>
  );
}

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
    <form onSubmit={submit} style={{ display: "grid", gap: "1.125rem" }}>
      <div>
        <FieldLabel optional>Date of birth</FieldLabel>
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} style={inputSt} />
      </div>

      <div>
        <FieldLabel optional>Gender</FieldLabel>
        <select value={gender} onChange={(e) => setGender(e.target.value)} style={selectSt}>
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non_binary">Non-binary</option>
        </select>
      </div>

      <div>
        <FieldLabel>Current fitness level</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {FITNESS_LEVELS.map((level) => (
            <ToggleChip
              key={level}
              label={level}
              active={fitnessLevel === level}
              onClick={() => setFitnessLevel(level)}
            />
          ))}
        </div>
      </div>

      {error && <ErrorBanner msg={error} />}

      <button
        type="submit"
        disabled={loading || !fitnessLevel}
        className="ca-btn ca-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, marginTop: 4, opacity: loading || !fitnessLevel ? 0.5 : 1 }}
      >
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
    <form onSubmit={submit} style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <FieldLabel>Primary sport</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {SPORTS.map((s) => (
            <ToggleChip key={s} label={s} active={primarySport === s} onClick={() => setPrimarySport(s)} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel optional>Other sports you train</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {SPORTS.filter((s) => s !== primarySport).map((s) => (
            <ToggleChip key={s} label={s} active={secondary.includes(s)} onClick={() => toggleSecondary(s)} small />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <FieldLabel optional>Years training</FieldLabel>
          <input type="number" min="0" max="50" value={years} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 3" style={inputSt} />
        </div>
        <div>
          <FieldLabel optional>Weekly hours</FieldLabel>
          <input type="number" min="0" max="40" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 10" style={inputSt} />
        </div>
      </div>

      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
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
    <form onSubmit={submit} style={{ display: "grid", gap: "1.125rem" }}>
      <div>
        <FieldLabel optional>Target event</FieldLabel>
        <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Miami 70.3, Boston Marathon" style={inputSt} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <FieldLabel optional>Event date</FieldLabel>
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputSt} />
        </div>
        <div>
          <FieldLabel optional>Distance</FieldLabel>
          <select value={eventDistance} onChange={(e) => setEventDistance(e.target.value)} style={selectSt}>
            <option value="">Select…</option>
            {DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <FieldLabel>Your main goal</FieldLabel>
          <VoiceButton onTranscript={(t) => setGoal((prev) => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="e.g. Finish my first half ironman under 6 hours" style={textareaSt} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <FieldLabel optional>How will you know you succeeded?</FieldLabel>
          <VoiceButton onTranscript={(t) => setSuccess((prev) => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea value={success} onChange={(e) => setSuccess(e.target.value)} rows={2} placeholder="e.g. Cross the finish line feeling strong, not just survive it" style={textareaSt} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <FieldLabel optional>Personal bests / past race times</FieldLabel>
          <VoiceButton onTranscript={(t) => setBests((prev) => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea value={bests} onChange={(e) => setBests(e.target.value)} rows={2} placeholder="e.g. 5K: 22 min, 70.3: 5:45" style={textareaSt} />
      </div>

      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
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
      await onNext({ injury_history: injuries || null, medical_notes: medical || null, current_limiters: limiters || null });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.125rem" }}>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
        This helps your coach and AI understand your body. All fields are optional — share only what you&apos;re comfortable with.
      </p>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <FieldLabel optional>Injury history</FieldLabel>
          <VoiceButton onTranscript={(t) => setInjuries((prev) => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} rows={3} placeholder="e.g. Right IT band flares up above 15K. Had a stress fracture in 2023, fully healed." style={textareaSt} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <FieldLabel optional>Medical notes</FieldLabel>
          <VoiceButton onTranscript={(t) => setMedical((prev) => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea value={medical} onChange={(e) => setMedical(e.target.value)} rows={2} placeholder="e.g. Asthma — use inhaler before hard sessions." style={textareaSt} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <FieldLabel optional>What&apos;s currently limiting your performance?</FieldLabel>
          <VoiceButton onTranscript={(t) => setLimiters((prev) => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea value={limiters} onChange={(e) => setLimiters(e.target.value)} rows={2} placeholder="e.g. Poor swim technique, limited morning training time" style={textareaSt} />
      </div>

      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Generate my profile →" />
    </form>
  );
}

// ── Step 5: Done ──────────────────────────────────────────────────────────────

function StepDone({ athleteName, aiProfile }: { athleteName: string; aiProfile: string }) {
  const router = useRouter();
  const firstName = athleteName.split(" ")[0] || "Athlete";

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 52, margin: "0 0 16px" }}>🎉</p>
      <h2
        className="ca-display"
        style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 8px" }}
      >
        You&apos;re all set, {firstName}!
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-soft)",
          lineHeight: 1.65,
          margin: "0 0 24px",
        }}
      >
        Your AI training profile has been generated. Your coach can now
        tailor your plan to exactly who you are.
      </p>

      {/* AI profile card */}
      <div
        style={{
          padding: "1rem 1.25rem",
          background: "var(--aegean-wash)",
          border: "1px solid var(--aegean-soft)",
          borderLeft: "3px solid var(--aegean-deep)",
          borderRadius: 2,
          textAlign: "left",
          marginBottom: "1.75rem",
        }}
      >
        <p
          className="ca-eyebrow ca-eyebrow-aegean"
          style={{ fontSize: 9.5, marginBottom: 8 }}
        >
          ⚡ Your AI profile
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-soft)",
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          {aiProfile}
        </p>
      </div>

      <button
        onClick={() => router.push("/athlete/dashboard")}
        className="ca-btn ca-btn-primary"
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "12px",
          fontSize: 14,
        }}
      >
        Go to my dashboard →
      </button>
    </div>
  );
}

// ── Generating screen ─────────────────────────────────────────────────────────

function GeneratingScreen() {
  return (
    <div
      className="mosaic-bg"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          className="ca-avatar"
          style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 16px" }}
        >
          <span>⚡</span>
        </div>
        <h2
          className="ca-display"
          style={{ fontSize: 20, color: "var(--ink)", margin: "0 0 8px" }}
        >
          Generating your AI profile…
        </h2>
        <p className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>
          This takes about 10 seconds
        </p>
      </div>
    </div>
  );
}

// ── Nav buttons ───────────────────────────────────────────────────────────────

function NavButtons({ onBack, loading, label }: { onBack: () => void; loading: boolean; label: string }) {
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
      <button
        type="submit"
        disabled={loading}
        className="ca-btn ca-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, opacity: loading ? 0.5 : 1 }}
      >
        {loading ? "Saving…" : label}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="ca-btn ca-btn-ghost"
        style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13 }}
      >
        ← Back
      </button>
    </div>
  );
}

// ── Page orchestrator ─────────────────────────────────────────────────────────

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

  useEffect(() => {
    getToken()
      .then((token) =>
        fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, { headers: { Authorization: `Bearer ${token}` } })
      )
      .then((r) => r.json())
      .then((data) => {
        if (data.onboarding_complete) router.replace("/athlete/dashboard");
        if (data.full_name) setAthleteName(data.full_name);
      })
      .catch(() => {});
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

  if (completing) return <GeneratingScreen />;

  return (
    <div
      className="mosaic-bg"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <style>{`select option { background: var(--parchment); color: var(--ink); }`}</style>
      <div
        className="ca-panel"
        style={{ width: "100%", maxWidth: step === 5 ? 480 : 520, padding: "2.5rem 2rem" }}
      >
        {/* Header */}
        {step < 5 && (
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <div
              className="ca-avatar"
              style={{ width: 44, height: 44, fontSize: 18, margin: "0 auto 14px" }}
            >
              <span>C</span>
            </div>
            <h1
              className="ca-display"
              style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 4px" }}
            >
              Set up your athlete profile
            </h1>
          </div>
        )}

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
    <Suspense
      fallback={
        <div
          className="mosaic-bg"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading…</p>
        </div>
      }
    >
      <OnboardingInner />
    </Suspense>
  );
}
