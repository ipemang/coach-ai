import { Link } from "wouter";

export default function LandingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "oklch(0.965 0.018 85)",
      backgroundImage: `
        radial-gradient(circle at 20% 30%, oklch(0.88 0.04 45 / 0.18) 0, transparent 35%),
        radial-gradient(circle at 80% 70%, oklch(0.88 0.04 195 / 0.14) 0, transparent 40%),
        url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g fill='none' stroke='%23c9b59a' stroke-width='0.5' opacity='0.35'><path d='M0 14 L14 0 L28 14 L14 28 Z'/><path d='M7 7 L21 7 L21 21 L7 21 Z'/></g></svg>")
      `,
      backgroundSize: "auto, auto, 28px 28px",
      fontFamily: "var(--body)",
      color: "oklch(0.28 0.022 55)",
    }}>
      {/* Nav */}
      <nav style={{
        borderBottom: "1px solid oklch(0.80 0.025 70)",
        background: "oklch(0.925 0.025 78)",
        position: "sticky", top: 0, zIndex: 30,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 32px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="28" height="28" viewBox="0 0 32 32">
              <rect x="2" y="2" width="28" height="28" fill="none" stroke="oklch(0.28 0.022 55)" strokeWidth="1" />
              <g fill="oklch(0.66 0.135 42)" opacity="0.85">
                <rect x="5" y="5" width="5" height="5" /><rect x="16" y="5" width="5" height="5" />
                <rect x="11" y="11" width="5" height="5" /><rect x="22" y="11" width="5" height="5" />
                <rect x="5" y="17" width="5" height="5" /><rect x="16" y="17" width="5" height="5" />
              </g>
              <g fill="oklch(0.42 0.080 200)" opacity="0.9">
                <rect x="11" y="5" width="5" height="5" /><rect x="22" y="5" width="5" height="5" />
                <rect x="5" y="11" width="5" height="5" /><rect x="16" y="11" width="5" height="5" />
                <rect x="11" y="17" width="5" height="5" /><rect x="22" y="17" width="5" height="5" />
              </g>
            </svg>
            <span style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 500, lineHeight: 1 }}>
              Andes<span style={{ color: "oklch(0.42 0.080 25)" }}>.</span>IA
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/login" style={{ fontSize: 13, color: "oklch(0.42 0.022 60)", textDecoration: "none", padding: "8px 14px" }}>
            Sign in
          </Link>
          <Link href="/signup" style={{
            fontSize: 13, fontWeight: 600, padding: "9px 18px",
            background: "oklch(0.42 0.080 200)", color: "oklch(0.97 0.02 190)",
            borderRadius: 2, textDecoration: "none",
          }}>
            Get started →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px 72px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <div style={{
              fontFamily: "var(--mono)",
              fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase",
              color: "oklch(0.52 0.130 38)", marginBottom: 20,
            }}>
              For endurance coaches
            </div>
            <h1 style={{
              fontFamily: "var(--serif)",
              fontSize: 60, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.015em",
              margin: "0 0 24px", color: "oklch(0.28 0.022 55)",
            }}>
              Your athletes.<br />Your voice.<br />Your AI.
            </h1>
            <p style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic", fontSize: 20, lineHeight: 1.6,
              color: "oklch(0.42 0.022 60)", margin: "0 0 40px", maxWidth: 480,
            }}>
              Andes.IA helps endurance coaches save hours each week on training
              prescription — without losing your personal touch with each athlete.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/signup" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px",
                background: "oklch(0.42 0.080 200)", color: "oklch(0.97 0.02 190)",
                borderRadius: 2, textDecoration: "none", fontSize: 15, fontWeight: 600,
              }}>
                Start coaching smarter →
              </Link>
              <Link href="/login" style={{
                display: "inline-flex", alignItems: "center",
                padding: "13px 28px",
                background: "transparent",
                border: "1px solid oklch(0.80 0.025 70)",
                color: "oklch(0.42 0.022 60)",
                borderRadius: 2, textDecoration: "none", fontSize: 15,
              }}>
                Athlete login
              </Link>
            </div>
          </div>

          {/* Hero card preview */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1,
              background: "oklch(0.80 0.025 70)",
              border: "1px solid oklch(0.80 0.025 70)",
              borderRadius: 4, overflow: "hidden",
            }}>
              {[
                { label: "Athletes", value: "12" },
                { label: "Replies pending", value: "3" },
                { label: "Check-ins today", value: "8" },
              ].map(k => (
                <div key={k.label} style={{ background: "oklch(0.925 0.025 78)", padding: "18px 20px" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "oklch(0.58 0.018 65)" }}>{k.label}</div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 40, lineHeight: 1, marginTop: 8, color: "oklch(0.28 0.022 55)" }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{
              background: "oklch(0.925 0.025 78)", border: "1px solid oklch(0.80 0.025 70)",
              borderRadius: 4, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 2, background: "oklch(0.92 0.030 190)", border: "1px solid oklch(0.86 0.050 190)", display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontWeight: 500, fontSize: 18, color: "oklch(0.42 0.080 200)" }}>PT</div>
                <div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 500 }}>Patrick Torres</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "oklch(0.58 0.018 65)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>Build phase · Wk 8</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <span style={{ background: "oklch(0.86 0.055 45)", border: "1px solid oklch(0.80 0.08 45)", borderRadius: 2, padding: "2px 9px", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.52 0.130 38)" }}>1 pending</span>
                </div>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 13.5, color: "oklch(0.42 0.022 60)", borderLeft: "2px solid oklch(0.75 0.090 78)", paddingLeft: 10 }}>
                &ldquo;Legs felt heavy on the long run today, but held target pace.&rdquo;
              </div>
              <div style={{ marginTop: 12, padding: "10px 14px", background: "oklch(0.945 0.022 82)", borderRadius: 2 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.42 0.080 200)", marginBottom: 6 }}>Suggested reply</div>
                <p style={{ margin: 0, fontSize: 13, color: "oklch(0.28 0.022 55)", lineHeight: 1.5 }}>
                  Heavy legs after a long run at target pace is a great sign — your body is adapting. Keep Tuesday easy and trust the process.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.52 0.130 38)", marginBottom: 12 }}>
            How it works
          </div>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 42, fontWeight: 500, letterSpacing: "-0.01em", margin: 0 }}>
            The AI that knows your voice
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {[
            { num: "01", title: "Athlete checks in", body: "Your athlete sends a WhatsApp message after their session — a note, a question, how they're feeling.", color: "oklch(0.42 0.080 200)" },
            { num: "02", title: "AI drafts a reply", body: "Andes.IA reads the check-in, looks at their training plan, and drafts a reply in your voice — not a chatbot's.", color: "oklch(0.66 0.135 42)" },
            { num: "03", title: "You approve and send", body: "You see the draft, tweak it if needed, hit approve. The message goes out under your name. You stay the coach.", color: "oklch(0.55 0.050 125)" },
          ].map(step => (
            <div key={step.num} style={{
              background: "oklch(0.925 0.025 78)", border: "1px solid oklch(0.80 0.025 70)",
              borderRadius: 4, padding: "28px 28px 32px",
            }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 48, lineHeight: 1, color: step.color, opacity: 0.3, marginBottom: 16 }}>{step.num}</div>
              <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, margin: "0 0 12px" }}>{step.title}</h3>
              <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: "oklch(0.42 0.022 60)", margin: 0 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ background: "oklch(0.885 0.028 75)", borderTop: "1px solid oklch(0.80 0.025 70)", borderBottom: "1px solid oklch(0.80 0.025 70)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.52 0.130 38)", marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 42, fontWeight: 500, letterSpacing: "-0.01em", margin: "0 0 12px" }}>Simple, transparent plans</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "oklch(0.80 0.025 70)", border: "1px solid oklch(0.80 0.025 70)", borderRadius: 4, overflow: "hidden" }}>
            {[
              { name: "Starter", price: "$49", athletes: "Up to 10 athletes", features: ["AI reply drafts", "WhatsApp check-ins", "Suggestion review dashboard", "Training plan assistant"], highlight: false },
              { name: "Growth", price: "$99", athletes: "Up to 25 athletes", features: ["Everything in Starter", "Office hours automation", "AI profile per athlete", "File uploads & analysis"], highlight: true },
              { name: "Pro", price: "$149", athletes: "Unlimited athletes", features: ["Everything in Growth", "Priority support", "Early access to new features", "Custom AI voice tuning"], highlight: false },
            ].map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight ? "oklch(0.42 0.080 200)" : "oklch(0.925 0.025 78)",
                color: plan.highlight ? "oklch(0.97 0.02 190)" : "oklch(0.28 0.022 55)",
                padding: "36px 32px",
              }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, marginBottom: 12 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 52, fontWeight: 500, lineHeight: 1 }}>{plan.price}</span>
                  <span style={{ fontSize: 15, opacity: 0.6 }}>/mo</span>
                </div>
                <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 14, opacity: 0.75, marginBottom: 28 }}>{plan.athletes}</div>
                <div style={{ borderTop: `1px solid ${plan.highlight ? "oklch(1 0 0 / 0.2)" : "oklch(0.80 0.025 70)"}`, paddingTop: 24, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                      <span style={{ color: plan.highlight ? "oklch(0.88 0.05 190)" : "oklch(0.42 0.080 200)", flexShrink: 0, marginTop: 1 }}>✓</span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link href="/signup" style={{
                  display: "block", textAlign: "center", padding: "11px 20px",
                  background: plan.highlight ? "oklch(1 0 0 / 0.15)" : "oklch(0.42 0.080 200)",
                  color: "oklch(0.97 0.02 190)",
                  border: plan.highlight ? "1px solid oklch(1 0 0 / 0.3)" : "none",
                  borderRadius: 2, textDecoration: "none", fontSize: 14, fontWeight: 600,
                }}>
                  Get started →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid oklch(0.80 0.025 70)", background: "oklch(0.885 0.028 75)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 500 }}>
            Andes<span style={{ color: "oklch(0.52 0.130 38)" }}>.</span>IA
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.58 0.018 65)" }}>
            COACH · ATHLETE · PURPOSE
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/login" style={{ fontSize: 13, color: "oklch(0.58 0.018 65)", textDecoration: "none" }}>Sign in</Link>
            <Link href="/signup" style={{ fontSize: 13, color: "oklch(0.58 0.018 65)", textDecoration: "none" }}>Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
