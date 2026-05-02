import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { BACKEND, parseJwtClaims } from "../lib/api";

export default function AuthCallbackPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [status, setStatus] = useState("Completing sign-in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(search);
      const supabase = createBrowserSupabase();

      const code = params.get("code");
      if (code) {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) {
          setError("Sign-in link is invalid or expired. Please try signing in again.");
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      const token = session.access_token;
      const pendingInvite =
        localStorage.getItem("pending_athlete_invite") ||
        params.get("invite") || null;

      if (pendingInvite) {
        setStatus("Linking your account…");
        try {
          const res = await fetch(
            `${BACKEND}/api/v1/athlete/auth/link-account?token=${encodeURIComponent(pendingInvite)}`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok || res.status === 409) {
            localStorage.removeItem("pending_athlete_invite");
            setStatus("Account linked! Refreshing session…");
            await supabase.auth.refreshSession();
            navigate("/athlete/onboarding");
            return;
          }
          const body = await res.json().catch(() => ({}));
          setError((body?.detail as string) ?? "Could not link your account.");
          return;
        } catch {
          setError("Network error — please check your connection and try again.");
          return;
        }
      }

      const claims = parseJwtClaims(token);
      if (claims.role === "athlete" || claims.athlete_id) {
        setStatus("Checking onboarding…");
        try {
          const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            navigate(data.onboarding_complete ? "/athlete/dashboard" : "/athlete/onboarding");
          } else {
            navigate("/athlete/onboarding");
          }
        } catch {
          navigate("/athlete/onboarding");
        }
        return;
      }

      setStatus("Setting up your workspace…");
      try {
        const res = await fetch(`${BACKEND}/api/v1/coach/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.onboarding_complete) {
            navigate("/dashboard");
          } else {
            const name = encodeURIComponent(session.user.user_metadata?.full_name ?? "");
            const email = encodeURIComponent(session.user.email ?? "");
            navigate(`/onboarding?name=${name}&email=${email}`);
          }
        } else {
          const name = encodeURIComponent(session.user.user_metadata?.full_name ?? "");
          const email = encodeURIComponent(session.user.email ?? "");
          navigate(`/onboarding?name=${name}&email=${email}`);
        }
      } catch {
        navigate("/onboarding");
      }
    }
    run();
  }, [navigate, search]);

  if (error) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div className="ca-panel" style={{ width: "100%", maxWidth: 400, padding: "2.5rem 2rem", textAlign: "center" }}>
          <p style={{ fontSize: 40, margin: "0 0 16px" }}>⚠️</p>
          <h2 className="ca-display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 10px" }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 24px" }}>{error}</p>
          <button onClick={() => navigate("/login")} className="ca-btn ca-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px" }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div className="ca-avatar" style={{ width: 52, height: 52, fontSize: 22, margin: "0 auto 20px" }}>
          <span>C</span>
        </div>
        <p className="ca-eyebrow" style={{ fontSize: 11 }}>{status}</p>
      </div>
    </div>
  );
}
