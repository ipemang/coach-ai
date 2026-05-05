"use client";

/**
 * COA-100: Auth callback — routing hub after email confirmation.
 *
 * Supabase redirects here after a user confirms their email.
 * This page figures out who just confirmed and where to send them:
 *
 * Athlete path:
 *   1. localStorage has "pending_athlete_invite" (token saved during /athlete/join signup)
 *   2. Call POST /api/v1/athlete/auth/link-account?token=... to bind their Supabase account to the athletes row
 *   3. Refresh session so the new JWT contains athlete_id + role="athlete"
 *   4. Redirect → /athlete/onboarding
 *
 * Coach path:
 *   1. Call GET /api/v1/coach/onboarding/status
 *   2. onboarding_complete=true  → /dashboard
 *   3. onboarding_complete=false → /onboarding (with name + email pre-filled)
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/app/lib/supabase";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://coach-ai-production-a5aa.up.railway.app";

function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    // L2: Corrected base64url padding formula.
    // Previous: "==".slice((b64.length % 4) || 4) was wrong — produced incorrect
    // padding for payloads where b64.length % 4 === 1 (should add 3 "=" but only added 1).
    const pad = "=".repeat((4 - b64.length % 4) % 4);
    return JSON.parse(window.atob(b64 + pad));
  } catch {
    return {};
  }
}

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Completing sign-in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const supabase = createBrowserSupabase();

      // Exchange PKCE code if present (Supabase v2 default)
      const code = searchParams.get("code");
      if (code) {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) {
          setError("Sign-in link is invalid or expired. Please try signing in again.");
          return;
        }
      }

      // F-C8: Use getUser() as the authoritative auth check — getSession() reads
      // from localStorage and can be spoofed client-side (Supabase security guidance).
      // getUser() validates against the Supabase server.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      // getSession() is only used here to retrieve the access_token for downstream
      // API calls — the auth decision was already made by getUser() above.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const token = session.access_token;
      // Primary: localStorage (set during /athlete/join signup).
      // Fallback: invite param in redirect URL (set for incognito sessions
      // where localStorage is wiped when the window closes).
      const pendingInvite =
        localStorage.getItem("pending_athlete_invite") ||
        searchParams.get("invite") ||
        null;

      // ── Athlete path ──────────────────────────────────────────────────────────
      if (pendingInvite) {
        setStatus("Linking your account…");
        try {
          const res = await fetch(
            `${BACKEND}/api/v1/athlete/auth/link-account?token=${encodeURIComponent(pendingInvite)}`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } }
          );

          if (res.ok || res.status === 409) {
            // 409 = already linked (idempotent) — either way, proceed
            localStorage.removeItem("pending_athlete_invite");
            setStatus("Account linked! Refreshing session…");

            // Refresh so the new JWT has athlete_id + role="athlete"
            await supabase.auth.refreshSession();
            setStatus("Redirecting…");
            router.replace("/athlete/onboarding");
            return;
          }

          const body = await res.json().catch(() => ({}));
          const detail: string = body?.detail ?? "Could not link your account.";
          setError(detail);
          return;
        } catch {
          setError("Network error — please check your connection and try again.");
          return;
        }
      }

      // ── Check JWT claims for role (athlete already linked before this session) ─
      const claims = parseJwtClaims(token);
      if (claims.role === "athlete" || claims.athlete_id) {
        setStatus("Checking onboarding…");
        try {
          const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            router.replace(data.onboarding_complete ? "/athlete/dashboard" : "/athlete/onboarding");
          } else {
            router.replace("/athlete/onboarding");
          }
        } catch {
          router.replace("/athlete/onboarding");
        }
        return;
      }

      // ── Coach path ────────────────────────────────────────────────────────────
      setStatus("Setting up your workspace…");
      try {
        const res = await fetch(`${BACKEND}/api/v1/coach/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.onboarding_complete) {
            router.replace("/dashboard");
          } else {
            const name = encodeURIComponent(session.user.user_metadata?.full_name ?? "");
            const email = encodeURIComponent(session.user.email ?? "");
            router.replace(`/onboarding?name=${name}&email=${email}`);
          }
        } else {
          // No coach row yet — new signup
          const name = encodeURIComponent(session.user.user_metadata?.full_name ?? "");
          const email = encodeURIComponent(session.user.email ?? "");
          router.replace(`/onboarding?name=${name}&email=${email}`);
        }
      } catch {
        router.replace("/onboarding");
      }
    }

    run();
  }, [router, searchParams]);

  if (error) {
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
          style={{ width: "100%", maxWidth: 400, padding: "2.5rem 2rem", textAlign: "center" }}
        >
          <p style={{ fontSize: 40, margin: "0 0 16px" }}>⚠️</p>
          <h2 className="ca-display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 10px" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 24px" }}>
            {error}
          </p>
          <button
            onClick={() => window.location.href = "/login"}
            className="ca-btn ca-btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "10px" }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

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
          style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 20px" }}
        >
          <span>C</span>
        </div>
        <p className="ca-eyebrow" style={{ fontSize: 11 }}>{status}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh", background: "#0f1117",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <p style={{ color: "#6b7280", fontFamily: "sans-serif", fontSize: "14px" }}>Loading…</p>
      </div>
    }>
      <CallbackInner />
    </Suspense>
  );
}
