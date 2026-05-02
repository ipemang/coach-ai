import { useState } from "react";
import { useLocation, Link } from "wouter";
import { createBrowserSupabase } from "../lib/supabase";
import { parseJwtClaims } from "../lib/api";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const token = data.session?.access_token ?? "";
      try {
        const claims = parseJwtClaims(token);
        if (claims.role === "athlete" || claims.athlete_id) {
          navigate("/athlete/dashboard");
          return;
        }
      } catch { /* fall through */ }
      navigate("/dashboard");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: "#0f1117", border: "1px solid #2a2d3e",
    borderRadius: "8px", color: "#fff", fontSize: "14px",
    boxSizing: "border-box", outline: "none",
  };

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
        <div style={{ marginBottom: "32px", textAlign: "center" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            background: "linear-gradient(135deg, #6c63ff, #4f46e5)",
            margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px",
          }}>⚡</div>
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: 0 }}>Andes.IA</h1>
          <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "6px" }}>Coach dashboard login</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="coach@example.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#9ca3af", marginBottom: "6px" }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "11px",
            background: loading ? "#374151" : "linear-gradient(135deg, #6c63ff, #4f46e5)",
            border: "none", borderRadius: "8px",
            color: "#fff", fontSize: "14px", fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer", marginTop: "4px",
          }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <Link href="/auth/forgot-password" style={{ fontSize: "13px", color: "#6c63ff", textDecoration: "none" }}>
            Forgot password?
          </Link>
        </div>
        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "13px", color: "#6b7280" }}>
          Don't have an account?{" "}
          <Link href="/signup" style={{ color: "#6c63ff", textDecoration: "none", fontWeight: 500 }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
