"use client";

/**
 * COA-109: Returning athlete profile refresh — 3-step compact flow.
 * Accessed via "Update my profile" button on /athlete/dashboard.
 */

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://coach-ai-production-a5aa.up.railway.app";
const DISTANCES = ["5K", "10K", "Half Marathon", "Marathon", "Sprint Triathlon", "Olympic Triathlon", "70.3 Half Ironman", "Full Ironman", "Gran Fondo", "Other"];

const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "var(--parchment)",
  border: "1px solid var(--rule)", borderRadius: 2, fontSize: 13,
  color: "var(--ink)", fontFamily: "var(--body)", outline: "none", boxSizing: "border-box",
};
const textareaSt: React.CSSProperties = { ...inputSt, resize: "vertical", lineHeight: 1.6 };
const selectSt: React.CSSProperties = { ...inputSt, appearance: "none", cursor: "pointer" };

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

function FileUploadZone({ token, category, label, hint, accept }: { token: string; category: string; label: string; hint: string; accept: string }) {
  const [files, setFiles] = useState<{ name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("category", category);
      const res = await fetch(`${BACKEND}/api/v1/athlete/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.detail ?? "Upload failed"); }
      setFiles((p) => [...p, { name: file.name }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  }

  return (
    <div>
      <FieldLabel optional>{label}</FieldLabel>
      <label style={{ display: "block", border: "1.5px dashed var(--rule)", borderRadius: 2, padding: "1rem", textAlign: "center", cursor: uploading ? "not-allowed" : "pointer", background: "var(--linen)" }}>
        <input type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} style={{ display: "none" }} />
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: 0 }}>{uploading ? "Uploading…" : "Click to upload"}</p>
        <p style={{ fontSize: 11, color: "var(--rule)", margin: "4px 0 0", fontFamily: "var(--mono)" }}>{hint}</p>
      </label>
      {error && <p style={{ fontSize: 11, color: "var(--terracotta-deep)", marginTop: 4 }}>{error}</p>}
      {files.map((f, i) => <p key={i} style={{ fontSize: 11, color: "var(--aegean-deep)", margin: "4px 0 0" }}>✓ {f.name}</p>)}
    </div>
  );
}

function ProfileUpdateInner() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiProfile, setAiProfile] = useState<string | null>(null);

  // Step 1: What's changed
  const [injuries, setInjuries] = useState("");
  const [limiters, setLimiters] = useState("");
  const [lifeChanges, setLifeChanges] = useState("");

  // Step 2: New goals
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventDistance, setEventDistance] = useState("");
  const [goalDesc, setGoalDesc] = useState("");
  const [motivation, setMotivation] = useState("");

  const [generating, setGenerating] = useState(false);

  async function getToken(): Promise<string> {
    if (token) return token;
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.refreshSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Session expired.");
    setToken(t);
    return t;
  }

  async function submitStep1(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const t = await getToken();
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ injury_history: injuries || null, current_limiters: limiters || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStep(2);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  async function submitStep2(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const t = await getToken();
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          target_event_name: eventName || null, target_event_date: eventDate || null,
          target_event_distance: eventDistance || null, goal_description: goalDesc || null,
          race_motivation: motivation || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStep(3);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  async function submitStep3(e: React.FormEvent) {
    e.preventDefault(); setGenerating(true); setError(null);
    try {
      const t = await getToken();
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: "{}",
      });
      if (!res.ok) throw new Error("Failed to regenerate profile");
      const data = await res.json();
      setAiProfile(data.ai_profile_summary ?? null);
      setStep(4);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setGenerating(false); }
  }

  if (generating) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="ca-avatar" style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 16px" }}><span>⚡</span></div>
          <h2 className="ca-display" style={{ fontSize: 20, color: "var(--ink)", margin: "0 0 8px" }}>Updating your AI profile…</h2>
          <p className="ca-mono" style={{ fontSize: 11, color: "var(--ink-mute)" }}>This takes about 10 seconds</p>
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div className="ca-panel" style={{ width: "100%", maxWidth: 480, padding: "2.5rem 2rem", textAlign: "center" }}>
          <p style={{ fontSize: 40, margin: "0 0 16px" }}>✓</p>
          <h2 className="ca-display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 8px" }}>Profile updated</h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 20px" }}>Your AI profile has been refreshed with your new information.</p>
          {aiProfile && (
            <div style={{ padding: "1rem 1.25rem", background: "var(--aegean-wash)", border: "1px solid var(--aegean-soft)", borderLeft: "3px solid var(--aegean-deep)", borderRadius: 2, textAlign: "left", marginBottom: "1.5rem" }}>
              <p className="ca-eyebrow ca-eyebrow-aegean" style={{ fontSize: 9.5, marginBottom: 8 }}>⚡ Updated AI profile</p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.7, margin: 0 }}>{aiProfile}</p>
            </div>
          )}
          <button onClick={() => router.push("/athlete/dashboard")} className="ca-btn ca-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14 }}>
            Back to dashboard →
          </button>
        </div>
      </div>
    );
  }

  const stepLabels = ["What's changed", "New goals", "New documents"];
  const progressPct = ((step - 1) / 3) * 100;

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <style>{`select option { background: var(--parchment); color: var(--ink); }`}</style>
      <div className="ca-panel" style={{ width: "100%", maxWidth: 520, padding: "2.5rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div className="ca-avatar" style={{ width: 44, height: 44, fontSize: 18, margin: "0 auto 14px" }}><span>C</span></div>
          <h1 className="ca-display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 4px" }}>Update your profile</h1>
          <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: 0 }}>Quick refresh — only share what&apos;s changed.</p>
        </div>

        {/* Mini progress bar */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ height: 3, background: "var(--rule)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--aegean-deep)", transition: "width 300ms" }} />
          </div>
          <p className="ca-mono" style={{ marginTop: 8, fontSize: 10.5, color: "var(--terracotta-deep)", letterSpacing: "0.10em" }}>
            Step {step} of 3 — {stepLabels[step - 1]}
          </p>
        </div>

        {step === 1 && (
          <form onSubmit={submitStep1} style={{ display: "grid", gap: "1.125rem" }}>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
              Tell us what&apos;s changed since your last profile update. Leave blank anything that hasn&apos;t changed.
            </p>
            <div>
              <FieldLabel optional>Any new injuries or health updates?</FieldLabel>
              <textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} rows={3}
                placeholder="e.g. Developed left knee pain in March — stopping at 10K runs for now." style={textareaSt} />
            </div>
            <div>
              <FieldLabel optional>Updated performance limiters</FieldLabel>
              <textarea value={limiters} onChange={(e) => setLimiters(e.target.value)} rows={2}
                placeholder="e.g. Now working on swim fitness after pool membership sorted." style={textareaSt} />
            </div>
            <div>
              <FieldLabel optional>Life changes affecting training?</FieldLabel>
              <textarea value={lifeChanges} onChange={(e) => setLifeChanges(e.target.value)} rows={2}
                placeholder="e.g. New job — can only train early mornings now. Baby due in August." style={textareaSt} />
            </div>
            {error && <ErrorBanner msg={error} />}
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={loading} className="ca-btn ca-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, opacity: loading ? 0.5 : 1 }}>
                {loading ? "Saving…" : "Continue →"}
              </button>
              <button type="button" onClick={() => router.back()} className="ca-btn ca-btn-ghost"
                style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13 }}>← Back</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitStep2} style={{ display: "grid", gap: "1.125rem" }}>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
              Update your target race and goals for this season. Leave blank to keep your existing goals.
            </p>
            <div>
              <FieldLabel optional>New target event</FieldLabel>
              <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. 70.3 Mont-Tremblant" style={inputSt} />
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
              <FieldLabel optional>Updated goal</FieldLabel>
              <textarea value={goalDesc} onChange={(e) => setGoalDesc(e.target.value)} rows={3}
                placeholder="e.g. Sub-5 hour 70.3 this season after going 5:24 last year." style={textareaSt} />
            </div>
            <div>
              <FieldLabel optional>Why this goal matters to you</FieldLabel>
              <textarea value={motivation} onChange={(e) => setMotivation(e.target.value)} rows={2}
                placeholder="e.g. Want to qualify for 70.3 World Championships." style={textareaSt} />
            </div>
            {error && <ErrorBanner msg={error} />}
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={loading} className="ca-btn ca-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, opacity: loading ? 0.5 : 1 }}>
                {loading ? "Saving…" : "Continue →"}
              </button>
              <button type="button" onClick={() => setStep(1)} className="ca-btn ca-btn-ghost"
                style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13 }}>← Back</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={submitStep3} style={{ display: "grid", gap: "1.5rem" }}>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.65 }}>
              Upload any new files for this season — new training plans, recent blood work, race results, anything useful.
            </p>
            {token && <>
              <FileUploadZone token={token} category="training_plan" label="New training plans or schedules" hint="PDF, image, CSV" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,image/*" />
              <FileUploadZone token={token} category="medical" label="New medical records or blood work" hint="PDF or image" accept=".pdf,.png,.jpg,.jpeg,image/*" />
              <FileUploadZone token={token} category="race_results" label="Recent race results" hint="PDF, image, or CSV" accept=".pdf,.png,.jpg,.jpeg,.csv,image/*" />
            </>}
            {error && <ErrorBanner msg={error} />}
            <div style={{ padding: "10px 14px", background: "var(--aegean-wash)", border: "1px solid var(--aegean-soft)", borderRadius: 2, fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.6 }}>
              ⚡ After saving, we&apos;ll regenerate your AI profile to reflect your updates.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button type="submit" disabled={generating} className="ca-btn ca-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, opacity: generating ? 0.5 : 1 }}>
                {generating ? "Updating…" : "Update my profile →"}
              </button>
              <button type="button" onClick={() => setStep(2)} className="ca-btn ca-btn-ghost"
                style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13 }}>← Back</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ProfileUpdatePage() {
  return (
    <Suspense fallback={
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p className="ca-eyebrow" style={{ fontSize: 11 }}>Loading…</p>
      </div>
    }>
      <ProfileUpdateInner />
    </Suspense>
  );
}
