import Link from "next/link";
import { MarketingShell } from "../_components/MarketingShell";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const LINEN     = "oklch(0.925 0.025 78)";
const LINEN_DEEP= "oklch(0.885 0.028 75)";
const RULE      = "oklch(0.80 0.025 70)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const AEGEAN_WASH="oklch(0.92 0.030 190)";
const AEGEAN_SOFT="oklch(0.86 0.050 190)";
const TERRA     = "oklch(0.66 0.135 42)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const TERRA_SOFT= "oklch(0.86 0.055 45)";
const OLIVE_DEEP= "oklch(0.38 0.045 125)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const STEPS = [
  {
    num: "01",
    title: "Create your account",
    time: "2 min",
    color: AEGEAN,
    desc: "Sign up with your email. No credit card required — you get 14 days of the Coach plan to explore everything.",
    tips: [
      "Use your coaching email so athletes recognize the sender domain",
      "You can invite team members later from Settings",
    ],
    cta: { label: "Create account →", href: "/signup" },
  },
  {
    num: "02",
    title: "Connect WhatsApp",
    time: "5 min",
    color: TERRA,
    desc: "Link Andes.IA to your WhatsApp Business number. Athlete messages arrive in Andes; your approved replies send from your number.",
    tips: [
      "You need a WhatsApp Business account (free to set up)",
      "Your existing WhatsApp history is not imported — privacy first",
      "You can test with your own number before adding athletes",
    ],
  },
  {
    num: "03",
    title: "Calibrate your voice",
    time: "10 min",
    color: OLIVE_DEEP,
    desc: "Paste 30–50 of your past WhatsApp replies to athlete messages. This is the core of voice cloning — the more examples, the better the match.",
    tips: [
      "Pull from 3–6 months of messages for variety",
      "Include replies across moods: encouraging, corrective, brief, detailed",
      "The AI improves every time you edit or approve a draft",
    ],
    cta: { label: "Read the voice cloning guide →", href: "/voice-cloning" },
  },
  {
    num: "04",
    title: "Import your roster",
    time: "5 min",
    color: TERRA_DEEP,
    desc: "Add athletes from a CSV or invite them directly via WhatsApp link. Each athlete gets a profile where you track their phase, plan, and check-in history.",
    tips: [
      "CSV format: name, email, WhatsApp number, sport",
      "Athletes receive a welcome message in your voice",
      "You can set each athlete's training phase immediately",
    ],
  },
  {
    num: "05",
    title: "Upload or build training plans",
    time: "10–30 min",
    color: AEGEAN,
    desc: "Import your existing plans from TrainingPeaks, CSV, or paste structured text. Or use Andes's plan generator to build a periodized block from scratch.",
    tips: [
      "Plans connect to each athlete's profile",
      "Andes reads the plan when drafting replies — so context is always live",
      "You can maintain a plan library for common athlete types",
    ],
  },
  {
    num: "06",
    title: "Send your first draft",
    time: "1 min",
    color: TERRA,
    desc: "Wait for an athlete check-in, or trigger a test message from your own number. Andes drafts a reply. You read it, tweak if needed, and hit approve.",
    tips: [
      "Most coaches approve the first draft unchanged",
      "If the tone is off, tap 'Regenerate' — the model adapts from your edits",
      "Check-ins you approve or edit are automatically used to improve future drafts",
    ],
  },
];

export default function OnboardingGuidePage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "64px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Onboarding guide</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 20px", color: INK, lineHeight: 1.05 }}>
            You&apos;ll be sending your first AI-drafted reply on day one.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.6, color: INK_SOFT, margin: "0 0 32px" }}>
            Setup takes about 25 minutes total. Here&apos;s exactly what to expect — step by step.
          </p>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {[["6 steps", "from zero to first reply"], ["~25 min", "total setup time"], ["No tech skills", "required"]].map(([val, label]) => (
              <div key={val}>
                <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: AEGEAN }}>{val}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "64px 32px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {STEPS.map((step, i) => (
            <div key={step.num} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 0 }}>
              {/* Connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: 2, background: step.color, display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 11, fontWeight: 600, color: "oklch(0.98 0.02 80)", flexShrink: 0 }}>
                  {step.num}
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: `linear-gradient(to bottom, ${step.color}, ${RULE})`, margin: "6px 0", minHeight: 48 }} />
                )}
              </div>
              {/* Content */}
              <div style={{ paddingBottom: i < STEPS.length - 1 ? 40 : 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
                  <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: INK, margin: 0 }}>{step.title}</h2>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, whiteSpace: "nowrap" }}>~{step.time}</span>
                </div>
                <p style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 16px" }}>{step.desc}</p>
                <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "16px 20px", marginBottom: step.cta ? 16 : 0 }}>
                  {step.tips.map((tip, j) => (
                    <div key={j} style={{ display: "flex", gap: 10, marginBottom: j < step.tips.length - 1 ? 10 : 0 }}>
                      <span style={{ color: step.color, flexShrink: 0 }}>→</span>
                      <span style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.55 }}>{tip}</span>
                    </div>
                  ))}
                </div>
                {step.cta && (
                  <Link href={step.cta.href} style={{ display: "inline-flex", alignItems: "center", fontFamily: BODY, fontSize: 13.5, color: AEGEAN, textDecoration: "none", fontWeight: 500 }}>
                    {step.cta.label}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, padding: "56px 32px", textAlign: "center" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, margin: "0 auto 16px", color: INK, maxWidth: 500 }}>
          Ready to get started?
        </h2>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, marginBottom: 32 }}>Your first 14 days are free. No card needed.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
            Create your account →
          </Link>
          <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", padding: "12px 24px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
            Have questions? Talk to us
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
