"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const PARCHMENT = "oklch(0.965 0.018 85)";
const LINEN     = "oklch(0.925 0.025 78)";
const RULE      = "oklch(0.80 0.025 70)";
const RULE_SOFT = "oklch(0.86 0.022 75)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const MOSAIC_BG = {
  backgroundColor: PARCHMENT,
  backgroundImage: [
    "radial-gradient(circle at 20% 30%, oklch(0.88 0.04 45 / 0.18) 0, transparent 35%)",
    "radial-gradient(circle at 80% 70%, oklch(0.88 0.04 195 / 0.14) 0, transparent 40%)",
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g fill='none' stroke='%23c9b59a' stroke-width='0.5' opacity='0.35'><path d='M0 14 L14 0 L28 14 L14 28 Z'/><path d='M7 7 L21 7 L21 21 L7 21 Z'/></g></svg>\")",
  ].join(", "),
  backgroundSize: "auto, auto, 28px 28px",
} as const;

const ATHLETE_MOSAIC_BG = {
  backgroundColor: "oklch(0.28 0.022 55)",
  backgroundImage: [
    "radial-gradient(circle at 25% 35%, oklch(0.42 0.080 200 / 0.25) 0, transparent 40%)",
    "radial-gradient(circle at 75% 65%, oklch(0.52 0.130 38 / 0.20) 0, transparent 40%)",
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g fill='none' stroke='%23ffffff' stroke-width='0.4' opacity='0.12'><path d='M0 14 L14 0 L28 14 L14 28 Z'/><path d='M7 7 L21 7 L21 21 L7 21 Z'/></g></svg>\")",
  ].join(", "),
  backgroundSize: "auto, auto, 28px 28px",
} as const;

