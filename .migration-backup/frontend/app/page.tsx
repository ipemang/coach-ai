import Link from "next/link";

const INK        = "oklch(0.28 0.022 55)";
const INK_SOFT   = "oklch(0.42 0.022 60)";
const INK_MUTE   = "oklch(0.58 0.018 65)";
const PARCHMENT  = "oklch(0.965 0.018 85)";
const PARCHMENT2 = "oklch(0.945 0.022 82)";
const LINEN      = "oklch(0.925 0.025 78)";
const LINEN_DEEP = "oklch(0.885 0.028 75)";
const RULE       = "oklch(0.80 0.025 70)";
const RULE_SOFT  = "oklch(0.86 0.022 75)";
const AEGEAN     = "oklch(0.42 0.080 200)";
const AEGEAN_SOFT= "oklch(0.86 0.050 190)";
const AEGEAN_WASH= "oklch(0.92 0.030 190)";
const TERRA      = "oklch(0.66 0.135 42)";
const TERRA_DEEP = "oklch(0.52 0.130 38)";
const TERRA_SOFT = "oklch(0.86 0.055 45)";
const OCHRE      = "oklch(0.75 0.090 78)";
const OLIVE_DEEP = "oklch(0.38 0.045 125)";
const SERIF      = "'Cormorant Garamond', Georgia, serif";
const BODY       = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO       = "'JetBrains Mono', ui-monospace, monospace";

const MOSAIC_BG = {
  backgroundColor: PARCHMENT,
  backgroundImage: `
    radial-gradient(circle at 12% 20%, oklch(0.88 0.04 45 / 0.25) 0, transparent 40%),
    radial-gradient(circle at 92% 78%, oklch(0.88 0.04 195 / 0.18) 0, transparent 45%),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><g fill='none' stroke='%23c9b59a' stroke-width='0.5' opacity='0.30'><path d='M0 14 L14 0 L28 14 L14 28 Z'/><path d='M7 7 L21 7 L21 21 L7 21 Z'/></g></svg>")
  `,
  backgroundSize: "auto, auto, 28px 28px",
};

