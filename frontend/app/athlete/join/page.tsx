"use client";

/**
 * COA-96: Athlete join flow.
 * /athlete/join?token=<invite_token>
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

interface InviteData {
  valid: boolean;
  athlete_name?: string;
  coach_name?: string;
  email?: string;
  expires_at?: string;
  error?: string;
}

// ── Shared input style (mosaic tokens) ───────────────────────────────────────

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

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
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
          <span>C</span>
        </div>
        <p className="ca-eyebrow" style={{ fontSize: 11 }}>Validating your invite…</p>
      </div>
    </div>
  );
}

// ── Invalid invite ────────────────────────────────────────────────────────────

function InvalidScreen({ message }: { message: string }) {
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
      <div
        className="ca-panel"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "2.5rem 2rem",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 40, margin: "0 0 16px" }}>🔗</p>
        <h2
          className="ca-display"
          style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 10px" }}
        >
          Invalid invite link
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-soft)",
            lineHeight: 1.65,
            margin: "0 0 24px",
          }}
        >
          {message}
        </p>
        <p className="ca-eyebrow" style={{ fontSize: 10 }}>
          Ask your coach to send you a new invite link.
        </p>
      </div>
    </div>
  );
}

// ── Check email screen ────────────────────────────────────────────────────────

function CheckEmailScreen({ email }: { email: string }) {
  const STEPS = [
    "Confirm your email with the link we just sent",
    "Complete a quick 5-step onboarding",
    "Your AI training profile is generated automatically",
    "Access your personal dashboard",
  ];

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
      <div
        className="ca-panel"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "2.5rem 2rem",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 48, margin: "0 0 16px" }}>📬</p>
        <h2
          className="ca-display"
          style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 12px" }}
        >
          Check your email
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-soft)",
            lineHeight: 1.65,
            margin: "0 0 28px",
          }}
        >
          We sent a confirmation link to{" "}
          <strong style={{ color: "var(--ink)" }}>{email}</strong>.
          <br />
          <br />
          Click the link to activate your account and start onboarding.
        </p>

        <div
          style={{
            background: "var(--linen-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 2,
            padding: "1rem 1.125rem",
            textAlign: "left",
          }}
        >
          <p
            className="ca-eyebrow"
            style={{ fontSize: 9.5, marginBottom: 10 }}
          >
            What happens next
          </p>
          {STEPS.map((step) => (
            <div
              key={step}
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 7,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  color: "var(--aegean-deep)",
                  flexShrink: 0,
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                ✓
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                }}
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main join form ────────────────────────────────────────────────────────────

function JoinInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvite({ valid: false, error: "No invite token found in the URL. Please use the link your coach sent you." });
      setLoading(false);
      return;
    }
    fetch(`${BACKEND}/api/v1/athlete/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: InviteData) => { setInvite(data); setLoading(false); })
      .catch(() => {
        setInvite({ valid: false, error: "Could not validate invite. Please check your connection and try again." });
        setLoading(false);
      });
  }, [token]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setFormError("Passwords don't match."); return; }
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signUp({
        email: invite!.email!,
        password,
        options: {
          data: { full_name: invite?.athlete_name ?? "" },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setFormError(error.message); setSubmitting(false); return; }
      localStorage.setItem("pending_athlete_invite", token);
      setDone(true);
    } catch {
      setFormError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!invite?.valid) return <InvalidScreen message={invite?.error ?? "This invite link is not valid."} />;
  if (done) return <CheckEmailScreen email={invite.email ?? ""} />;

  const firstName = (invite.athlete_name ?? "").split(" ")[0] || "there";
  const coachFirst = (invite.coach_name ?? "Your coach").split(" ")[0];

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
      <div
        className="ca-panel"
        style={{ width: "100%", maxWidth: 420, padding: "2.5rem 2rem" }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            className="ca-avatar"
            style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 16px" }}
          >
            <span>C</span>
          </div>
          <h1
            className="ca-display"
            style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 8px" }}
          >
            Hi {firstName}! 👋
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-soft)",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {coachFirst} invited you to join Coach.AI —
            your personal training platform.
          </p>
        </div>

        {/* Invite badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0.75rem 1rem",
            background: "var(--linen-deep)",
            border: "1px solid var(--rule)",
            borderLeft: "3px solid var(--aegean-deep)",
            borderRadius: 2,
            marginBottom: "1.5rem",
          }}
        >
          <span style={{ fontSize: 18 }}>🏅</span>
          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--aegean-deep)",
                margin: 0,
              }}
            >
              Invited by {invite.coach_name ?? "your coach"}
            </p>
            <p
              className="ca-mono"
              style={{ fontSize: 10, color: "var(--ink-mute)", margin: "2px 0 0" }}
            >
              Personal invite — only you can use this link
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} style={{ display: "grid", gap: "1rem" }}>
          <div>
            <label
              className="ca-eyebrow"
              style={{ display: "block", marginBottom: 5, fontSize: 10 }}
            >
              Email address
            </label>
            <input
              type="email"
              value={invite.email ?? ""}
              readOnly
              style={{ ...inputSt, color: "var(--ink-mute)", cursor: "not-allowed" }}
            />
            <p
              className="ca-mono"
              style={{ fontSize: 10, color: "var(--ink-mute)", marginTop: 4 }}
            >
              This is the email your coach used to invite you.
            </p>
          </div>

          <div>
            <label
              className="ca-eyebrow"
              style={{ display: "block", marginBottom: 5, fontSize: 10 }}
            >
              Create a password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              style={inputSt}
            />
          </div>

          <div>
            <label
              className="ca-eyebrow"
              style={{ display: "block", marginBottom: 5, fontSize: 10 }}
            >
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              style={inputSt}
            />
          </div>

          {formError && (
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
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="ca-btn ca-btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "11px",
              fontSize: 14,
              marginTop: 4,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "Creating account…" : "Create my account →"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: "1.25rem",
            fontSize: 12,
            color: "var(--ink-mute)",
          }}
        >
          Already have an account?{" "}
          <a
            href="/login"
            style={{
              color: "var(--aegean-deep)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

export default function AthleteJoinPage() {
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
      <JoinInner />
    </Suspense>
  );
}
