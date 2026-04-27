"use client";

/**
 * COA-109: Comprehensive athlete onboarding — 3-path, 7-step flow.
 * Path A (new_fresh): new athlete, new coach, new to app
 * Path B (new_existing_relationship): existing coaching relationship, new to app
 * Path C (returning): already in app — redirected to /athlete/profile-update instead
 */

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

// ── Web Speech API types ──────────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://coach-ai-production-a5aa.up.railway.app";
const TOTAL_STEPS = 7;
const STEP_LABELS = ["Your situation", "About you", "Athletic background", "Training & plans", "Goals & races", "Health & body", "Lifestyle & availability"];

const SPORTS = ["Triathlon", "Running", "Cycling", "Swimming", "Duathlon", "Trail Running", "Mountain Biking", "Open Water Swimming"];
const DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "Sprint Triathlon", "Olympic Triathlon", "70.3 Half Ironman", "Full Ironman", "Gran Fondo", "Other"];
const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced", "Elite"];
const EQUIPMENT_OPTIONS = ["Pool", "Open Water", "Cycling Trainer / Smart Trainer", "Road Bike", "Mountain Bike", "Track", "Gym / Weights", "Hills / Elevation", "Treadmill"];
const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "var(--parchment)",
  border: "1px solid var(--rule)", borderRadius: 2, fontSize: 13,
  color: "var(--ink)", fontFamily: "var(--body)", outline: "none", boxSizing: "border-box",
};
const textareaSt: React.CSSProperties = { ...inputSt, resize: "vertical", lineHeight: 1.6 };
const selectSt: React.CSSProperties = { ...inputSt, appearance: "none", cursor: "pointer" };

// ── Shared UI components ──────────────────────────────────────────────────────

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label style={{ display: "block", marginBottom: 5, fontSize: 10, fontFamily: "var(--mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
      {children}
      {optional && <span style={{ marginLeft: 6, color: "var(--rule)", textTransform: "none", letterSpacing: 0, fontSize: 11, fontFamily: "var(--body)" }}>optional</span>}
    </label>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ padding: "0.625rem 0.875rem", background: "var(--terracotta-soft)", border: "1px solid oklch(0.75 0.10 45)", borderRadius: 2, fontSize: 12, color: "var(--terracotta-deep)" }}>
      {msg}
    </div>
  );
}

function ToggleChip({ label, active, onClick, small }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: small ? "4px 11px" : "6px 14px", borderRadius: 2,
      fontSize: small ? 11 : 12, fontFamily: "var(--body)", fontWeight: active ? 600 : 400,
      cursor: "pointer", border: `1px solid ${active ? "var(--aegean-deep)" : "var(--rule)"}`,
      background: active ? "var(--aegean-wash)" : "var(--parchment)",
      color: active ? "var(--aegean-deep)" : "var(--ink-soft)", transition: "all 140ms",
    }}>{label}</button>
  );
}

