import { useState } from "react";
import { Link } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) { setError(error.message); setLoading(false); }
    else { setSent(true); setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: "#0f1117", border: "1px solid #2a2d3e",
    borderRadius: "8px", color: "#fff", fontSize: "14px",
    boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: "#1a1d2e", border: "1px solid #2a2d3e", borderRadius: "16px", padding: "48px", width: "100%", maxWidth: "400px" }}>
        <div style={{ marginBottom: "32px", textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, #6c63ff, #4f46e5)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>🔑</div>
          <h1 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: 0 }}>Reset your password</h1>
          <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "6px" }}>
            {sent ? "Check your inbox for a reset link." : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="coach@example.com" style={inputStyle} />
            </div>
            {error && <div style={{ background: "#3b1219", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "11px",
              background: loading ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
              border: "none", borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>📬</div>
            <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.6, margin: "0 0 24px" }}>
              We sent a password reset link to <strong style={{ color: "#fff" }}>{email}</strong>.
            </p>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "#6b7280" }}>
          <Link href="/login" style={{ color: "#6c63ff", textDecoration: "none", fontWeight: 500 }}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