const TESSERA_OVERLAY = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><g fill='none' stroke='%23a89375' stroke-width='0.4' opacity='0.18'><rect x='0.5' y='0.5' width='18' height='18'/><rect x='20.5' y='0.5' width='18' height='18'/><rect x='40.5' y='0.5' width='18' height='18'/><rect x='0.5' y='20.5' width='18' height='18'/><rect x='20.5' y='20.5' width='18' height='18'/><rect x='40.5' y='20.5' width='18' height='18'/><rect x='0.5' y='40.5' width='18' height='18'/><rect x='20.5' y='40.5' width='18' height='18'/><rect x='40.5' y='40.5' width='18' height='18'/></g></svg>")`;

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", fontFamily: BODY, color: INK, background: PARCHMENT }}>

      {/* Promo bar */}
      <div style={{
        background: INK, color: "oklch(0.94 0.015 70)",
        fontFamily: BODY, fontSize: 13, textAlign: "center", padding: "9px 16px",
      }}>
        Coaching season starts here.{" "}
        <Link href="/signup" style={{ color: OCHRE, textDecoration: "none", fontWeight: 500 }}>
          Try Andes.IA free for 14 days →
        </Link>
      </div>

      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 30,
        background: LINEN, borderBottom: `1px solid ${RULE}`,
        padding: "14px 32px", display: "flex", alignItems: "center", gap: 24,
      }}>
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="26" height="26" viewBox="0 0 32 32">
            <rect x="2" y="2" width="28" height="28" fill="none" stroke={INK} strokeWidth="1" />
            <g fill={TERRA} opacity="0.85">
              <rect x="4" y="4" width="7" height="7" /><rect x="18" y="4" width="7" height="7" />
              <rect x="11" y="11" width="7" height="7" />
              <rect x="4" y="18" width="7" height="7" /><rect x="18" y="18" width="7" height="7" />
            </g>
            <g fill={AEGEAN} opacity="0.9">
              <rect x="11" y="4" width="7" height="7" /><rect x="25" y="4" width="3" height="7" />
              <rect x="4" y="11" width="7" height="7" /><rect x="18" y="11" width="7" height="7" />
              <rect x="11" y="18" width="7" height="7" /><rect x="25" y="18" width="3" height="7" />
            </g>
          </svg>
          <span style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.01em" }}>
            Andes<span style={{ color: TERRA_DEEP }}>.</span>IA
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", gap: 4 }}>
          {["How it works", "Methodology", "For coaches", "Pricing", "FAQ"].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, "-")}`} style={{
              fontFamily: BODY, fontSize: 13, color: INK_SOFT, textDecoration: "none",
              padding: "6px 12px", borderRadius: 2,
            }}>{l}</a>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Link href="/login" style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textDecoration: "none", padding: "6px 12px" }}>
          Sign in
        </Link>
        <Link href="/signup" style={{
          fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "9px 18px",
          background: AEGEAN, color: "oklch(0.97 0.02 190)",
          borderRadius: 2, textDecoration: "none",
        }}>
          Get started →
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ ...MOSAIC_BG, padding: "80px 32px 96px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 64, alignItems: "center" }}>
          <div>
            {/* Eyebrow */}
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 20 }}>
              For endurance coaches
            </div>

            {/* Display headline */}
            <h1 style={{ fontFamily: SERIF, fontSize: 60, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK }}>
              Your athletes.<br />
              Your voice.<br />
              <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Your AI.</em>
            </h1>

            {/* Lede */}
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.55, color: INK_SOFT, margin: "0 0 36px", maxWidth: 500 }}>
              Andes.IA is the communication layer for serious endurance coaches.
              Bring your own methodology — we make you superhuman at the human side:
              daily check-ins, voice-note replies, accountability, and the 11pm
              &ldquo;I&apos;m exhausted&rdquo; message you&apos;re tired of missing.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/signup" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "11px 26px", background: AEGEAN, color: "oklch(0.97 0.02 190)",
                borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600,
              }}>
                Get started →
              </Link>
              <Link href="/login" style={{
                display: "inline-flex", alignItems: "center",
                padding: "11px 22px", background: "transparent",
                border: `1px solid ${RULE}`, color: INK_SOFT,
                borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14,
              }}>
                Watch a 90-second tour
              </Link>
            </div>

            {/* Tagline chips */}
            <div style={{ marginTop: 28, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {["Triathlon", "Running", "Cycling", "14-day free trial", "No card required"].map((t, i) => (
                <span key={t} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>
                  {i > 0 && <span style={{ marginRight: 16, opacity: 0.4 }}>·</span>}
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Tessera hero card */}
          <div style={{
            position: "relative", background: LINEN, border: `1px solid ${RULE}`,
            borderRadius: 4, boxShadow: `0 1px 0 oklch(1 0 0 / 0.6) inset, 0 6px 20px -12px oklch(0.3 0.05 60 / 0.25)`,
            padding: "22px 24px", overflow: "hidden",
          }}>
            {/* Tessera overlay */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: TESSERA_OVERLAY, opacity: 0.6, pointerEvents: "none", borderRadius: 4 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 2, background: AEGEAN_WASH,
                  border: `1px solid ${AEGEAN_SOFT}`, display: "grid", placeItems: "center",
                  fontFamily: SERIF, fontWeight: 500, fontSize: 16, color: AEGEAN, flexShrink: 0,
                }}>PT</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500 }}>Patrick Torres</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, marginTop: 3 }}>
                    Build phase · Wk 8
                  </div>
                </div>
                <span style={{
                  background: TERRA_SOFT, border: `1px solid oklch(0.80 0.08 45)`,
                  borderRadius: 2, padding: "2px 9px",
                  fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: TERRA_DEEP,
                }}>1 Pending</span>
              </div>

              {/* Athlete quote */}
              <div style={{
                borderLeft: `2px solid ${OCHRE}`, paddingLeft: 12, marginBottom: 14,
                fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, color: INK_SOFT, lineHeight: 1.55,
              }}>
                &ldquo;Legs felt heavy on the long run today, but held target pace. Should I rest tomorrow?&rdquo;
              </div>

              {/* Suggested reply */}
              <div style={{ background: PARCHMENT2, border: `1px solid ${RULE_SOFT}`, borderRadius: 2, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 6 }}>
                  Suggested reply · <span style={{ color: TERRA_DEEP }}>in your voice</span>
                </div>
                <p style={{ margin: 0, fontFamily: BODY, fontSize: 13, color: INK, lineHeight: 1.5 }}>
                  Heavy legs after a long run at target pace is a great sign — your body is adapting.
                  Take Tuesday easy, then we&apos;ll see how Thursday&apos;s intervals feel. Trust the process.
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{
                  flex: 1, padding: "10px 16px", background: AEGEAN, color: "oklch(0.97 0.02 190)",
                  border: "none", borderRadius: 2, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                  Approve &amp; send
                </button>
                <button style={{
                  padding: "10px 18px", background: PARCHMENT, border: `1px solid ${RULE}`,
                  borderRadius: 2, fontFamily: BODY, fontSize: 13, color: INK, cursor: "pointer",
                }}>
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fret divider */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
        <div style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='12' viewBox='0 0 24 12'><path d='M0 11 L0 3 L6 3 L6 8 L3 8 L3 5 L9 5 L9 11 L0 11 M12 11 L12 3 L18 3 L18 8 L15 8 L15 5 L21 5 L21 11 L12 11' fill='%23a89375' opacity='0.45'/></svg>")`,
          backgroundRepeat: "repeat-x", backgroundPosition: "center", height: 14, opacity: 0.5,
        }} />
      </div>

      {/* How it works */}
      <section id="how-it-works" style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>
            How it works
          </div>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: INK }}>
            The AI that knows your voice.
          </h2>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: INK_SOFT, marginTop: 12 }}>
            Listen first. Change the plan second.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {[
            { num: "01", title: "Athlete checks in", body: "Your athlete sends a WhatsApp message after their session — a note, a question, how they're feeling.", color: AEGEAN },
            { num: "02", title: "AI drafts a reply", body: "Andes.IA reads the check-in, looks at their training plan, and drafts a reply in your voice — not a chatbot's.", color: TERRA },
            { num: "03", title: "You approve and send", body: "You see the draft, tweak it if needed, hit approve. The message goes out under your name. You stay the coach.", color: OLIVE_DEEP },
          ].map(step => (
            <div key={step.num} style={{
              background: LINEN, border: `1px solid ${RULE}`,
              borderRadius: 4, padding: "28px 28px 32px",
              boxShadow: `0 1px 0 oklch(1 0 0 / 0.5) inset, 0 2px 8px -4px oklch(0.3 0.05 60 / 0.18)`,
            }}>
              <div style={{ fontFamily: SERIF, fontSize: 48, lineHeight: 1, color: step.color, opacity: 0.25, marginBottom: 16 }}>{step.num}</div>
              <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 12px", color: INK }}>{step.title}</h3>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>
              Pricing
            </div>
            <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, letterSpacing: "-0.01em", margin: "0 0 12px", color: INK }}>
              Pay for the athletes you coach.
            </h2>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: 0 }}>
              One coach. As many athletes as your plan allows.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: RULE, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
            {[
              { name: "Starter", price: "$49", period: "/mo", sub: "Up to 10 athletes", features: ["AI reply drafts", "WhatsApp check-ins", "Suggestion review dashboard", "Training plan assistant"], cta: "Start free trial", highlight: false },
              { name: "Growth", price: "$99", period: "/mo", sub: "Up to 25 athletes", features: ["Everything in Starter", "Office hours automation", "AI profile per athlete", "File uploads & analysis"], cta: "Most popular →", highlight: true },
              { name: "Pro", price: "$149", period: "/mo", sub: "Unlimited athletes", features: ["Everything in Growth", "Priority support", "Early access to new features", "Custom AI voice tuning"], cta: "Get started →", highlight: false },
            ].map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight ? AEGEAN : LINEN,
                color: plan.highlight ? "oklch(0.97 0.02 190)" : INK,
                padding: "36px 32px",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, marginBottom: 12 }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, lineHeight: 1 }}>{plan.price}</span>
                  <span style={{ fontFamily: BODY, fontSize: 15, opacity: 0.6 }}>{plan.period}</span>
                </div>
                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, opacity: 0.75, marginBottom: 28 }}>{plan.sub}</div>
                <div style={{ borderTop: `1px solid ${plan.highlight ? "oklch(1 0 0 / 0.2)" : RULE}`, paddingTop: 24, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                      <span style={{ color: plan.highlight ? "oklch(0.88 0.05 190)" : AEGEAN, flexShrink: 0 }}>✓</span>
                      <span style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link href="/signup" style={{
                  display: "block", textAlign: "center", padding: "11px 20px",
                  background: plan.highlight ? "oklch(1 0 0 / 0.15)" : AEGEAN,
                  color: "oklch(0.97 0.02 190)",
                  border: plan.highlight ? "1px solid oklch(1 0 0 / 0.3)" : "none",
                  borderRadius: 2, textDecoration: "none",
                  fontFamily: BODY, fontSize: 14, fontWeight: 600,
                }}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coach / Athlete CTA split */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "40px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>For coaches</div>
            <h3 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, margin: "0 0 16px", color: INK }}>Ready to coach smarter?</h3>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: INK_SOFT, lineHeight: 1.6, margin: "0 0 28px" }}>
              Join coaches who are spending less time drafting messages and more time thinking about their athletes&apos; progress.
            </p>
            <Link href="/signup" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "11px 24px", background: AEGEAN,
              color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none",
              fontFamily: BODY, fontSize: 14, fontWeight: 600,
            }}>Create coach account →</Link>
          </div>
          <div style={{
            background: `linear-gradient(155deg, ${TERRA} 0%, ${TERRA_DEEP} 100%)`,
            borderRadius: 4, padding: "40px", color: "oklch(0.98 0.02 50)",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.88 0.05 45)", marginBottom: 12 }}>For athletes</div>
            <h3 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, margin: "0 0 16px" }}>Already working with a coach?</h3>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: "oklch(0.95 0.03 50)", lineHeight: 1.6, margin: "0 0 28px" }}>
              Your coach will send you an invite link. Already have one? Sign in to view your training plan and send check-ins.
            </p>
            <Link href="/login" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "11px 24px", background: "oklch(1 0 0 / 0.15)",
              color: "oklch(0.98 0.02 50)", border: "1px solid oklch(1 0 0 / 0.3)",
              borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600,
            }}>Athlete sign in →</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${RULE}`, background: LINEN_DEEP }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: INK }}>
            Andes<span style={{ color: TERRA_DEEP }}>.</span>IA
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE }}>
            Coach · Athlete · Purpose
          </span>
          <div style={{ display: "flex", gap: 24 }}>
            {[["Sign in", "/login"], ["Sign up", "/signup"]].map(([label, href]) => (
              <Link key={href} href={href} style={{ fontFamily: BODY, fontSize: 13, color: INK_MUTE, textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
