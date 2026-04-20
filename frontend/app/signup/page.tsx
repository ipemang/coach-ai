"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/app/lib/supabase";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

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

  if (success) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0f1117",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{
          background: "#1a1d2e", border: "1px solid #2a2d3e",
          borderRadius: "16px", padding: "48px",
          width: "100%", maxWidth: "400px", textAlign: "center",
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📬</div>
          <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: "0 0 12px" }}>
            Check your email
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, margin: "0 0 24px" }}>
            We sent a confirmation link to <strong style={{ color: "#fff" }}>{email}</strong>.
            Click it to activate your account and get started.
          </p>
          <Link href="/login" style={{
            display: "inline-block", padding: "10px 24px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            borderRadius: "8px", color: "#fff", textDecoration: "none",
            fontSize: "14px", fontWeight: 600,
          }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0f1117",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "#1a1d2e", border: "1px solid #2a2d3e",
        borderRadius: "16px", padding: "48px",
        width: "100%", maxWidth: "400px",
      }}>

        {/* Logo */}
        <div style={{ marginBottom: "32px", textAlign: "center" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px",
          }}>⚡</div>
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: 0 }}>Create your account</h1>
          <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "6px" }}>Start coaching smarter with AI</p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={anyLoading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            width: "100%", padding: "11px",
            background: googleLoading ? "#e5e7eb" : "#fff",
            border: "1px solid #d1d5db", borderRadius: "8px",
            color: "#111827", fontSize: "14px", fontWeight: 500,
            cursor: anyLoading ? "not-allowed" : "pointer",
            marginBottom: "20px",
          }}
        >
          <GoogleIcon />
          {googleLoading ? "Redirecting…" : "Sign up with Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ flex: 1, height: "1px", background: "#2a2d3e" }} />
          <span style={{ color: "#4b5563", fontSize: "12px" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "#2a2d3e" }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Felipe Deidan"
              style={{
                width: "100%", padding: "10px 14px",
                background: "#0f1117", border: "1px solid #2a2d3e",
                borderRadius: "8px", color: "#fff", fontSize: "14px",
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="coach@example.com"
              style={{
                width: "100%", padding: "10px 14px",
                background: "#0f1117", border: "1px solid #2a2d3e",
                borderRadius: "8px", color: "#fff", fontSize: "14px",
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              style={{
                width: "100%", padding: "10px 14px",
                background: "#0f1117", border: "1px solid #2a2d3e",
                borderRadius: "8px", color: "#fff", fontSize: "14px",
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              style={{
                width: "100%", padding: "10px 14px",
                background: "#0f1117", border: "1px solid #2a2d3e",
                borderRadius: "8px", color: "#fff", fontSize: "14px",
                boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#3b1219", color: "#f87171",
              border: "1px solid #7f1d1d",
              borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={anyLoading}
            style={{
              width: "100%", padding: "11px",
              background: anyLoading ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
              border: "none", borderRadius: "8px",
              color: "#fff", fontSize: "14px", fontWeight: 600,
              cursor: anyLoading ? "not-allowed" : "pointer",
              marginTop: "4px",
            }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p style={{ fontSize: "11px", color: "#4b5563", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
            By creating an account you agree to our{" "}
            <a href="/terms" style={{ color: "#6c63ff" }}>Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" style={{ color: "#6c63ff" }}>Privacy Policy</a>.
          </p>
        </form>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "#6b7280" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#6c63ff", textDecoration: "none", fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
