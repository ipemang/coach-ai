import { useState } from "react";
import { useLocation } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";

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

    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); }
    else { navigate("/dashboard"); }
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
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, #6c63ff, #4f46e5)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>🔒</div>
          <h1 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: 0 }}>Set a new password</h1>
          <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "6px" }}>Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleReset} style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" placeholder="At least 8 characters" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>Confirm password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" placeholder="••••••••" style={inputStyle} />
          </div>
          {error && <div style={{ background: "#3b1219", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "11px",
            background: loading ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
            border: "none", borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}>
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
