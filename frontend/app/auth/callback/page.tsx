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

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "==".slice((b64.length % 4) || 4);
    return JSON.parse(window.atob(pad));
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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const token = session.access_token;
      const pendingInvite = localStorage.getItem("pending_athlete_invite");

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
      <div style={{
        minHeight: "100vh", background: "#0f1117",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "24px",
      }}>
        <div style={{
          background: "#1a1d2e", border: "1px solid #2a2d3e",
          borderRadius: "16px", padding: "40px",
          maxWidth: "380px", width: "100%", textAlign: "center",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
          <h2 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: "0 0 12px" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, margin: "0 0 24px" }}>
            {error}
          </p>
          <button
            onClick={() => window.location.href = "/login"}
            style={{
              padding: "10px 24px",
              background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
              border: "none", borderRadius: "8px",
              color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Back to sign in
          </button>
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
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "44px", height: "44px", borderRadius: "11px",
          background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
          margin: "0 auto 20px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "22px",
        }}>⚡</div>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>{status}</p>
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
