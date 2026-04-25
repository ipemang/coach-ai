"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface AthleteEntry {
  name: string;
  whatsapp: string;
}

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

// ── Sport Specialties ──────────────────────────────────────────────────────────

const SPORTS = [
  "Triathlon",
  "Running",
  "Cycling",
  "Swimming",
  "Duathlon",
  "Mountain Biking",
  "Road Cycling",
  "Trail Running",
  "Open Water Swimming",
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Madrid",
  "UTC",
];

// ── Styles ─────────────────────────────────────────────────────────────────────

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
    padding: "48px",
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
    background: disabled
      ? "#374151"
      : "linear-gradient(135deg, #6c63ff, #4f46e5)",
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
    marginTop: "8px",
  } as React.CSSProperties,
};

// ── Progress Bar ───────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  return (
    <div style={{ marginBottom: "36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 700,
              background: s < step ? "#4f46e5" : s === step ? "linear-gradient(135deg, #6c63ff, #4f46e5)" : "#1e2235",
              border: s <= step ? "none" : "1px solid #2a2d3e",
              color: s <= step ? "#fff" : "#4b5563",
              transition: "all 0.2s",
            }}>
              {s < step ? "✓" : s}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
        {([1, 2, 3] as number[]).map((i) => (
          <div key={i} style={{
            flex: 1,
            height: "2px",
            background: i < step ? "#4f46e5" : "#1e2235",
            margin: "0 4px",
            transition: "background 0.3s",
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Voice Button ───────────────────────────────────────────────────────────────

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
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

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
      title={listening ? "Stop recording" : "Record voice input"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 12px",
        background: listening ? "#3b1219" : "#1e2235",
        border: `1px solid ${listening ? "#7f1d1d" : "#2a2d3e"}`,
        borderRadius: "6px",
        color: listening ? "#f87171" : "#9ca3af",
        fontSize: "12px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap" as const,
        flexShrink: 0,
      }}
    >
      {/* Mic icon */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      {listening ? (
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "#f87171",
            animation: "pulse 1s infinite",
          }} />
          Recording…
        </span>
      ) : (
        "Voice input"
      )}
    </button>
  );
}

// ── Step 1: Coach Profile ──────────────────────────────────────────────────────

function StepProfile({
  defaultName,
  defaultEmail,
  onNext,
}: {
  defaultName: string;
  defaultEmail: string;
  onNext: (data: {
    fullName: string;
    businessName: string;
    sportSpecialties: string[];
    whatsapp: string;
    timezone: string;
    email: string;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(defaultName);
  const [businessName, setBusinessName] = useState("");
  const [sports, setSports] = useState<string[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSport(sport: string) {
    setSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setError("Full name is required."); return; }
    if (!whatsapp.trim()) { setError("WhatsApp number is required."); return; }
    if (sports.length === 0) { setError("Select at least one sport specialty."); return; }
    setError(null);
    setLoading(true);
    try {
      await onNext({ fullName, businessName, sportSpecialties: sports, whatsapp, timezone, email });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "18px" }}>
      <div>
        <label style={S.label}>Full name *</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          placeholder="Felipe Deidan"
          style={S.input}
        />
      </div>

      <div>
        <label style={S.label}>Business / coaching brand name <span style={{ color: "#4b5563" }}>(optional)</span></label>
        <input
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Deidan Endurance Coaching"
          style={S.input}
        />
      </div>

      <div>
        <label style={S.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="coach@example.com"
          style={S.input}
        />
      </div>

      <div>
        <label style={S.label}>Sport specialties * <span style={{ color: "#4b5563" }}>(select all that apply)</span></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
          {SPORTS.map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() => toggleSport(sport)}
              style={{
                padding: "6px 12px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                border: sports.includes(sport) ? "1px solid #6c63ff" : "1px solid #2a2d3e",
                background: sports.includes(sport) ? "rgba(108,99,255,0.15)" : "#0f1117",
                color: sports.includes(sport) ? "#a5b4fc" : "#6b7280",
                transition: "all 0.15s",
              }}
            >
              {sport}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={S.label}>WhatsApp number * <span style={{ color: "#4b5563" }}>(include country code)</span></label>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          required
          placeholder="+1 305 555 0123"
          style={S.input}
        />
      </div>

      <div>
        <label style={S.label}>Timezone</label>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={S.select}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {error && <div style={S.error}>{error}</div>}

      <button type="submit" disabled={loading} style={S.primaryBtn(loading)}>
        {loading ? "Saving…" : "Continue →"}
      </button>
    </form>
  );
}

// ── Step 2: Methodology ────────────────────────────────────────────────────────

function StepMethodology({
  onNext,
  onBack,
}: {
  onNext: (data: { personaPrompt: string; methodology: string }) => Promise<void>;
  onBack: () => void;
}) {
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [methodology, setMethodology] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function appendTranscript(target: "persona" | "methodology", text: string) {
    if (target === "persona") {
      setPersonaPrompt((prev) => (prev ? `${prev} ${text}` : text));
    } else {
      setMethodology((prev) => (prev ? `${prev} ${text}` : text));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personaPrompt.trim()) {
      setError("Please describe your coaching voice — athletes will hear this style in every message.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onNext({ personaPrompt, methodology });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "22px" }}>
      {/* Coaching voice */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px" }}>
          <label style={{ ...S.label, marginBottom: 0 }}>
            Your coaching voice *
          </label>
          <VoiceButton onTranscript={(t) => appendTranscript("persona", t)} disabled={loading} />
        </div>
        <p style={{ fontSize: "12px", color: "#4b5563", marginBottom: "8px", lineHeight: 1.5 }}>
          Describe how you communicate with athletes — tone, style, language. The AI will write in your voice.
        </p>
        <textarea
          value={personaPrompt}
          onChange={(e) => setPersonaPrompt(e.target.value)}
          rows={5}
          placeholder={`e.g. "I'm direct and data-driven but always warm. I use simple language, avoid jargon, and always explain the why behind each session. I coach in English and Spanish and prefer to keep messages concise — athletes respond better to clarity than volume."`}
          style={S.textarea}
        />
        <p style={{ fontSize: "11px", color: "#374151", marginTop: "4px" }}>
          Tip: Click "Voice input" and speak naturally — it transcribes in real time.
        </p>
      </div>

      {/* Methodology */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px" }}>
          <label style={{ ...S.label, marginBottom: 0 }}>
            Training methodology <span style={{ color: "#4b5563" }}>(optional)</span>
          </label>
          <VoiceButton onTranscript={(t) => appendTranscript("methodology", t)} disabled={loading} />
        </div>
        <p style={{ fontSize: "12px", color: "#4b5563", marginBottom: "8px", lineHeight: 1.5 }}>
          How do you structure training? Periodization, zone model, weekly patterns, recovery philosophy. The AI uses this as context when building plans.
        </p>
        <textarea
          value={methodology}
          onChange={(e) => setMethodology(e.target.value)}
          rows={5}
          placeholder={`e.g. "I follow a polarized training model — 80% easy, 20% hard. I build 3-week blocks with a recovery week every 4th week. I prioritize run fitness above bike in short-course athletes, and always reserve Tuesday for pure recovery. Nutrition: I coach sodium-first hydration, targeting 1,000mg/hr on hot race days."`}
          style={S.textarea}
        />
        <p style={{ fontSize: "11px", color: "#374151", marginTop: "4px" }}>
          You can always refine this later from your profile settings.
        </p>
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

// ── Step 3: Athlete Import ─────────────────────────────────────────────────────

function StepAthletes({
  onNext,
  onBack,
  onSkip,
}: {
  onNext: (athletes: AthleteEntry[]) => Promise<void>;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [athletes, setAthletes] = useState<AthleteEntry[]>([{ name: "", whatsapp: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addAthlete() {
    if (athletes.length < 3) {
      setAthletes((prev) => [...prev, { name: "", whatsapp: "" }]);
    }
  }

  function removeAthlete(i: number) {
    setAthletes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateAthlete(i: number, field: keyof AthleteEntry, value: string) {
    setAthletes((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = athletes.filter((a) => a.name.trim() && a.whatsapp.trim());
    if (filled.length === 0) {
      setError("Add at least one athlete name and WhatsApp number, or skip this step.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onNext(filled);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "20px" }}>
      <p style={{ fontSize: "14px", color: "#9ca3af", margin: 0, lineHeight: 1.6 }}>
        Add 1–3 athletes to get started. They'll receive a welcome message via WhatsApp with a link to set up their profile. You can add more from your dashboard.
      </p>

      {athletes.map((athlete, i) => (
        <div key={i} style={{
          background: "#0f1117",
          border: "1px solid #2a2d3e",
          borderRadius: "10px",
          padding: "16px",
          display: "grid",
          gap: "12px",
          position: "relative",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Athlete {i + 1}
            </span>
            {athletes.length > 1 && (
              <button
                type="button"
                onClick={() => removeAthlete(i)}
                style={{
                  background: "none", border: "none", color: "#4b5563",
                  cursor: "pointer", fontSize: "16px", padding: "0 4px",
                }}
              >
                ×
              </button>
            )}
          </div>
          <div>
            <label style={S.label}>Athlete name</label>
            <input
              type="text"
              value={athlete.name}
              onChange={(e) => updateAthlete(i, "name", e.target.value)}
              placeholder="Marcus Johnson"
              style={S.input}
            />
          </div>
          <div>
            <label style={S.label}>WhatsApp number</label>
            <input
              type="tel"
              value={athlete.whatsapp}
              onChange={(e) => updateAthlete(i, "whatsapp", e.target.value)}
              placeholder="+1 786 555 0199"
              style={S.input}
            />
          </div>
        </div>
      ))}

      {athletes.length < 3 && (
        <button
          type="button"
          onClick={addAthlete}
          style={{
            padding: "9px",
            background: "transparent",
            border: "1px dashed #2a2d3e",
            borderRadius: "8px",
            color: "#4b5563",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          + Add another athlete
        </button>
      )}

      {error && <div style={S.error}>{error}</div>}

      <div style={{ display: "grid", gap: "8px" }}>
        <button type="submit" disabled={loading} style={S.primaryBtn(loading)}>
          {loading ? "Inviting athletes…" : "Add athletes & continue →"}
        </button>
        <button type="button" onClick={onSkip} style={S.ghostBtn}>
          Skip for now
        </button>
        <button type="button" onClick={onBack} style={{ ...S.ghostBtn, marginTop: "0" }}>
          ← Back
        </button>
      </div>
    </form>
  );
}

// ── Step 4: Done ───────────────────────────────────────────────────────────────

function StepDone({ coachName }: { coachName: string }) {
  const router = useRouter();
  const firstName = coachName.split(" ")[0] || "Coach";

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "52px", marginBottom: "16px" }}>🎉</div>
      <h2 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: "0 0 12px" }}>
        You&apos;re all set, {firstName}!
      </h2>
      <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.7, margin: "0 0 32px" }}>
        Your coaching profile is live. Head to your dashboard to start building training plans, reviewing athlete check-ins, and letting the AI handle the repetitive work.
      </p>

      <div style={{
        background: "#0f1117",
        border: "1px solid #2a2d3e",
        borderRadius: "10px",
        padding: "16px",
        marginBottom: "28px",
        textAlign: "left",
      }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
          What&apos;s next
        </p>
        {[
          "Your athletes will receive WhatsApp onboarding links",
          "Connect wearables in Settings → Integrations",
          "Customize your AI persona in Settings → Coaching voice",
        ].map((item) => (
          <div key={item} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <span style={{ color: "#4f46e5", flexShrink: 0 }}>✓</span>
            <span style={{ color: "#9ca3af", fontSize: "13px", lineHeight: 1.5 }}>{item}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push("/dashboard")}
        style={{
          ...S.primaryBtn(false),
          fontSize: "15px",
          padding: "14px",
        }}
      >
        Go to your dashboard →
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function OnboardingInner() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [coachName, setCoachName] = useState(searchParams.get("name") ?? "");
  const [coachEmail] = useState(searchParams.get("email") ?? "");

  // Load saved progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("coachai_onboarding_step");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed >= 1 && parsed <= 4) setStep(parsed as Step);
    }
  }, []);

  // Persist step
  useEffect(() => {
    localStorage.setItem("coachai_onboarding_step", String(step));
  }, [step]);

  // Helpers to get auth token for API calls
  async function getToken(): Promise<string> {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Session expired. Please sign in again.");
    return token;
  }

  // ── Step 1 handler ────────────────────────────────────────────────────────────
  async function handleProfileNext(data: {
    fullName: string;
    businessName: string;
    sportSpecialties: string[];
    whatsapp: string;
    timezone: string;
    email: string;
  }) {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}/api/v1/coach/onboarding/profile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: data.fullName,
          business_name: data.businessName || null,
          sport_specialties: data.sportSpecialties,
          whatsapp_number: data.whatsapp,
          timezone: data.timezone,
          email: data.email,
          organization_id: "1",
        }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail ?? "Failed to save profile.");
    }
    setCoachName(data.fullName);
    setStep(2);
  }

  // ── Step 2 handler ────────────────────────────────────────────────────────────
  async function handleMethodologyNext(data: { personaPrompt: string; methodology: string }) {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}/api/v1/coach/onboarding/methodology`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          persona_system_prompt: data.personaPrompt,
          methodology_playbook: data.methodology
            ? { description: data.methodology }
            : {},
        }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail ?? "Failed to save methodology.");
    }
    setStep(3);
  }

  // ── Step 3 handler ────────────────────────────────────────────────────────────
  async function handleAthletesNext(athletes: AthleteEntry[]) {
    const token = await getToken();
    // Fire-and-forget athlete invites — don't block onboarding if this fails
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}/api/v1/coach/onboarding/athletes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          athletes: athletes.map((a) => ({
            full_name: a.name,
            whatsapp_number: a.whatsapp,
          })),
        }),
      }
    );
    if (!res.ok) {
      // Non-fatal — athletes can be added from dashboard
      console.warn("Athlete import returned non-ok:", await res.text());
    }
    localStorage.removeItem("coachai_onboarding_step");
    setStep(4);
  }

  const STEP_LABELS: Record<Step, string> = {
    1: "Your profile",
    2: "Coaching style",
    3: "Add athletes",
    4: "You're ready",
  };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        select option { background: #1a1d2e; color: #fff; }
      `}</style>
      <div style={S.page}>
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
              {step < 4 ? "Set up your coaching profile" : "Welcome to Andesia"}
            </h1>
            {step < 4 && (
              <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
                Step {step} of 3 — {STEP_LABELS[step]}
              </p>
            )}
          </div>

          {step < 4 && <ProgressBar step={step} />}

          {step === 1 && (
            <StepProfile
              defaultName={coachName}
              defaultEmail={coachEmail}
              onNext={handleProfileNext}
            />
          )}
          {step === 2 && (
            <StepMethodology
              onNext={handleMethodologyNext}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepAthletes
              onNext={handleAthletesNext}
              onBack={() => setStep(2)}
              onSkip={() => {
                localStorage.removeItem("coachai_onboarding_step");
                setStep(4);
              }}
            />
          )}
          {step === 4 && <StepDone coachName={coachName} />}
        </div>
      </div>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#6b7280", fontFamily: "-apple-system, sans-serif", fontSize: "14px" }}>Loading…</div>
      </div>
    }>
      <OnboardingInner />
    </Suspense>
  );
}
