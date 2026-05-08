import Link from "next/link";
import { MarketingShell } from "../_components/MarketingShell";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const PARCHMENT = "oklch(0.965 0.018 85)";
const LINEN     = "oklch(0.925 0.025 78)";
const LINEN_DEEP= "oklch(0.885 0.028 75)";
const RULE      = "oklch(0.80 0.025 70)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const AEGEAN_WASH = "oklch(0.92 0.030 190)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    period: "/month",
    annualNote: "$39/mo billed annually",
    athletes: "Up to 10 athletes",
    pitch: "For coaches just starting to scale.",
    cta: "Start free trial",
    href: "/signup",
    featured: false,
    features: [
      "Full voice cloning setup",
      "Morning pulse check-ins",
      "AI reply drafts (approval queue)",
      "Athlete dashboard & app",
      "WhatsApp integration",
      "Office hours + after-hours AI",
      "Daily briefing",
      "Document vault (100 MB / athlete)",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: "$119",
    period: "/month",
    annualNote: "$95/mo billed annually",
    athletes: "Up to 30 athletes",
    pitch: "For full-time coaches ready to systematize.",
    cta: "Start free trial",
    href: "/signup",
    featured: true,
    features: [
      "Everything in Starter",
      "Training report generator",
      "AI session note drafting",
      "Weekly digest (Fri–Sun)",
      "Media review queue (form analysis)",
      "Biometric baseline tracking",
      "Urgency escalation rules",
      "Priority email + chat support",
      "White-label athlete app",
    ],
  },
  {
    name: "Elite",
    price: "$249",
    period: "/month",
    annualNote: "$199/mo billed annually",
    athletes: "Unlimited athletes",
    pitch: "For high-volume programs and coaching orgs.",
    cta: "Talk to us",
    href: "/contact",
    featured: false,
    features: [
      "Everything in Pro",
      "Multi-coach organization support",
      "Custom onboarding & voice setup",
      "Dedicated account manager",
      "API access (bring your own integrations)",
      "Custom integrations on request",
      "SLA-backed uptime guarantee",
      "Custom data retention policy",
    ],
  },
];

const ALL_FEATURES = [
  { label: "Voice cloning", starter: true, pro: true, elite: true },
  { label: "Morning pulse check-ins", starter: true, pro: true, elite: true },
  { label: "AI reply drafts", starter: true, pro: true, elite: true },
  { label: "Athlete count", starter: "Up to 10", pro: "Up to 30", elite: "Unlimited" },
  { label: "WhatsApp integration", starter: true, pro: true, elite: true },
  { label: "Office hours & after-hours AI", starter: true, pro: true, elite: true },
  { label: "Daily briefing", starter: true, pro: true, elite: true },
  { label: "Document vault", starter: "100 MB / athlete", pro: "100 MB / athlete", elite: "Unlimited" },
  { label: "Training reports", starter: false, pro: true, elite: true },
  { label: "Session note drafting", starter: false, pro: true, elite: true },
  { label: "Media review queue", starter: false, pro: true, elite: true },
  { label: "Biometric baseline tracking", starter: false, pro: true, elite: true },
  { label: "Weekly digest", starter: false, pro: true, elite: true },
  { label: "White-label athlete app", starter: false, pro: true, elite: true },
  { label: "Multi-coach support", starter: false, pro: false, elite: true },
  { label: "API access", starter: false, pro: false, elite: true },
  { label: "Custom integrations", starter: false, pro: false, elite: true },
  { label: "Dedicated account manager", starter: false, pro: false, elite: true },
];

function Check() {
  return <span style={{ color: AEGEAN, fontWeight: 700 }}>✓</span>;
}
function Dash() {
  return <span style={{ color: INK_MUTE }}>—</span>;
}

