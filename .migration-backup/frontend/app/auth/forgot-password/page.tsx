"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/app/lib/supabase";

const INK      = "oklch(0.28 0.022 55)";
const INK_SOFT = "oklch(0.42 0.022 60)";
const INK_MUTE = "oklch(0.58 0.018 65)";
const PARCHMENT = "oklch(0.965 0.018 85)";
const LINEN    = "oklch(0.925 0.025 78)";
const RULE     = "oklch(0.80 0.025 70)";
const AEGEAN   = "oklch(0.42 0.080 200)";
const SERIF    = "'Cormorant Garamond', Georgia, serif";
const BODY     = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO     = "'JetBrains Mono', ui-monospace, monospace";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: PARCHMENT,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: BODY,
      padding: "24px 16px",
    }}>
      <div style={{
        background: "#fff",
        border: `1px solid ${RULE}`,
        borderRadius: 12,
        padding: "44px 40px",
        width: "100%",
        maxWidth: 400,
        boxShadow: "0 2px 16px oklch(0.28 0.022 55 / 0.06)",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <p style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: AEGEAN, margin: "0 0 14px" }}>
            Andes.IA
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, color: INK, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            Reset your password
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_MUTE, margin: 0, lineHeight: 1.5 }}>
            {sent
              ? "Check your inbox for a reset link."
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{
                display: "block",
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: INK_SOFT,
                marginBottom: 6,
              }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="coach@example.com"
                style={{
                  width: "100%",
                  padding: "10px 13px",
                  background: LINEN,
                  border: `1px solid ${RULE}`,
                  borderRadius: 6,
                  color: INK,
                  fontFamily: BODY,
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {error && (
              <div style={{
                background: "oklch(0.96 0.04 25)",
                color: "oklch(0.45 0.18 25)",
                border: "1px solid oklch(0.85 0.08 25)",
                borderRadius: 6,
                padding: "10px 13px",
                fontFamily: BODY,
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "11px",
                background: loading ? RULE : AEGEAN,
                border: "none",
                borderRadius: 6,
                color: "#fff",
                fontFamily: BODY,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: 4,
              }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>📬</div>
            <p style={{ fontFamily: BODY, color: INK_SOFT, fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
              We sent a password reset link to{" "}
              <strong style={{ color: INK }}>{email}</strong>.
            </p>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: 24, fontFamily: BODY, fontSize: 13, color: INK_MUTE }}>
          <Link href="/login" style={{ color: AEGEAN, textDecoration: "none", fontWeight: 500 }}>
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
