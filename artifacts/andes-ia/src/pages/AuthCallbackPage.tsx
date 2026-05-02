import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { BACKEND, getRoleAndRedirect } from "../lib/api";

export default function AuthCallbackPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [status, setStatus] = useState("Completing sign-in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(search);
      const supabase = createBrowserSupabase();
      if (!supabase) { navigate("/login"); return; }

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

      // ── Athlete invite link flow ───────────────────────────────────────
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
            setStatus("Account linked! Setting up your profile…");
            await supabase.auth.refreshSession();
            navigate("/athlete/onboarding");
            return;
          }
          const body = await res.json().catch(() => ({}));
          setError((body?.detail as string) ?? "Could not link your account. Please contact your coach.");
          return;
        } catch {
          setError("Network error — please check your connection and try again.");
          return;
        }
      }

      // ── Normal login: resolve role & onboarding status ────────────────
      setStatus("Finding your workspace…");
      const { role, route } = await getRoleAndRedirect(token);

      // For coaches going to onboarding, pre-fill name + email in query params
      if (role === "coach" && route === "/onboarding") {
        const name = encodeURIComponent(session.user.user_metadata?.full_name ?? "");
        const email = encodeURIComponent(session.user.email ?? "");
        navigate(`/onboarding?name=${name}&email=${email}`);
      } else {
        navigate(route);
      }
    }
    run();
  }, [navigate, search]);

  if (error) {
    return (
      <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div className="ca-panel" style={{ width: "100%", maxWidth: 400, padding: "2.5rem 2rem", textAlign: "center" }}>
          <div className="ca-ornament" style={{ fontSize: 14, marginBottom: 16 }}>◆ ◆ ◆</div>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 500, color: "var(--ink)", margin: "0 0 12px" }}>Something went wrong</h2>
          <p style={{ fontSize: 13.5, fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink-soft)", lineHeight: 1.65, margin: "0 0 28px" }}>{error}</p>
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
        <div style={{ display: "flex", gap: 3, justifyContent: "center", marginBottom: 24 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i === 0 ? "var(--terracotta)" : i === 1 ? "var(--aegean-deep)" : "var(--ochre)",
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-mute)" }}>{status}</p>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
