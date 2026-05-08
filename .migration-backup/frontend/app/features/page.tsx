import Link from "next/link";
import { MarketingShell } from "../_components/MarketingShell";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const LINEN     = "oklch(0.925 0.025 78)";
const LINEN_DEEP= "oklch(0.885 0.028 75)";
const RULE      = "oklch(0.80 0.025 70)";
const PARCHMENT2= "oklch(0.945 0.022 82)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const AEGEAN_WASH="oklch(0.92 0.030 190)";
const AEGEAN_SOFT="oklch(0.86 0.050 190)";
const TERRA     = "oklch(0.66 0.135 42)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const TERRA_SOFT= "oklch(0.86 0.055 45)";
const OCHRE     = "oklch(0.75 0.090 78)";
const OLIVE_DEEP= "oklch(0.38 0.045 125)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const FEATURES = [
  {
    category: "Communication",
    color: AEGEAN,
    items: [
      { name: "WhatsApp reply drafts", desc: "AI drafts replies to athlete check-ins in your voice. You approve before anything sends." },
      { name: "Voice cloning", desc: "Calibrated from your past 30–50 replies. Learns your phrasing, casing, tone, emoji use." },
      { name: "Voice note transcription", desc: "Athletes send a voice memo. You get a transcript, summary, and draft reply — all in under 60 seconds." },
      { name: "Office-hours mode", desc: "Set quiet hours. Andes queues replies and sends when you're back on." },
      { name: "Reply edit & regenerate", desc: "One tap to edit. One tap to regenerate a different draft. One tap to approve as-is." },
    ],
  },
  {
    category: "Check-ins & monitoring",
    color: TERRA,
    items: [
      { name: "Daily pulse questions", desc: "Personalized morning questions sent in your tone. Tracks sleep, fatigue, motivation, stress." },
      { name: "Ghost detection", desc: "Flags athletes who go quiet for more than their typical pattern. Prompts a coach nudge." },
      { name: "Roster heatmap", desc: "One-glance view of who needs attention, who's tracking well, who has a flag." },
      { name: "Sentiment tagging", desc: "Each check-in is tagged: positive, neutral, concerned, urgent. Surfaces the ones that matter." },
      { name: "Injury risk flags", desc: "Detects language patterns associated with soft-tissue issues, overreaching, burnout." },
    ],
  },
  {
    category: "Training plans",
    color: OLIVE_DEEP,
    items: [
      { name: "Periodized plan generator", desc: "Input goals, key races, and availability. Andes builds a periodized training week in your style." },
      { name: "Plan adaptation", desc: "Missed a session? Andes can suggest how to adjust the week — for your approval." },
      { name: "Bring your own plans", desc: "Import from TrainingPeaks, CSV, or paste. Andes uses your structure, not its own." },
      { name: "Multi-sport support", desc: "Run, tri, cycling, hybrid, strength. Mix as needed for each athlete." },
      { name: "Push to Garmin & TrainingPeaks", desc: "Approved sessions land on the athlete's device or platform automatically." },
    ],
  },
  {
    category: "Data & integrations",
    color: OCHRE,
    items: [
      { name: "Garmin", desc: "Activity files, heart rate, GPS data." },
      { name: "WHOOP", desc: "Recovery score, strain, sleep stages." },
      { name: "Oura", desc: "HRV, sleep quality, readiness score." },
      { name: "Strava", desc: "Activity sync, segment performance." },
      { name: "Wahoo, Zwift, Polar, Suunto, Coros", desc: "One-click connect. New integrations land monthly." },
      { name: "Apple Health", desc: "Step count, sleep, heart rate from iPhone." },
    ],
  },
  {
    category: "Athlete experience",
    color: TERRA_DEEP,
    items: [
      { name: "Athlete web app", desc: "Athletes see their plan, check-in history, and coach messages. Carried under your name." },
      { name: "White-labeling", desc: "Your name, your logo, your colors on every screen the athlete sees." },
      { name: "Progress charts", desc: "TSS, load, monotony, readiness — visualized simply for the athlete." },
      { name: "Weekly plan view", desc: "Calendar-style view of the week's sessions with notes and targets." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Features</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 54, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            Everything coaches need.<br />Nothing they don&apos;t.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>
            Built around the actual workflow of an endurance coach: WhatsApp on the phone, plan in the dashboard, race on the calendar.
          </p>
        </div>
      </section>

      {/* Feature groups */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px 80px", display: "flex", flexDirection: "column", gap: 64 }}>
        {FEATURES.map(group => (
          <div key={group.category}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <div style={{ width: 4, height: 28, background: group.color, borderRadius: 2, flexShrink: 0 }} />
              <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: INK, margin: 0 }}>{group.category}</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {group.items.map(item => (
                <div key={item.name} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "24px" }}>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                    <span style={{ color: group.color, flexShrink: 0, marginTop: 3 }}>✓</span>
                    <h3 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, color: INK, margin: 0, lineHeight: 1.2 }}>{item.name}</h3>
                  </div>
                  <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, padding: "64px 32px", textAlign: "center" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, margin: "0 auto 20px", color: INK, maxWidth: 540 }}>
          Ready to try every feature free for 14 days?
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
            Start free trial →
          </Link>
          <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", padding: "12px 24px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
            Book a walkthrough
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