export default function PricingPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Pricing</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            Pay for what you use.<br />
            <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Nothing you don't.</em>
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: INK_SOFT, margin: "0 auto", maxWidth: 560 }}>
            14-day free trial on all plans. No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 32px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {PLANS.map(plan => (
            <div
              key={plan.name}
              style={{
                background: plan.featured ? INK : LINEN,
                border: `1px solid ${plan.featured ? INK : RULE}`,
                borderRadius: 4,
                padding: "36px 32px",
                display: "flex", flexDirection: "column",
                position: "relative",
              }}
            >
              {plan.featured && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: TERRA_DEEP, color: PARCHMENT, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 2 }}>
                  Most popular
                </div>
              )}
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: plan.featured ? "oklch(0.75 0.025 60)" : INK_MUTE, marginBottom: 8 }}>{plan.athletes}</div>
              <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: plan.featured ? PARCHMENT : INK, margin: "0 0 4px" }}>{plan.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                <span style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 500, color: plan.featured ? PARCHMENT : INK, lineHeight: 1 }}>{plan.price}</span>
                <span style={{ fontFamily: BODY, fontSize: 14, color: plan.featured ? "oklch(0.68 0.025 60)" : INK_MUTE }}>{plan.period}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: plan.featured ? "oklch(0.60 0.025 60)" : INK_MUTE, marginBottom: 20, letterSpacing: "0.08em" }}>{plan.annualNote}</div>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: plan.featured ? "oklch(0.78 0.020 65)" : INK_SOFT, margin: "0 0 24px", lineHeight: 1.5 }}>{plan.pitch}</p>
              <ul style={{ margin: "0 0 28px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: "flex", gap: 10, fontFamily: BODY, fontSize: 13.5, color: plan.featured ? "oklch(0.88 0.015 65)" : INK_SOFT, lineHeight: 1.4 }}>
                    <span style={{ color: plan.featured ? TERRA_DEEP : AEGEAN, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "12px 16px",
                  background: plan.featured ? TERRA_DEEP : AEGEAN,
                  border: `1px solid ${plan.featured ? TERRA_DEEP : AEGEAN}`,
                  borderRadius: 2,
                  color: PARCHMENT,
                  textDecoration: "none",
                  fontFamily: BODY, fontSize: 14, fontWeight: 600,
                  transition: "opacity 160ms ease",
                }}
              >
                {plan.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Feature comparison table */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px 80px" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: INK, margin: "0 0 32px", textAlign: "center" }}>Full feature comparison</h2>
        <div style={{ border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: INK, padding: "14px 24px", gap: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.70 0.022 60)" }}>Feature</div>
            {["Starter", "Pro", "Elite"].map(p => (
              <div key={p} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.85 0.015 65)", textAlign: "center" }}>{p}</div>
            ))}
          </div>
          {ALL_FEATURES.map((f, i) => (
            <div
              key={f.label}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
                padding: "14px 24px", gap: 8,
                background: i % 2 === 0 ? LINEN : PARCHMENT,
                borderBottom: i < ALL_FEATURES.length - 1 ? `1px solid ${RULE}` : "none",
              }}
            >
              <div style={{ fontFamily: BODY, fontSize: 13.5, color: INK }}>{f.label}</div>
              {([f.starter, f.pro, f.elite] as (boolean | string)[]).map((val, j) => (
                <div key={j} style={{ textAlign: "center", fontFamily: BODY, fontSize: 13, color: INK_SOFT }}>
                  {val === true ? <Check /> : val === false ? <Dash /> : val}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* FAQ callout */}
      <section style={{ background: AEGEAN_WASH, borderTop: `1px solid oklch(0.78 0.045 200)`, borderBottom: `1px solid oklch(0.78 0.045 200)`, padding: "48px 32px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: AEGEAN, marginBottom: 10 }}>Questions before committing?</div>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>
              We answer every message. The FAQ covers billing, privacy, AI, and how coaches actually use Andes day-to-day.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <Link href="/faq" style={{ display: "inline-flex", alignItems: "center", padding: "10px 20px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 13, fontWeight: 600 }}>
              Read the FAQ →
            </Link>
            <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", padding: "10px 18px", background: "transparent", border: `1px solid oklch(0.78 0.045 200)`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 13 }}>
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