function WordMark({ size = 26, light = false }: { size?: number; light?: boolean }) {
  return (
    <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: size, letterSpacing: "-0.01em", color: light ? "oklch(0.94 0.015 70)" : INK }}>
      Andes<span style={{ color: TERRA_DEEP }}>.</span>IA
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.7-.1-1.4-.2-2.1H12v4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-7.9z"/>
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.2 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC04" d="M5.7 13.9a6.6 6.6 0 0 1 0-4.2V6.9H2a11 11 0 0 0 0 9.8l3.7-2.8z"/>
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2 6.9l3.7 2.8c.9-2.6 3.4-4.3 6.3-4.3z"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<"coach" | "athlete">("coach");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const token = data.session?.access_token ?? "";
      try {
        const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(window.atob(b64 + "==".slice((b64.length % 4) || 4)));
        if (claims.role === "athlete" || claims.athlete_id) {
          router.push("/athlete/dashboard");
          return;
        }
      } catch { /* fall through to coach dashboard */ }
      router.push("/dashboard");
      router.refresh();
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: PARCHMENT,
    border: `1px solid ${RULE}`,
    borderRadius: 2,
    color: INK,
    fontFamily: BODY,
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 160ms ease",
  };

  const isCoach = role === "coach";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", minHeight: "100vh" }}>
      {/* Left — brand panel */}
      {isCoach ? (
        <div style={{ ...MOSAIC_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 56px" }}>
          <div style={{ maxWidth: 460 }}>
            <WordMark size={32} />
            <h1 style={{
              fontFamily: SERIF, fontSize: 56, fontWeight: 500,
              letterSpacing: "-0.015em", lineHeight: 1.0,
              color: INK, margin: "32px 0 0",
            }}>
              Welcome back,<br />
              <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Coach.</em>
            </h1>
            <p style={{
              fontFamily: SERIF, fontStyle: "italic",
              fontSize: 18, lineHeight: 1.55,
              color: INK_SOFT, marginTop: 16,
            }}>
              Your athletes are waiting on you. Andes is waiting on you too — quietly, at the kitchen table.
            </p>
            <svg width="180" height="180" viewBox="0 0 180 180" style={{ display: "block", marginTop: 40, opacity: 0.35 }} aria-hidden>
              {Array.from({ length: 6 }).map((_, r) =>
                Array.from({ length: 6 }).map((_, c) => {
                  const x = c * 30, y = r * 30;
                  return (
                    <g key={`${r}-${c}`} fill="none" stroke="oklch(0.52 0.130 38)" strokeWidth="0.6">
                      <path d={`M${x+15},${y} L${x+30},${y+15} L${x+15},${y+30} L${x},${y+15} Z`}/>
                    </g>
                  );
                })
              )}
            </svg>
            <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TERRA_DEEP, background: "oklch(0.86 0.055 45)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, padding: "3px 10px" }}>Coach portal</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, background: LINEN, border: `1px solid ${RULE}`, borderRadius: 2, padding: "3px 10px" }}>v 0.9</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...ATHLETE_MOSAIC_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 56px" }}>
          <div style={{ maxWidth: 460 }}>
            <WordMark size={32} light />
            <h1 style={{
              fontFamily: SERIF, fontSize: 56, fontWeight: 500,
              letterSpacing: "-0.015em", lineHeight: 1.0,
              color: "oklch(0.94 0.015 70)", margin: "32px 0 0",
            }}>
              Welcome back,<br />
              <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Athlete.</em>
            </h1>
            <p style={{
              fontFamily: SERIF, fontStyle: "italic",
              fontSize: 18, lineHeight: 1.55,
              color: "oklch(0.75 0.015 70)", marginTop: 16,
            }}>
              Your coach set up your account. Log in to see your training pulse, check-ins, and weekly messages.
            </p>
            <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                "Daily pulse check-ins tailored to your week",
                "Messages from your coach, in their own words",
                "Training context & progress at a glance",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: TERRA_DEEP, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontFamily: BODY, fontSize: 14.5, color: "oklch(0.80 0.015 70)", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 40, borderTop: "1px solid oklch(1 0 0 / 0.1)", paddingTop: 24 }}>
              <p style={{ fontFamily: BODY, fontSize: 13, color: "oklch(0.65 0.015 70)", margin: 0, lineHeight: 1.6 }}>
                Don&apos;t have an account yet?{" "}
                <span style={{ color: "oklch(0.80 0.015 70)" }}>Your coach will send you an invitation link to get started.</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Right — form panel */}
      <div style={{
        background: LINEN,
        borderLeft: `1px solid ${RULE_SOFT}`,
        display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center",
        padding: "56px 48px",
        minHeight: "100vh",
      }}>
        <div style={{ width: "100%", maxWidth: 380, margin: "0 auto" }}>

          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <WordMark size={22} />
          </div>

          {/* Role tabs */}
          <div style={{ display: "flex", border: `1px solid ${RULE}`, borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => { setRole("coach"); setError(null); }}
              style={{
                flex: 1, padding: "9px 10px",
                background: isCoach ? INK : "transparent",
                color: isCoach ? PARCHMENT : INK_MUTE,
                fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
                border: "none", cursor: "pointer", transition: "all 120ms ease",
              }}
            >
              Coach
            </button>
            <button
              type="button"
              onClick={() => { setRole("athlete"); setError(null); }}
              style={{
                flex: 1, padding: "9px 10px",
                background: !isCoach ? INK : "transparent",
                color: !isCoach ? PARCHMENT : INK_MUTE,
                fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
                border: "none", cursor: "pointer", transition: "all 120ms ease",
              }}
            >
              Athlete
            </button>
          </div>

          {/* Mode tabs */}
          <div style={{ display: "flex", border: `1px solid ${RULE}`, borderRadius: 2, overflow: "hidden", marginBottom: 28 }}>
            <span style={{ flex: 1, padding: "9px 10px", background: INK, color: PARCHMENT, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center" }}>
              Sign in
            </span>
            {isCoach ? (
              <Link href="/signup" style={{ flex: 1, padding: "9px 10px", background: "transparent", color: INK_MUTE, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center", textDecoration: "none" }}>
                Create account
              </Link>
            ) : (
              <span style={{ flex: 1, padding: "9px 10px", background: "transparent", color: INK_MUTE, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center", opacity: 0.4 }}>
                Via invite
              </span>
            )}
          </div>

          <h2 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, color: INK, margin: "0 0 6px" }}>
            {isCoach ? "Sign in to your portal" : "Sign in to your app"}
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, margin: "0 0 20px" }}>
            {isCoach
              ? "Use your coaching email — or continue with Google."
              : "Use the email your coach invited you with."}
          </p>

          {/* Google (coach only) */}
          {isCoach && (
            <>
              <button
                type="button"
                disabled={loading}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  padding: "11px 14px",
                  background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: 2,
                  fontFamily: BODY, fontSize: 13, fontWeight: 500, color: INK,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
                <div style={{ flex: 1, height: 1, background: RULE }} />
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE }}>or</span>
                <div style={{ flex: 1, height: 1, background: RULE }} />
              </div>
            </>
          )}

          {!isCoach && <div style={{ height: 8 }} />}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_SOFT, marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={isCoach ? "coach@example.com" : "athlete@example.com"}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_SOFT, marginBottom: 6 }}>
                <span>Password</span>
                <Link href="/forgot-password" style={{ fontFamily: BODY, fontSize: 12, color: INK_MUTE, textDecoration: "none", textTransform: "none", letterSpacing: 0 }}>Forgot?</Link>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{
                background: "oklch(0.94 0.025 25)",
                border: "1px solid oklch(0.80 0.060 25)",
                color: "oklch(0.38 0.090 25)",
                borderRadius: 2, padding: "10px 14px",
                fontFamily: BODY, fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "11px 16px",
                background: loading ? INK_MUTE : AEGEAN,
                border: `1px solid ${loading ? INK_MUTE : AEGEAN}`,
                borderRadius: 2,
                color: "oklch(0.97 0.02 190)",
                fontFamily: BODY, fontSize: 14, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 160ms ease",
              }}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          {isCoach ? (
            <p style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textAlign: "center", marginTop: 22 }}>
              No account yet?{" "}
              <Link href="/signup" style={{ color: TERRA_DEEP, textDecoration: "none", fontWeight: 500 }}>
                Create one →
              </Link>
            </p>
          ) : (
            <p style={{ fontFamily: BODY, fontSize: 12.5, color: INK_MUTE, textAlign: "center", marginTop: 22, lineHeight: 1.6 }}>
              Athletes join via invite from their coach.{" "}
              <Link href="/athlete/join" style={{ color: TERRA_DEEP, textDecoration: "none" }}>
                Have an invite code? →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
