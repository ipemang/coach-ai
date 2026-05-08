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
const AEGEAN_WASH="oklch(0.92 0.030 190)";
const TERRA     = "oklch(0.66 0.135 42)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const TERRA_SOFT= "oklch(0.86 0.055 45)";
const OCHRE     = "oklch(0.75 0.090 78)";
const OLIVE_DEEP= "oklch(0.38 0.045 125)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const PHASES = [
  {
    roman: "i.", tag: "Phase one", name: "Listen", color: AEGEAN,
    lede: "Hear what the athlete is saying — and what they're not saying.",
    body: "WhatsApp voice notes, daily pulse questions, the 11pm \"I'm exhausted\" message, the athlete who ghosts for two weeks. Andes catches it all, tags sentiment, joins it with wearable signals, and tells you who needs you today.",
    bullets: ["Voice-note transcription in 9 languages", "Daily pulse questions, in your tone", "Ghost-detection & quiet-injury flags", "Roster heatmap: who needs you today"],
    detail: "Most coaching relationships break down not because the coach lacks knowledge, but because the signal-to-noise ratio gets too high at scale. Andes inverts this: it listens to everything so you don't have to miss anything.",
  },
  {
    roman: "ii.", tag: "Phase two", name: "Respond", color: TERRA,
    lede: "A reply in your voice, ready before they put the phone down.",
    body: "Andes drafts every reply in your phrasing, your casing, your softness or push — using your past WhatsApp messages and your coaching style. You approve in one tap. Athletes hear from you, not a chatbot.",
    bullets: ["Voice cloning from 30+ past replies", "Reply drafts cite the plan + last 7 days", "Edit, regenerate, or send as-is", "Sent from your number, in your name"],
    detail: "Voice cloning isn't about mimicking — it's about preserving the relationship. Your athletes signed up for you. Andes makes sure every message they receive still sounds like the coach they trust.",
  },
  {
    roman: "iii.", tag: "Phase three", name: "Hold", color: OLIVE_DEEP,
    lede: "Accountability is a relationship, not a notification.",
    body: "Missed sessions, fading consistency, early signs of burnout — Andes nudges the athlete in your voice, escalates to you when it matters, and remembers what you promised in last month's call.",
    bullets: ["Smart nudges before sessions go cold", "Conversation memory across check-ins", "Escalation rules: when to ping the coach", "Weekly debrief drafts, ready Sunday"],
    detail: "Accountability at scale is the hardest part of a growing coaching practice. Andes holds the memory so you can hold the relationship — without a CRM, a spreadsheet, or another app to maintain.",
  },
  {
    roman: "iv.", tag: "Phase four", name: "Personalize", color: OCHRE,
    lede: "Your methodology, kept yours. Your brand, on every screen.",
    body: "Andes plugs into the plan platform you already use and never overrides your prescription. The athlete app carries your name, your colors, your photo. Andes is invisible.",
    bullets: ["Methodology-agnostic: bring your own plans", "White-labeled athlete app & emails", "Multi-sport · run · tri · cycling · hybrid", "Your IP stays your IP. Export anytime."],
    detail: "The coaching industry is built on differentiated methodologies. Andes doesn't want to commoditize yours — it wants to amplify it. Your 10 years of periodization thinking stays exactly that: yours.",
  },
];

export default function MethodologyPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Methodology</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            Four phases of the <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>relationship</em>, amplified.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: INK_SOFT, margin: "0 auto", maxWidth: 620 }}>
            Other tools want to replace your coaching judgment with their algorithm. Andes makes you superhuman at the part algorithms can&apos;t do — the human side. Your methodology, your voice, your brand.
          </p>
        </div>
      </section>

      {/* Principle */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: AEGEAN, marginBottom: 16 }}>The core principle</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, margin: "0 0 20px", color: INK, lineHeight: 1.1 }}>
              Bring your system.<br />We amplify it.
            </h2>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.65, color: INK_SOFT, margin: "0 0 20px" }}>
              Andes.IA is not a coaching methodology. It&apos;s an amplifier for whatever methodology you already use — polarized, pyramidal, Lydiard, your own hybrid.
            </p>
            <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.7, color: INK_SOFT, margin: 0 }}>
              We read your athlete&apos;s training context, their week-over-week history, and what they just told you. Then we draft a response as close to what you&apos;d say as possible — and put the final word in your hands every time.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Your voice", desc: "Voice calibration from your own examples. Drafts improve as you approve or edit." },
              { label: "Your plan", desc: "Training plans live inside Andes. Every reply is written against the athlete's actual week." },
              { label: "Your rules", desc: "Recovery weeks, taper protocols, no-contact hours. The AI respects your constraints." },
              { label: "Your call", desc: "You approve every message before it sends. Nothing leaves your name without your sign-off." },
            ].map(item => (
              <div key={item.label} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "20px" }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 8 }}>{item.label}</div>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Phases */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {PHASES.map((phase, i) => (
            <div key={phase.roman} style={{ display: "grid", gridTemplateColumns: i % 2 === 0 ? "1fr 1.2fr" : "1.2fr 1fr", gap: 0, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
              {/* Number panel */}
              <div style={{ order: i % 2 === 0 ? 0 : 1, background: phase.color, padding: "48px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontFamily: SERIF, fontSize: 80, lineHeight: 1, color: "oklch(1 0 0 / 0.15)", marginBottom: 12 }}>{phase.roman}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(1 0 0 / 0.6)", marginBottom: 8 }}>{phase.tag}</div>
                <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, color: "oklch(0.98 0.02 80)", margin: "0 0 20px" }}>{phase.name}</h2>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.5, color: "oklch(1 0 0 / 0.75)", margin: 0 }}>{phase.lede}</p>
              </div>
              {/* Detail panel */}
              <div style={{ order: i % 2 === 0 ? 1 : 0, background: LINEN, padding: "48px 48px" }}>
                <p style={{ fontFamily: BODY, fontSize: 14.5, color: INK_SOFT, lineHeight: 1.7, margin: "0 0 20px" }}>{phase.body}</p>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 24px", borderLeft: `2px solid ${phase.color}`, paddingLeft: 16 }}>{phase.detail}</p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {phase.bullets.map(b => (
                    <li key={b} style={{ display: "flex", gap: 10, fontFamily: BODY, fontSize: 14, color: INK }}>
                      <span style={{ color: phase.color, flexShrink: 0 }}>✓</span>{b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, padding: "64px 32px", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Ready to bring your methodology</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, margin: "0 auto 20px", color: INK, maxWidth: 560 }}>
          Your coaching philosophy deserves a tool built around it.
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32 }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
            Start 14-day trial →
          </Link>
          <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", padding: "12px 24px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
            Talk to us first
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
