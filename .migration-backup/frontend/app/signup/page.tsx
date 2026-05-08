"use client";

import { useState } from "react";
import Link from "next/link";
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

function WordMark({ size = 26 }: { size?: number }) {
  return (
    <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: size, letterSpacing: "-0.01em", color: INK }}>
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

const PROOF_ITEMS = [
  "14-day free trial — no card required",
  "Your voice model, private to you",
  "Approve every reply before it sends",
];

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const supabase = createBrowserSupabase();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  const anyLoading = loading || googleLoading;

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

  if (success) {
    return (
      <div style={{ minHeight: "100vh", ...MOSAIC_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
        <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "48px", width: "100%", maxWidth: "400px", textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: 48, marginBottom: 16 }}>✉</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: INK, margin: "0 0 12px" }}>Check your email</h2>
          <p style={{ fontFamily: BODY, fontSize: 14.5, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 28px" }}>
            We sent a confirmation link to <strong style={{ color: INK }}>{email}</strong>. Click it to activate your account and get started.
          </p>
          <Link href="/login" style={{
            display: "inline-flex", alignItems: "center",
            padding: "10px 24px",
            background: AEGEAN, border: `1px solid ${AEGEAN}`,
            borderRadius: 2, color: "oklch(0.97 0.02 190)",
            textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600,
          }}>
            Back to sign in →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", minHeight: "100vh" }}>
      {/* Left — brand panel */}
      <div style={{ ...MOSAIC_BG, display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 56px" }}>
        <div style={{ maxWidth: 460 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <WordMark size={32} />
          </div>

          <h1 style={{
            fontFamily: SERIF, fontSize: 52, fontWeight: 500,
            letterSpacing: "-0.015em", lineHeight: 1.05,
            color: INK, margin: "32px 0 0",
          }}>
            Your coaching<br />
            <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>voice.</em> Amplified.
          </h1>
          <p style={{
            fontFamily: SERIF, fontStyle: "italic",
            fontSize: 18, lineHeight: 1.55,
            color: INK_SOFT, marginTop: 16,
          }}>
            Paste 30 messages. Watch the AI learn how you coach. Approve the first draft in under a minute.
          </p>

          {/* Proof items */}
          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 12 }}>
            {PROOF_ITEMS.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: AEGEAN, fontSize: 14, flexShrink: 0 }}>✓</span>
                <span style={{ fontFamily: BODY, fontSize: 14.5, color: INK_SOFT }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Decorative */}
          <svg width="180" height="90" viewBox="0 0 180 90" style={{ display: "block", marginTop: 40, opacity: 0.25 }} aria-hidden>
            {Array.from({ length: 3 }).map((_, r) =>
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

          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TERRA_DEEP, background: "oklch(0.86 0.055 45)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, padding: "3px 10px" }}>Free 14-day trial</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, background: LINEN, border: `1px solid ${RULE}`, borderRadius: 2, padding: "3px 10px" }}>No card required</span>
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div style={{
        background: LINEN,
        borderLeft: `1px solid ${RULE_SOFT}`,
        display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center",
        padding: "48px 48px",
        minHeight: "100vh",
        overflowY: "auto",
      }}>
        <div style={{ width: "100%", maxWidth: 380, margin: "0 auto" }}>

          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <WordMark size={22} />
          </div>

          {/* Mode tabs */}
          <div style={{ display: "flex", border: `1px solid ${RULE}`, borderRadius: 2, overflow: "hidden", marginBottom: 28 }}>
            <Link href="/login" style={{ flex: 1, padding: "9px 10px", background: "transparent", color: INK_MUTE, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center", textDecoration: "none" }}>
              Sign in
            </Link>
            <span style={{ flex: 1, padding: "9px 10px", background: INK, color: PARCHMENT, fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center" }}>
              Create account
            </span>
          </div>

          <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: INK, margin: "0 0 6px" }}>
            Create your coach account
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, margin: "0 0 20px" }}>
            Start with Google or enter your details below.
          </p>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={anyLoading}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "11px 14px",
              background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: 2,
              fontFamily: BODY, fontSize: 13, fontWeight: 500, color: INK,
              cursor: anyLoading ? "not-allowed" : "pointer",
              opacity: googleLoading ? 0.6 : 1,
            }}
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: RULE }} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE }}>or</span>
            <div style={{ flex: 1, height: 1, background: RULE }} />
          </div>

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_SOFT, marginBottom: 6 }}>
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your name"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_SOFT, marginBottom: 6 }}>
                Coaching email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="coach@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_SOFT, marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_SOFT, marginBottom: 6 }}>
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
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
              disabled={anyLoading}
              style={{
                width: "100%", padding: "11px 16px",
                background: anyLoading ? INK_MUTE : AEGEAN,
                border: `1px solid ${anyLoading ? INK_MUTE : AEGEAN}`,
                borderRadius: 2,
                color: "oklch(0.97 0.02 190)",
                fontFamily: BODY, fontSize: 14, fontWeight: 600,
                cursor: anyLoading ? "not-allowed" : "pointer",
                transition: "all 160ms ease",
              }}
            >
              {loading ? "Creating account…" : "Create account →"}
            </button>

            <p style={{ fontFamily: BODY, fontSize: 11.5, color: INK_MUTE, textAlign: "center", margin: "12px 0 0", lineHeight: 1.55 }}>
              By creating an account you agree to our{" "}
              <Link href="/terms" style={{ color: TERRA_DEEP, textDecoration: "none" }}>Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" style={{ color: TERRA_DEEP, textDecoration: "none" }}>Privacy Policy</Link>.
            </p>
          </form>

          <p style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textAlign: "center", marginTop: 20 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: TERRA_DEEP, textDecoration: "none", fontWeight: 500 }}>
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
