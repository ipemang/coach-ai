import { useState } from "react";
import { useLocation } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { resolvePostLoginRoute } from "../lib/api";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 13px",
  background: "var(--parchment)", border: "1px solid var(--rule)",
  borderRadius: 2, fontFamily: "var(--body)", fontSize: 13,
  color: "var(--ink)", outline: "none", boxSizing: "border-box",
};

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("Auth is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);
    const { data, error: authErr } = await supabase.auth.updateUser({ password });

    if (authErr) {
      setError(authErr.message);
      setLoading(false);
      return;
    }

    const token = data.user?.aud ? (await supabase.auth.getSession()).data.session?.access_token ?? "" : "";
    const route = token ? await resolvePostLoginRoute(token) : "/login";
    navigate(route);
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            Andes<span style={{ color: "var(--terracotta-deep)" }}>.</span>IA
          </span>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-mute)", margin: "8px 0 0" }}>
            Set a new password
          </p>
        </div>

        <div className="ca-panel" style={{ padding: "36px 32px" }}>
          <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.65, color: "var(--ink-soft)", margin: "0 0 24px" }}>
            Choose a strong password for your account.
          </p>
          <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>New password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="new-password" placeholder="At least 8 characters"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Confirm password</label>
              <input
                type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                required autoComplete="new-password" placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ padding: "10px 13px", background: "oklch(0.96 0.02 25)", border: "1px solid var(--terracotta-soft)", borderRadius: 2, fontSize: 12.5, color: "var(--terracotta-deep)", lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="ca-btn ca-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 13, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Updating…" : "Update password →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