function VoiceButton({ onTranscript, disabled }: { onTranscript: (t: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  useEffect(() => { setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = (e: SpeechRecognitionEvent) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      if (t.trim()) onTranscript(t.trim());
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recRef.current = r; r.start(); setListening(true);
  }, [onTranscript]);
  const stop = useCallback(() => { recRef.current?.stop(); setListening(false); }, []);
  if (!supported) return null;
  return (
    <button type="button" onClick={listening ? stop : start} disabled={disabled} title={listening ? "Stop" : "Dictate"} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
      background: listening ? "var(--terracotta-deep)" : "var(--parchment)",
      border: `1px solid ${listening ? "var(--terracotta-deep)" : "var(--rule)"}`,
      borderRadius: 2, color: listening ? "#fff" : "var(--ink-mute)",
      fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.06em",
      cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const, flexShrink: 0,
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      {listening ? "Recording…" : "Voice"}
    </button>
  );
}

function VoiceField({ label, value, onChange, rows = 3, placeholder, optional }: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; optional?: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <FieldLabel optional={optional}>{label}</FieldLabel>
        <VoiceButton onTranscript={(t) => onChange(value ? `${value} ${t}` : t)} />
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={textareaSt} />
    </div>
  );
}

function NavButtons({ onBack, loading, label, disabled }: { onBack?: () => void; loading: boolean; label: string; disabled?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
      <button type="submit" disabled={loading || disabled} className="ca-btn ca-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, opacity: loading || disabled ? 0.5 : 1 }}>
        {loading ? "Saving…" : label}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} className="ca-btn ca-btn-ghost"
          style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13 }}>
          ← Back
        </button>
      )}
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 2, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700,
              background: s < step ? "var(--aegean-deep)" : s === step ? "var(--terracotta)" : "var(--linen-deep)",
              border: `1px solid ${s < step ? "var(--aegean-deep)" : s === step ? "var(--terracotta)" : "var(--rule)"}`,
              color: s <= step ? "oklch(0.97 0.01 50)" : "var(--ink-mute)", flexShrink: 0,
            }}>{s < step ? "✓" : s}</div>
            {i < TOTAL_STEPS - 1 && <div style={{ flex: 1, height: 1, background: s < step ? "var(--aegean-deep)" : "var(--rule)", margin: "0 3px" }} />}
          </div>
        ))}
      </div>
      <p className="ca-mono" style={{ marginTop: 10, fontSize: 10.5, color: "var(--terracotta-deep)", letterSpacing: "0.10em" }}>
        Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
      </p>
    </div>
  );
}

// ── File upload zone ──────────────────────────────────────────────────────────

