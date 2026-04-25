"use client";

/**
 * COA-79: Coach onboarding — AI profile setup wizard.
 *
 * 5 steps:
 *   1. Welcome         — intro + value prop
 *   2. Background      — coach's free-text philosophy + sport
 *   3. AI Preview      — playbook + persona prompt generated live
 *   4. Refine          — coach edits the persona_system_prompt
 *   5. Confirmed       — persisted, redirect to dashboard
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Playbook {
  playbook_name?: string;
  source_summary?: string;
  confidence?: number;
  joe_friel_methodology?: {
    principles?: string[];
    execution_rules?: string[];
    periodization?: { phase: string; purpose?: string }[];
  };
  recommended_next_steps?: string[];
  follow_up_questions?: string[];
}

interface GenerateResult {
  playbook: Playbook;
  persona_system_prompt: string;
  confidence: number;
  status: string;
  warnings: string[];
}

// ─── Progress Dots ────────────────────────────────────────────────────────────

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === step - 1 ? 28 : 8,
            height: 8,
            borderRadius: 4,
            background: i < step ? "var(--terracotta-deep)" : i === step - 1 ? "var(--terracotta)" : "var(--rule)",
            transition: "all 300ms ease",
          }}
        />
      ))}
    </div>
  );
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <div style={{ marginBottom: 24 }}>
        <svg width="52" height="52" viewBox="0 0 52 52" style={{ margin: "0 auto 16px auto", display: "block" }}>
          <rect x="3" y="3" width="46" height="46" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
          <g fill="var(--terracotta)" opacity="0.85">
            <rect x="8" y="8" width="8" height="8" /><rect x="26" y="8" width="8" height="8" />
            <rect x="18" y="18" width="8" height="8" /><rect x="36" y="18" width="8" height="8" />
            <rect x="8" y="28" width="8" height="8" /><rect x="26" y="28" width="8" height="8" />
          </g>
          <g fill="var(--aegean-deep)" opacity="0.9">
            <rect x="18" y="8" width="8" height="8" /><rect x="36" y="8" width="8" height="8" />
            <rect x="8" y="18" width="8" height="8" /><rect x="26" y="18" width="8" height="8" />
            <rect x="18" y="28" width="8" height="8" /><rect x="36" y="28" width="8" height="8" />
          </g>
        </svg>
        <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 10 }}>Coach setup · 5 minutes</div>
        <h1 className="ca-display" style={{ fontSize: 38, margin: "0 0 12px 0", letterSpacing: "-0.015em" }}>
          Let&apos;s build your AI voice.
        </h1>
        <p style={{ fontSize: 16, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>
          Your athletes shouldn&apos;t hear an AI. They should hear you. We&apos;ll take a few minutes to learn
          how you coach, then build a persona that responds in your voice, with your methodology.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, margin: "28px 0" }}>
        {[
          { icon: "✍️", label: "Describe your philosophy in your own words" },
          { icon: "🤖", label: "AI extracts your methodology playbook" },
          { icon: "✅", label: "You review and confirm before anything is saved" },
        ].map((item) => (
          <div key={item.label} style={{ padding: "16px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--serif)", lineHeight: 1.4 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <button className="ca-btn ca-btn-terra" onClick={onNext} style={{ width: "100%", padding: "14px 0", fontSize: 15 }}>
        Begin →
      </button>
    </div>
  );
}

// ─── Step 2: Coach Background ─────────────────────────────────────────────────

function StepBackground({
  description,
  setDescription,
  sport,
  setSport,
  onNext,
  onBack,
  loading,
  error,
}: {
  description: string;
  setDescription: (v: string) => void;
  sport: string;
  setSport: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const minLen = 80;
  const charCount = description.trim().length;
  const ready = charCount >= minLen;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>Step 2 of 5</div>
      <h2 className="ca-display" style={{ fontSize: 30, margin: "0 0 8px 0" }}>How do you coach?</h2>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic", margin: "0 0 24px 0", lineHeight: 1.5 }}>
        Write as if you&apos;re explaining your approach to a new assistant coach. Include your philosophy,
        how you structure training, what you prioritize for athletes, and what you&apos;d never do.
        The more you write, the more accurate the AI voice.
      </p>

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8 }}>
          Your coaching philosophy
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={
            "Example: I coach age-group triathletes focusing on Ironman 70.3 events. My approach is polarized — 80% of sessions are low intensity zone 2, with two quality sessions per week. I never skip recovery weeks. I believe athletes overtrain more often than they underdo it. For cycling I prioritize threshold work and FTP testing every 6 weeks. For running I use Jack Daniels pacing tables. Swim is technique-first for anyone under 50 minutes per 1500m..."
          }
          rows={10}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "var(--parchment)",
            border: `1px solid ${ready ? "var(--aegean-deep)" : "var(--rule)"}`,
            borderRadius: 2,
            fontFamily: "var(--body)",
            fontSize: 14,
            color: "var(--ink)",
            outline: "none",
            resize: "vertical",
            lineHeight: 1.6,
            boxSizing: "border-box",
            transition: "border-color 200ms ease",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: ready ? "var(--aegean-deep)" : "var(--ink-mute)", fontFamily: "var(--mono)" }}>
            {ready ? "✓ Enough to generate a profile" : `${minLen - charCount} more characters needed`}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--mono)" }}>{charCount}</span>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8 }}>
          Primary sport (optional)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {["Triathlon", "Running", "Cycling", "Swimming", "Other"].map(s => (
            <button
              key={s}
              onClick={() => setSport(sport === s ? "" : s)}
              style={{
                padding: "8px 14px",
                border: `1px solid ${sport === s ? "var(--terracotta-deep)" : "var(--rule)"}`,
                background: sport === s ? "var(--terracotta-soft)" : "transparent",
                color: sport === s ? "var(--terracotta-deep)" : "var(--ink-soft)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.06em",
                borderRadius: 2,
                cursor: "pointer",
                transition: "all 160ms ease",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button className="ca-btn ca-btn-ghost" onClick={onBack} disabled={loading}>← Back</button>
        <button
          className="ca-btn ca-btn-terra"
          onClick={onNext}
          disabled={!ready || loading}
          style={{ flex: 1, opacity: !ready || loading ? 0.6 : 1 }}
        >
          {loading ? "Generating your profile…" : "Generate AI profile →"}
        </button>
      </div>
      {loading && (
        <p style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic" }}>
          The AI is reading your philosophy and extracting your methodology. This takes 10–20 seconds.
        </p>
      )}
    </div>
  );
}

// ─── Step 3: AI Preview ────────────────────────────────────────────────────────

function StepPreview({
  result,
  onNext,
  onBack,
}: {
  result: GenerateResult;
  onNext: () => void;
  onBack: () => void;
}) {
  const { playbook } = result;
  const principles = playbook.joe_friel_methodology?.principles ?? [];
  const executionRules = playbook.joe_friel_methodology?.execution_rules ?? [];
  const phases = playbook.joe_friel_methodology?.periodization ?? [];
  const confidence = Math.round((result.confidence ?? 0) * 100);
  const confidenceColor = confidence >= 70 ? "var(--aegean-deep)" : confidence >= 40 ? "oklch(0.50 0.09 75)" : "var(--terracotta-deep)";

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>Step 3 of 5</div>
      <h2 className="ca-display" style={{ fontSize: 30, margin: "0 0 8px 0" }}>Your methodology, extracted.</h2>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic", margin: "0 0 24px 0" }}>
        Review what the AI found in your description. If something looks wrong, go back and add more detail.
        In the next step, you&apos;ll edit the exact prompt the AI will use to respond to your athletes.
      </p>

      {/* Confidence indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div className="ca-eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Extraction confidence</div>
          <div style={{ height: 6, background: "var(--rule)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${confidence}%`, background: confidenceColor, borderRadius: 3, transition: "width 600ms ease" }} />
          </div>
        </div>
        <div className="ca-num" style={{ fontSize: 22, color: confidenceColor, fontFamily: "var(--serif)", flexShrink: 0 }}>{confidence}%</div>
        {confidence < 50 && (
          <div style={{ fontSize: 11, color: "var(--terracotta-deep)", maxWidth: 160 }}>
            Low confidence — go back and add more detail for a better result.
          </div>
        )}
      </div>

      {result.warnings.length > 0 && (
        <div style={{ padding: "10px 14px", background: "oklch(0.97 0.04 75)", border: "1px solid oklch(0.88 0.08 75)", borderRadius: 2, marginBottom: 16 }}>
          {result.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: "oklch(0.40 0.08 70)" }}>{w}</div>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* Principles */}
        <div className="ca-panel" style={{ padding: 18 }}>
          <div className="ca-eyebrow ca-eyebrow-aegean" style={{ marginBottom: 10 }}>Principles extracted</div>
          {principles.length > 0 ? (
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              {principles.slice(0, 5).map((p, i) => (
                <li key={i} style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>{p}</li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-mute)", fontStyle: "italic" }}>No principles extracted — add more detail to your description.</div>
          )}
        </div>

        {/* Execution rules */}
        <div className="ca-panel" style={{ padding: 18 }}>
          <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 10 }}>How you operate</div>
          {executionRules.length > 0 ? (
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              {executionRules.slice(0, 5).map((r, i) => (
                <li key={i} style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>{r}</li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-mute)", fontStyle: "italic" }}>No execution rules found.</div>
          )}
        </div>
      </div>

      {/* Periodization phases */}
      {phases.length > 0 && (
        <div className="ca-panel" style={{ padding: 18, marginBottom: 20 }}>
          <div className="ca-eyebrow" style={{ marginBottom: 10 }}>Training phases identified</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {phases.map((phase, i) => (
              <div key={i} style={{ padding: "8px 12px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{phase.phase}</div>
                {phase.purpose && <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 2 }}>{phase.purpose}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button className="ca-btn ca-btn-ghost" onClick={onBack}>← Back — add more detail</button>
        <button className="ca-btn ca-btn-terra" onClick={onNext} style={{ flex: 1 }}>
          Looks good — tune my AI voice →
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Refine persona prompt ────────────────────────────────────────────

function StepRefine({
  personaPrompt,
  setPersonaPrompt,
  onNext,
  onBack,
  saving,
  error,
}: {
  personaPrompt: string;
  setPersonaPrompt: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="ca-eyebrow ca-eyebrow-terra" style={{ marginBottom: 8 }}>Step 4 of 5</div>
      <h2 className="ca-display" style={{ fontSize: 30, margin: "0 0 8px 0" }}>Tune your AI voice.</h2>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic", margin: "0 0 20px 0", lineHeight: 1.5 }}>
        This is the exact prompt the AI will use every time it responds to your athletes. It was generated
        from your description — edit it freely. Your athletes will only ever hear this voice.
      </p>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8 }}>
          AI persona prompt
        </label>
        <textarea
          value={personaPrompt}
          onChange={e => setPersonaPrompt(e.target.value)}
          rows={10}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "var(--parchment)",
            border: "1px solid var(--aegean-deep)",
            borderRadius: 2,
            fontFamily: "var(--body)",
            fontSize: 13.5,
            color: "var(--ink)",
            outline: "none",
            resize: "vertical",
            lineHeight: 1.65,
            boxSizing: "border-box",
          }}
        />
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic", margin: "0 0 20px 0" }}>
        Tip: end with a sentence like &ldquo;Always remind athletes that the coach reviews every message before it&apos;s sent.&rdquo;
        to set the right expectation for your athletes.
      </p>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--terracotta-soft)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, color: "var(--terracotta-deep)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button className="ca-btn ca-btn-ghost" onClick={onBack} disabled={saving}>← Back</button>
        <button
          className="ca-btn ca-btn-terra"
          onClick={onNext}
          disabled={!personaPrompt.trim() || saving}
          style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save and finish →"}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Confirmed ────────────────────────────────────────────────────────

function StepConfirmed({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <div className="ca-eyebrow ca-eyebrow-aegean" style={{ marginBottom: 10 }}>Setup complete</div>
      <h2 className="ca-display" style={{ fontSize: 34, margin: "0 0 14px 0" }}>Your AI is ready.</h2>
      <p style={{ fontSize: 15, color: "var(--ink-soft)", fontFamily: "var(--serif)", fontStyle: "italic", lineHeight: 1.6, margin: "0 0 28px 0" }}>
        Every reply your AI sends will carry your voice, your methodology, and your philosophy.
        Athletes hear you — not a chatbot. You can update this any time from your profile settings.
      </p>
      <button className="ca-btn ca-btn-terra" onClick={onGoToDashboard} style={{ padding: "14px 32px", fontSize: 15 }}>
        Go to my dashboard →
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 2 state
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Step 3-4 state
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [personaPrompt, setPersonaPrompt] = useState("");

  // Step 4 → 5 state
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const getToken = useCallback(async (): Promise<string> => {
    const supabase = createBrowserSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  async function handleGenerate() {
    setGenerateLoading(true);
    setGenerateError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/coach/onboarding/generate-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description, sport: sport || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenerateError((data?.detail as string) ?? "Failed to generate profile. Please try again.");
        setGenerateLoading(false);
        return;
      }
      setResult(data as GenerateResult);
      setPersonaPrompt((data as GenerateResult).persona_system_prompt);
      setStep(3);
    } catch {
      setGenerateError("Network error — please check your connection and try again.");
    }
    setGenerateLoading(false);
  }

  async function handleConfirm() {
    if (!result) return;
    setSaveLoading(true);
    setSaveError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/coach/onboarding/confirm-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          playbook: result.playbook,
          persona_system_prompt: personaPrompt,
          source_description: description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError((data?.detail as string) ?? "Failed to save profile. Please try again.");
        setSaveLoading(false);
        return;
      }
      setStep(5);
    } catch {
      setSaveError("Network error — please try again.");
    }
    setSaveLoading(false);
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Wordmark */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
          <div className="ca-display" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
            Coach<span style={{ color: "var(--terracotta-deep)" }}>.</span>ai
          </div>
        </div>

        <ProgressDots step={step} total={5} />

        <div className="ca-panel" style={{ padding: "40px 44px" }}>
          {step === 1 && <StepWelcome onNext={() => setStep(2)} />}

          {step === 2 && (
            <StepBackground
              description={description}
              setDescription={setDescription}
              sport={sport}
              setSport={setSport}
              onNext={handleGenerate}
              onBack={() => setStep(1)}
              loading={generateLoading}
              error={generateError}
            />
          )}

          {step === 3 && result && (
            <StepPreview
              result={result}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <StepRefine
              personaPrompt={personaPrompt}
              setPersonaPrompt={setPersonaPrompt}
              onNext={handleConfirm}
              onBack={() => setStep(3)}
              saving={saveLoading}
              error={saveError}
            />
          )}

          {step === 5 && <StepConfirmed onGoToDashboard={() => router.push("/dashboard")} />}
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--serif)", fontStyle: "italic" }}>
          You can update your AI voice at any time from your profile settings.
        </p>
      </div>
    </div>
  );
}
