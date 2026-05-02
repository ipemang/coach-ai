import { useState } from "react";
import { Link } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 13px",
  background: "var(--parchment)", border: "1px solid var(--rule)",
  borderRadius: 2, fontFamily: "var(--body)", fontSize: 13,
  color: "var(--ink)", outline: "none", boxSizing: "border-box",
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("Auth is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      setLoading(false);
      return;
    }

    const { error: authErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (authErr) { setError(authErr.message); setLoading(false); }
    else { setSent(true); setLoading(false); }
  }

  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            Andes<span style={{ color: "var(--terracotta-deep)" }}>.</span>IA
          </span>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-mute)", margin: "8px 0 0" }}>
            Reset your password
          </p>
        </div>

        <div className="ca-panel" style={{ padding: "36px 32px" }}>
          {!sent ? (
            <>
              <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, lineHeight: 1.65, color: "var(--ink-soft)", margin: "0 0 24px" }}>
                Enter your email and we'll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 6 }}>Email address</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" placeholder="coach@example.com"
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
                  {loading ? "Sending…" : "Send reset link →"}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div className="ca-ornament" style={{ fontSize: 14, marginBottom: 20 }}>◆ ◆ ◆</div>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, color: "var(--ink)", margin: "0 0 12px" }}>Check your inbox.</h2>
              <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, lineHeight: 1.7, color: "var(--ink-soft)", margin: 0 }}>
                We sent a reset link to <strong style={{ fontStyle: "normal", color: "var(--ink)" }}>{email}</strong>.
              </p>
            </div>
          )}
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontFamily: "var(--body)", fontSize: 13, color: "var(--ink-mute)" }}>
          <Link href="/login" style={{ color: "var(--terracotta-deep)", textDecoration: "none", fontWeight: 500 }}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