function FileUploadZone({ token, category, label, hint, accept }: {
  token: string; category: string; label: string; hint: string; accept: string;
}) {
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      const res = await fetch(`${BACKEND}/api/v1/athlete/files`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.detail ?? "Upload failed"); }
      setFiles((p) => [...p, { name: file.name, size: file.size }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) upload(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0]; if (f) upload(f);
  }

  return (
    <div>
      <FieldLabel optional>{label}</FieldLabel>
      <div
        onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        style={{
          border: "1.5px dashed var(--rule)", borderRadius: 2, padding: "1.25rem",
          textAlign: "center", cursor: uploading ? "not-allowed" : "pointer",
          background: "var(--linen)", transition: "border-color 140ms",
        }}
      >
        <input ref={inputRef} type="file" accept={accept} onChange={onChange} style={{ display: "none" }} />
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: 0 }}>
          {uploading ? "Uploading…" : "Drag & drop or click to upload"}
        </p>
        <p style={{ fontSize: 11, color: "var(--rule)", margin: "4px 0 0", fontFamily: "var(--mono)" }}>{hint}</p>
      </div>
      {error && <p style={{ fontSize: 11, color: "var(--terracotta-deep)", marginTop: 4 }}>{error}</p>}
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: "var(--aegean-wash)", borderRadius: 2, fontSize: 11 }}>
              <span style={{ color: "var(--aegean-deep)" }}>✓</span>
              <span style={{ color: "var(--ink)", flex: 1 }}>{f.name}</span>
              <span style={{ color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 0: Athlete type fork ─────────────────────────────────────────────────

function StepTypeFork({ coachName, onSelect }: { coachName: string; onSelect: (type: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const options = [
    {
      key: "new_fresh",
      title: "I'm new to coaching (or new to this coach)",
      desc: "I haven't worked with a coach before, or I'm starting fresh with a new coach.",
    },
    {
      key: "new_existing_relationship",
      title: `I've been working with ${coachName || "my coach"} already`,
      desc: "We have an existing coaching relationship — I'm just joining the app for the first time.",
    },
    {
      key: "returning",
      title: "I already have a profile here",
      desc: "I'm returning for a new season and want to update my information.",
    },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try { await onSelect(selected); } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1rem" }}>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 0.5rem", lineHeight: 1.6 }}>
        This helps us tailor your intake form to your situation.
      </p>
      {options.map((o) => (
        <button
          key={o.key} type="button"
          onClick={() => setSelected(o.key)}
          style={{
            textAlign: "left", padding: "14px 16px", borderRadius: 2, cursor: "pointer",
            border: `1.5px solid ${selected === o.key ? "var(--aegean-deep)" : "var(--rule)"}`,
            background: selected === o.key ? "var(--aegean-wash)" : "var(--parchment)",
            transition: "all 140ms",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: selected === o.key ? "var(--aegean-deep)" : "var(--ink)" }}>{o.title}</p>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>{o.desc}</p>
        </button>
      ))}
      <button type="submit" disabled={!selected || loading} className="ca-btn ca-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, marginTop: 4, opacity: !selected || loading ? 0.5 : 1 }}>
        {loading ? "Saving…" : "Continue →"}
      </button>
    </form>
  );
}

// ── Step 1: About you ─────────────────────────────────────────────────────────

function StepAboutYou({ athleteType, coachName, onNext, onBack }: {
  athleteType: string; coachName: string; onNext: (d: object) => Promise<void>; onBack: () => void;
}) {
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState("");
  const [howFound, setHowFound] = useState("");
  const [relationshipDuration, setRelationshipDuration] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExisting = athleteType === "new_existing_relationship";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await onNext({
        date_of_birth: dob || null, gender: gender || null,
        occupation: occupation || null,
        how_found_coach: !isExisting ? (howFound || null) : null,
        coach_relationship_duration: isExisting ? (relationshipDuration || null) : null,
      });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.125rem" }}>
      {isExisting && (
        <div style={{ padding: "10px 14px", background: "var(--aegean-wash)", border: "1px solid var(--aegean-soft)", borderRadius: 2, fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}>
          You&apos;ve been working with {coachName || "your coach"} — let&apos;s document everything your coach already knows about you so the AI has full context.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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
      </div>
      <div>
        <FieldLabel optional>Occupation</FieldLabel>
        <input type="text" value={occupation} onChange={(e) => setOccupation(e.target.value)}
          placeholder="e.g. Software engineer, teacher, freelancer" style={inputSt} />
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-mute)" }}>Helps your coach understand your schedule and energy levels.</p>
      </div>
      {isExisting ? (
        <div>
          <FieldLabel optional>How long have you been working with {coachName || "your coach"}?</FieldLabel>
          <input type="text" value={relationshipDuration} onChange={(e) => setRelationshipDuration(e.target.value)}
            placeholder="e.g. 2 years, 6 months, since last January" style={inputSt} />
        </div>
      ) : (
        <div>
          <FieldLabel optional>How did you find your coach?</FieldLabel>
          <input type="text" value={howFound} onChange={(e) => setHowFound(e.target.value)}
            placeholder="e.g. Word of mouth, Instagram, Strava, triathlon club" style={inputSt} />
        </div>
      )}
      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
    </form>
  );
}

// ── Step 2: Athletic background ───────────────────────────────────────────────

function StepAthleticBackground({ athleteType, onNext, onBack }: {
  athleteType: string; onNext: (d: object) => Promise<void>; onBack: () => void;
}) {
  const [primarySport, setPrimarySport] = useState("");
  const [secondary, setSecondary] = useState<string[]>([]);
  const [fitnessLevel, setFitnessLevel] = useState("");
  const [years, setYears] = useState("");
  const [previousCoaches, setPreviousCoaches] = useState("");
  const [competitiveHistory, setCompetitiveHistory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExisting = athleteType === "new_existing_relationship";

  function toggleSecondary(s: string) {
    setSecondary((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!primarySport) { setError("Please select your primary sport."); return; }
    if (!fitnessLevel) { setError("Please select your current fitness level."); return; }
    setLoading(true); setError(null);
    try {
      await onNext({
        primary_sport: primarySport.toLowerCase(),
        secondary_sports: secondary.map((s) => s.toLowerCase()),
        fitness_level: fitnessLevel.toLowerCase(),
        years_training: years ? parseInt(years) : null,
        previous_coaches: previousCoaches || null,
        competitive_history: competitiveHistory || null,
      });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <FieldLabel>Primary sport</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {SPORTS.map((s) => <ToggleChip key={s} label={s} active={primarySport === s} onClick={() => setPrimarySport(s)} />)}
        </div>
      </div>
      <div>
        <FieldLabel optional>Other sports you train</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {SPORTS.filter((s) => s !== primarySport).map((s) => <ToggleChip key={s} label={s} active={secondary.includes(s)} onClick={() => toggleSecondary(s)} small />)}
        </div>
      </div>
      <div>
        <FieldLabel>Current fitness level</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {FITNESS_LEVELS.map((l) => <ToggleChip key={l} label={l} active={fitnessLevel === l} onClick={() => setFitnessLevel(l)} />)}
        </div>
      </div>
      <div>
        <FieldLabel optional>Years training in your primary sport</FieldLabel>
        <input type="number" min="0" max="50" value={years} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 4" style={{ ...inputSt, maxWidth: 140 }} />
      </div>
      <div>
        <FieldLabel optional>Previous coaches</FieldLabel>
        <input type="text" value={previousCoaches} onChange={(e) => setPreviousCoaches(e.target.value)}
          placeholder={isExisting ? `Before ${""} — e.g. self-coached, John Smith` : "e.g. Self-coached, had a running coach in 2023"} style={inputSt} />
      </div>
      <VoiceField
        label={isExisting ? "Your competitive history & key accomplishments" : "Competitive history & race experience"}
        optional value={competitiveHistory} onChange={setCompetitiveHistory} rows={4}
        placeholder="e.g. Completed 3 half marathons, best time 1:52. First triathlon 2022 (Olympic distance). DNF at 70.3 Miami in 2024 due to cramp."
      />
      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
    </form>
  );
}

// ── Step 3: Training baseline ─────────────────────────────────────────────────

function StepTrainingBaseline({ token, onNext, onBack }: {
  token: string; onNext: (d: object) => Promise<void>; onBack: () => void;
}) {
  const [hours, setHours] = useState("");
  const [typicalWeek, setTypicalWeek] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await onNext({
        current_weekly_hours: hours ? parseFloat(hours) : null,
        typical_week_description: typicalWeek || null,
      });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <FieldLabel optional>Current weekly training hours</FieldLabel>
        <input type="number" min="0" max="40" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
          placeholder="e.g. 10" style={{ ...inputSt, maxWidth: 160 }} />
      </div>
      <VoiceField
        label="Describe a typical training week" optional value={typicalWeek} onChange={setTypicalWeek} rows={5}
        placeholder="e.g. Monday: rest. Tuesday: 45 min run (easy). Wednesday: 1 hr bike on trainer + 20 min run brick. Thursday: swim 2500m. Friday: rest. Saturday: long ride 2-3 hrs. Sunday: long run 1-1.5 hrs."
      />
      <FileUploadZone
        token={token} category="training_plan"
        label="Upload past training plans or schedules"
        hint="PDF, image, CSV, .fit, screenshots of your schedule — anything works"
        accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,.fit,.gpx,image/*"
      />
      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
    </form>
  );
}

// ── Step 4: Goals & race calendar ─────────────────────────────────────────────

function StepGoals({ onNext, onBack }: { onNext: (d: object) => Promise<void>; onBack: () => void }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventDistance, setEventDistance] = useState("");
  const [goal, setGoal] = useState("");
  const [success, setSuccess] = useState("");
  const [bests, setBests] = useState("");
  const [motivation, setMotivation] = useState("");
  const [hasSecondary, setHasSecondary] = useState(false);
  const [sec, setSec] = useState({ name: "", date: "", distance: "", priority: "B" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim()) { setError("Please describe your main goal."); return; }
    setLoading(true); setError(null);
    try {
      await onNext({
        target_event_name: eventName || null, target_event_date: eventDate || null,
        target_event_distance: eventDistance || null,
        goal_description: goal, success_definition: success || null,
        previous_bests: bests || null, race_motivation: motivation || null,
        secondary_events: hasSecondary && sec.name ? [{ name: sec.name, date: sec.date || null, distance: sec.distance || null, priority: sec.priority }] : [],
      });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ padding: "10px 14px", background: "var(--linen-deep)", borderRadius: 2, fontSize: 12, color: "var(--ink-soft)" }}>
        Your A-priority race — the main event you&apos;re training toward.
      </div>
      <div>
        <FieldLabel optional>Target event name</FieldLabel>
        <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. 70.3 Eagleman, Boston Marathon" style={inputSt} />
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
      <VoiceField label="Your main goal" value={goal} onChange={setGoal} rows={3}
        placeholder="e.g. Finish 70.3 Eagleman under 6 hours feeling strong, not just survive it." />
      <VoiceField label="Why does this goal matter to you?" optional value={motivation} onChange={setMotivation} rows={2}
        placeholder="e.g. Proving to myself I can complete a long-distance race after my injury in 2023." />
      <VoiceField label="How will you know you succeeded?" optional value={success} onChange={setSuccess} rows={2}
        placeholder="e.g. Cross the finish line with something left in the tank." />
      <VoiceField label="Personal bests / past race times" optional value={bests} onChange={setBests} rows={2}
        placeholder="e.g. 5K: 22:30, Olympic Tri: 2:48, 70.3: 5:45" />

      <div>
        <button type="button" onClick={() => setHasSecondary(!hasSecondary)} style={{
          fontSize: 12, fontFamily: "var(--body)", color: "var(--aegean-deep)", background: "none",
          border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
        }}>
          {hasSecondary ? "− Remove secondary race" : "+ Add a secondary / B-priority race"}
        </button>
        {hasSecondary && (
          <div style={{ marginTop: 10, padding: "12px 14px", border: "1px solid var(--rule)", borderRadius: 2, display: "grid", gap: "0.75rem" }}>
            <input type="text" value={sec.name} onChange={(e) => setSec({ ...sec, name: e.target.value })} placeholder="Event name" style={inputSt} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "0.5rem" }}>
              <input type="date" value={sec.date} onChange={(e) => setSec({ ...sec, date: e.target.value })} style={inputSt} />
              <select value={sec.distance} onChange={(e) => setSec({ ...sec, distance: e.target.value })} style={selectSt}>
                <option value="">Distance…</option>
                {DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={sec.priority} onChange={(e) => setSec({ ...sec, priority: e.target.value })} style={selectSt}>
                <option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
    </form>
  );
}

// ── Step 5: Health & body ─────────────────────────────────────────────────────

function StepHealth({ onNext, onBack }: { onNext: (d: object) => Promise<void>; onBack: () => void }) {
  const [injuries, setInjuries] = useState("");
  const [medical, setMedical] = useState("");
  const [medications, setMedications] = useState("");
  const [limiters, setLimiters] = useState("");
  const [sleep, setSleep] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await onNext({
        injury_history: injuries || null, medical_notes: medical || null,
        medications: medications || null, current_limiters: limiters || null,
        sleep_hours: sleep ? parseFloat(sleep) : null,
        resting_hr: restingHr ? parseInt(restingHr) : null,
      });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.125rem" }}>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
        Share only what you&apos;re comfortable with. All fields are optional. This helps your coach and AI give you safer, smarter training recommendations.
      </p>
      <VoiceField label="Injury history" optional value={injuries} onChange={setInjuries} rows={3}
        placeholder="e.g. Right IT band issues above 15K. Stress fracture (right tibia) 2023, fully healed. Left shoulder impingement — affects swimming." />
      <VoiceField label="Current performance limiters" optional value={limiters} onChange={setLimiters} rows={2}
        placeholder="e.g. Open water swimming technique, limited morning availability, poor threshold run pace." />
      <VoiceField label="Medical conditions" optional value={medical} onChange={setMedical} rows={2}
        placeholder="e.g. Exercise-induced asthma — inhaler before hard sessions. Hypothyroid (medicated)." />
      <VoiceField label="Medications or supplements" optional value={medications} onChange={setMedications} rows={2}
        placeholder="e.g. Levothyroxine 50mcg daily. Vitamin D. Iron supplementation." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <FieldLabel optional>Average sleep (hours/night)</FieldLabel>
          <input type="number" min="3" max="12" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)}
            placeholder="e.g. 7.5" style={inputSt} />
        </div>
        <div>
          <FieldLabel optional>Resting heart rate (bpm)</FieldLabel>
          <input type="number" min="30" max="120" value={restingHr} onChange={(e) => setRestingHr(e.target.value)}
            placeholder="e.g. 48" style={inputSt} />
        </div>
      </div>
      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
    </form>
  );
}

// ── Step 6: Lifestyle & availability ─────────────────────────────────────────

function StepLifestyle({ onNext, onBack }: { onNext: (d: object) => Promise<void>; onBack: () => void }) {
  const [days, setDays] = useState<string[]>([]);
  const [preferredTime, setPreferredTime] = useState("");
  const [travelFreq, setTravelFreq] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [constraints, setConstraints] = useState("");
  const [commPref, setCommPref] = useState("");
  const [expectations, setExpectations] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(key: string) { setDays((p) => p.includes(key) ? p.filter((x) => x !== key) : [...p, key]); }
  function toggleEquip(e: string) { setEquipment((p) => p.includes(e) ? p.filter((x) => x !== e) : [...p, e]); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await onNext({
        training_availability: { days, preferred_time: preferredTime || null, travel_frequency: travelFreq || null, constraints: constraints || null },
        equipment_access: equipment,
        communication_preference: commPref || null,
        coaching_expectations: expectations || null,
      });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <FieldLabel optional>Available training days</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {DAYS_OF_WEEK.map((d, i) => <ToggleChip key={d} label={d} active={days.includes(DAY_KEYS[i])} onClick={() => toggleDay(DAY_KEYS[i])} small />)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <FieldLabel optional>Preferred training time</FieldLabel>
          <select value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} style={selectSt}>
            <option value="">Select…</option>
            <option value="early_morning">Early morning (5–7am)</option>
            <option value="morning">Morning (7–10am)</option>
            <option value="midday">Midday</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
            <option value="varies">Varies / flexible</option>
          </select>
        </div>
        <div>
          <FieldLabel optional>Travel frequency</FieldLabel>
          <select value={travelFreq} onChange={(e) => setTravelFreq(e.target.value)} style={selectSt}>
            <option value="">Select…</option>
            <option value="rarely">Rarely travel</option>
            <option value="occasionally">Occasionally (1–2×/month)</option>
            <option value="frequently">Frequently (weekly)</option>
          </select>
        </div>
      </div>
      <div>
        <FieldLabel optional>Equipment & facilities you have access to</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {EQUIPMENT_OPTIONS.map((eq) => <ToggleChip key={eq} label={eq} active={equipment.includes(eq)} onClick={() => toggleEquip(eq)} small />)}
        </div>
      </div>
      <VoiceField label="Training constraints" optional value={constraints} onChange={setConstraints} rows={2}
        placeholder="e.g. Can't train Tuesday evenings (family). Work travel every other week. Pool only open 6–8am." />
      <div>
        <FieldLabel optional>Preferred way to communicate with your coach</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {["WhatsApp", "Email", "Weekly check-in call", "In-app messages"].map((c) => (
            <ToggleChip key={c} label={c} active={commPref === c} onClick={() => setCommPref(commPref === c ? "" : c)} small />
          ))}
        </div>
      </div>
      <VoiceField label="What do you want most from this coaching relationship?" optional value={expectations} onChange={setExpectations} rows={3}
        placeholder="e.g. A structured plan I can actually follow given my schedule. Accountability. Help with pacing strategy. Honest feedback on my weaknesses." />
      {error && <ErrorBanner msg={error} />}
      <NavButtons onBack={onBack} loading={loading} label="Continue →" />
    </form>
  );
}

// ── Step 7: Documents + complete ─────────────────────────────────────────────

function StepDocuments({ token, onComplete, onBack }: {
  token: string; onComplete: () => Promise<void>; onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try { await onComplete(); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); setLoading(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "1.5rem" }}>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
        Upload anything that will help your coach and AI understand you better. Blood work, body composition scans, past race photos, training notes — anything goes.
      </p>
      <FileUploadZone token={token} category="medical" label="Medical records or blood work" hint="PDF or image" accept=".pdf,.png,.jpg,.jpeg,image/*" />
      <FileUploadZone token={token} category="race_results" label="Race results or finish photos" hint="PDF, image, or CSV export" accept=".pdf,.png,.jpg,.jpeg,.csv,image/*" />
      <FileUploadZone token={token} category="general" label="Anything else" hint="Wearable exports, training notes, body comp scans, etc." accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.fit,.gpx,image/*" />
      {error && <ErrorBanner msg={error} />}
      <div style={{ padding: "10px 14px", background: "var(--aegean-wash)", border: "1px solid var(--aegean-soft)", borderRadius: 2, fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}>
        ⚡ After you click below, we&apos;ll generate your AI athlete profile. This takes about 10 seconds.
      </div>
      <NavButtons onBack={onBack} loading={loading} label="Generate my profile →" />
    </form>
  );
}

// ── Step 8: Done ──────────────────────────────────────────────────────────────

function StepDone({ athleteName, aiProfile }: { athleteName: string; aiProfile: string }) {
  const router = useRouter();
  const firstName = athleteName.split(" ")[0] || "Athlete";
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 52, margin: "0 0 16px" }}>🎉</p>
      <h2 className="ca-display" style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 8px" }}>
        You&apos;re all set, {firstName}!
      </h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 24px" }}>
        Your AI training profile has been generated. Your coach now has full context to personalise your plan.
      </p>
      <div style={{ padding: "1rem 1.25rem", background: "var(--aegean-wash)", border: "1px solid var(--aegean-soft)", borderLeft: "3px solid var(--aegean-deep)", borderRadius: 2, textAlign: "left", marginBottom: "1.75rem" }}>
        <p className="ca-eyebrow ca-eyebrow-aegean" style={{ fontSize: 9.5, marginBottom: 8 }}>⚡ Your AI profile</p>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.7, margin: 0 }}>{aiProfile}</p>
      </div>
      <button onClick={() => router.push("/athlete/dashboard")} className="ca-btn ca-btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14 }}>
        Go to my dashboard →
      </button>
    </div>
  );
}

function GeneratingScreen() {
  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div className="ca-avatar" style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 16px" }}><span>⚡</span></div>
        <h2 className="ca-display" style={{ fontSize: 20, color: "var(--ink)", margin: "0 0 8px" }}>Generating your AI profile…</h2>
        <p className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>This takes about 10 seconds</p>
      </div>
    </div>
  );
}

// ── Page orchestrator ─────────────────────────────────────────────────────────

function OnboardingInner() {
  const router = useRouter();
  // step 0 = type fork, 1–7 = intake steps, 8 = done
  const [step, setStep] = useState(0);
  const [athleteType, setAthleteType] = useState("new_fresh");
  const [coachName, setCoachName] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [aiProfile, setAiProfile] = useState("");
  const [token, setToken] = useState("");
  const [completing, setCompleting] = useState(false);

  async function getToken(): Promise<string> {
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.refreshSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Session expired. Please sign in again.");
    return t;
  }

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        setToken(t);
        const [statusRes, userRes] = await Promise.all([
          fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, { headers: { Authorization: `Bearer ${t}` } }),
          createBrowserSupabase().auth.getUser(),
        ]);
        const status = await statusRes.json();
        if (status.onboarding_complete) { router.replace("/athlete/dashboard"); return; }
        setAthleteName(userRes.data.user?.user_metadata?.full_name ?? userRes.data.user?.email ?? "");
        if (status.athlete_type) setAthleteType(status.athlete_type);
      } catch { /* non-fatal */ }
    })();
  }, [router]);

  async function post(endpoint: string, body: object) {
    const t = await getToken();
    setToken(t);
    const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.detail ?? "Failed to save. Please try again."); }
    return res.json();
  }

  async function handleType(type: string) {
    await post("type", { athlete_type: type });
    if (type === "returning") { router.push("/athlete/profile-update"); return; }
    setAthleteType(type);
    setStep(1);
  }

  async function handleStep(n: number, endpoint: string, data: object) {
    await post(endpoint, data);
    setStep(n + 1);
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const t = await getToken();
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/complete`, {
        method: "POST", headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error("Profile generation failed");
      const result = await res.json();
      setAiProfile(result.ai_profile_summary ?? "");
      const { data } = await createBrowserSupabase().auth.getUser();
      setAthleteName(data.user?.user_metadata?.full_name ?? data.user?.email ?? "");
      setStep(8);
    } catch {
      setAiProfile("Your profile has been saved. Your coach will review it shortly.");
      setStep(8);
    } finally { setCompleting(false); }
  }

  if (completing) return <GeneratingScreen />;

  const isExisting = athleteType === "new_existing_relationship";

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <style>{`select option { background: var(--parchment); color: var(--ink); }`}</style>
      <div className="ca-panel" style={{ width: "100%", maxWidth: step === 8 ? 480 : 560, padding: "2.5rem 2rem" }}>
        {step < 8 && (
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div className="ca-avatar" style={{ width: 44, height: 44, fontSize: 18, margin: "0 auto 14px" }}><span>C</span></div>
            <h1 className="ca-display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 4px" }}>
              {step === 0 ? "Welcome — let's get you set up" : isExisting ? "Document your athlete profile" : "Set up your athlete profile"}
            </h1>
            {step === 0 && <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: 0 }}>3 minutes to a smarter coaching relationship.</p>}
          </div>
        )}

        {step >= 1 && step <= 7 && <ProgressBar step={step} />}

        {step === 0 && <StepTypeFork coachName={coachName} onSelect={handleType} />}
        {step === 1 && <StepAboutYou athleteType={athleteType} coachName={coachName} onNext={(d) => handleStep(1, "background", d)} onBack={() => setStep(0)} />}
        {step === 2 && <StepAthleticBackground athleteType={athleteType} onNext={(d) => handleStep(2, "background", d)} onBack={() => setStep(1)} />}
        {step === 3 && <StepTrainingBaseline token={token} onNext={(d) => handleStep(3, "training", d)} onBack={() => setStep(2)} />}
        {step === 4 && <StepGoals onNext={(d) => handleStep(4, "goals", d)} onBack={() => setStep(3)} />}
        {step === 5 && <StepHealth onNext={(d) => handleStep(5, "health", d)} onBack={() => setStep(4)} />}
        {step === 6 && <StepLifestyle onNext={(d) => handleStep(6, "lifestyle", d)} onBack={() => setStep(5)} />}
        {step === 7 && <StepDocuments token={token} onComplete={handleComplete} onBack={() => setStep(6)} />}
        {step === 8 && <StepDone athleteName={athleteName} aiProfile={aiProfile} />}
      </div>
    </div>
  );
}

export default function AthleteOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading…</p>
      </div>
    }>
      <OnboardingInner />
    </Suspense>
  );
}
