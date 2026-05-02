import { useState } from "react";
import { useLocation, Link } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { getRoleAndRedirect } from "../lib/api";

function AndesLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-label="Andes.IA">
      <rect x="1" y="1" width="30" height="30" fill="none" stroke="var(--ink)" strokeWidth="0.75" />
      <rect x="4" y="4" width="6" height="6" fill="var(--terracotta)" opacity="0.9" />
      <rect x="11" y="4" width="6" height="6" fill="var(--aegean-deep)" opacity="0.9" />
      <rect x="18" y="4" width="6" height="6" fill="var(--terracotta)" opacity="0.9" />
      <rect x="4" y="11" width="6" height="6" fill="var(--aegean-deep)" opacity="0.9" />
      <rect x="11" y="11" width="6" height="6" fill="var(--ochre)" opacity="0.85" />
      <rect x="18" y="11" width="6" height="6" fill="var(--aegean-deep)" opacity="0.9" />
      <rect x="4" y="18" width="6" height="6" fill="var(--olive)" opacity="0.85" />
      <rect x="11" y="18" width="6" height="6" fill="var(--terracotta)" opacity="0.9" />
      <rect x="18" y="18" width="6" height="6" fill="var(--ochre)" opacity="0.85" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const anyLoading = loading || googleLoading;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Auth is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."); setLoading(false); return; }

    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });

    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      return;
    }

    const token = data.session?.access_token ?? "";
    const { role, route } = await getRoleAndRedirect(token);

    if (role === "coach" && route === "/onboarding") {
      const name = encodeURIComponent(data.session?.user.user_metadata?.full_name ?? "");
      const emailParam = encodeURIComponent(data.session?.user.email ?? "");
      navigate(`/onboarding?name=${name}&email=${emailParam}`);
    } else {
      navigate(route);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Auth is not configured yet."); setGoogleLoading(false); return; }
    const { error: authErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { access_type: "offline", prompt: "consent" } },
    });
    if (authErr) { setError(authErr.message); setGoogleLoading(false); }
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <AndesLogo />
            <span style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
              Andes<span style={{ color: "var(--terracotta-deep)" }}>.</span>IA
            </span>
          </div>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-mute)", margin: "6px 0 0" }}>
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div className="ca-panel" style={{ padding: "36px 32px" }}>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={anyLoading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "10px 14px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontSize: 13, fontFamily: "var(--body)", fontWeight: 500, color: "var(--ink)", cursor: anyLoading ? "not-allowed" : "pointer", opacity: anyLoading ? 0.6 : 1, marginBottom: 20 }}
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "var(--rule-soft)" }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--rule-soft)" }} />
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" placeholder="coach@example.com"
                style={{ width: "100%", padding: "10px 13px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password" placeholder="••••••••"
                style={{ width: "100%", padding: "10px 13px", background: "var(--parchment)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ textAlign: "right", marginTop: 6 }}>
                <Link href="/auth/forgot-password" style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--aegean-deep)", textDecoration: "none" }}>Forgot password?</Link>
              </div>
            </div>

            {error && (
              <div style={{ padding: "10px 13px", background: "oklch(0.96 0.02 25)", border: "1px solid var(--terracotta-soft)", borderRadius: 2, fontSize: 12.5, color: "var(--terracotta-deep)", lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={anyLoading}
              className="ca-btn ca-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, marginTop: 4, opacity: anyLoading ? 0.6 : 1, cursor: anyLoading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink-mute)" }}>
          No account?{" "}
          <Link href="/signup" style={{ color: "var(--terracotta-deep)", textDecoration: "none", fontWeight: 500 }}>Create one →</Link>
        </p>

        <p style={{ textAlign: "center", marginTop: 10, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink-mute)" }}>
          Athlete?{" "}
          <Link href="/login" style={{ color: "var(--aegean-deep)", textDecoration: "none", fontWeight: 500 }}>Same login — we'll send you to the right place.</Link>
        </p>
      </div>
    </div>
  );
}
