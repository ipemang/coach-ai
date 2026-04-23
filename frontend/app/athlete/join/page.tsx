"use client";

/**
 * COA-96: Athlete join flow.
 *
 * The coach sends this URL: /athlete/join?token=<invite_token>
 *
 * Flow:
 * 1. Validate the token against the backend (no auth required)
 * 2. Show invite card — athlete name, coach name, email pre-filled
 * 3. Athlete enters password and signs up via Supabase Auth
 * 4. Save the invite token to localStorage as "pending_athlete_invite"
 *    (read by /auth/callback after email confirmation)
 * 5. Show "check your email" screen
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

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
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
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
  error: {
    background: "#3b1219",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
  } as React.CSSProperties,
};

interface InviteData {
  valid: boolean;
  athlete_name?: string;
  coach_name?: string;
  email?: string;
  expires_at?: string;
  error?: string;
}

function JoinInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Validate invite token on load
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

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

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

      if (error) {
        setFormError(error.message);
        setSubmitting(false);
        return;
      }

      // Save invite token so /auth/callback can call link-account after confirmation
      localStorage.setItem("pending_athlete_invite", token);
      setDone(true);
    } catch {
      setFormError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "11px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px",
          }}>⚡</div>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>Validating your invite…</p>
        </div>
      </div>
    );
  }

  // ── Invalid invite ────────────────────────────────────────────────────────────
  if (!invite?.valid) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔗</div>
            <h2 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: "0 0 8px" }}>
              Invalid invite link
            </h2>
            <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
              {invite?.error ?? "This invite link is not valid."}
            </p>
          </div>
          <p style={{ color: "#4b5563", fontSize: "13px", textAlign: "center", margin: 0 }}>
            Ask your coach to send you a new invite link.
          </p>
        </div>
      </div>
    );
  }

  // ── Success — check email ─────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📬</div>
          <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: "0 0 12px" }}>
            Check your email
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, margin: "0 0 24px" }}>
            We sent a confirmation link to{" "}
            <strong style={{ color: "#fff" }}>{invite.email}</strong>.
            <br /><br />
            Click the link to activate your account and start your onboarding.
          </p>
          <div style={{
            background: "#0f1117",
            border: "1px solid #1e2235",
            borderRadius: "10px",
            padding: "14px 16px",
            textAlign: "left",
          }}>
            <p style={{ color: "#4b5563", fontSize: "12px", margin: "0 0 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              What happens next
            </p>
            {[
              "Confirm your email with the link we just sent",
              "Complete a quick 5-step onboarding",
              "Your AI training profile is generated automatically",
              "Access your personal dashboard",
            ].map((step) => (
              <div key={step} style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                <span style={{ color: "#4f46e5", flexShrink: 0, fontSize: "13px" }}>✓</span>
                <span style={{ color: "#6b7280", fontSize: "13px" }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────────
  const firstName = (invite.athlete_name ?? "").split(" ")[0] || "there";
  const coachFirst = (invite.coach_name ?? "Your coach").split(" ")[0];

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px",
          }}>⚡</div>
          <h1 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>
            Hi {firstName}! 👋
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0, lineHeight: 1.6 }}>
            {coachFirst} invited you to join Coach.AI — your personal training platform.
            Create your account to get started.
          </p>
        </div>

        {/* Invite badge */}
        <div style={{
          background: "rgba(79,70,229,0.1)",
          border: "1px solid rgba(79,70,229,0.3)",
          borderRadius: "10px",
          padding: "12px 16px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}>
          <span style={{ fontSize: "18px" }}>🏅</span>
          <div>
            <p style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: 600, margin: 0 }}>
              Invited by {invite.coach_name ?? "your coach"}
            </p>
            <p style={{ color: "#4b5563", fontSize: "12px", margin: "2px 0 0" }}>
              Personal invite — only you can use this link
            </p>
          </div>
        </div>

        <form onSubmit={handleSignup} style={{ display: "grid", gap: "16px" }}>
          {/* Email — pre-filled, read-only */}
          <div>
            <label style={S.label}>Email address</label>
            <input
              type="email"
              value={invite.email ?? ""}
              readOnly
              style={{ ...S.input, color: "#6b7280", cursor: "not-allowed" }}
            />
            <p style={{ color: "#374151", fontSize: "11px", marginTop: "4px" }}>
              This is the email your coach used to invite you. Sign up with this address.
            </p>
          </div>

          <div>
            <label style={S.label}>Create a password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              style={S.input}
            />
          </div>

          <div>
            <label style={S.label}>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              style={S.input}
            />
          </div>

          {formError && <div style={S.error}>{formError}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px",
              background: submitting ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              marginTop: "4px",
            }}
          >
            {submitting ? "Creating account…" : "Create my account →"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "#374151" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#6c63ff", textDecoration: "none" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function AthletJoinPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6b7280", fontFamily: "sans-serif", fontSize: "14px" }}>Loading…</p>
      </div>
    }>
      <JoinInner />
    </Suspense>
  );
}
