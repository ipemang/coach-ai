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
const OCHRE     = "oklch(0.75 0.090 78)";
const OLIVE_DEEP= "oklch(0.38 0.045 125)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const STEPS = [
  {
    n: "01",
    color: AEGEAN,
    title: "Connect your WhatsApp",
    subtitle: "Your athletes keep doing what they already do.",
    body: "You connect your WhatsApp Business number to Andes in one click. Athletes don't change anything — they keep messaging you the same way. Andes quietly sits in between, listening and learning.",
    detail: "No new app for athletes. No migration. No disruption to existing relationships. Andes layers on top of the communication channel you already use.",
    points: [
      "5-minute WhatsApp Business API connection",
      "All existing chats preserved",
      "Athletes see no change on their end",
      "Runs alongside any coaching software you already use",
    ],
  },
  {
    n: "02",
    color: TERRA_DEEP,
    title: "Train your voice in 10 minutes",
    subtitle: "Paste 20–30 of your past messages. That's the whole setup.",
    body: "Andes reads your past WhatsApp messages and builds a voice model — your phrasing, your cadence, how direct you are, how you soften difficult feedback. From message one, drafts sound like you.",
    detail: "This is the core technical insight: coaching voice isn't just word choice — it's sentence rhythm, when you use emojis, how you open and close messages, how you handle bad race days vs. breakthroughs.",
    points: [
      "Paste your own messages — no custom configuration",
      "Voice model updates every time you edit a draft",
      "Separate tones for race week vs. base phase (optional)",
      "Private to your account — never shared",
    ],
  },
  {
    n: "03",
    color: OLIVE_DEEP,
    title: "Add your athletes",
    subtitle: "Each gets a personal invite. Done in seconds per athlete.",
    body: "Add athletes by name, email, and WhatsApp number. Andes sends them an invite link. They set a password, complete a short onboarding about their training background, and they're in.",
    detail: "The onboarding questionnaire fills in athlete profiles automatically — target race, training history, injury history, sleep patterns, and goals. You don't have to manually enter anything.",
    points: [
      "Send invites by email or WhatsApp",
      "Athlete onboarding takes < 5 minutes",
      "Profile auto-populates from onboarding answers",
      "Athletes connect their wearable if you request it",
    ],
  },
  {
    n: "04",
    color: OCHRE,
    title: "Set your office hours",
    subtitle: "When you're available. When the AI holds the line.",
    body: "You define your online windows. Inside those hours, you get draft replies to approve. Outside those hours, Andes sends an after-hours message in your voice — taking the note, setting expectations, and flagging anything urgent.",
    detail: "Urgency keywords trigger immediate notifications regardless of office hours. If an athlete messages PAIN or RACE, you hear about it — even at 11pm.",
    points: [
      "Day-by-day schedule with start/end times",
      "Configurable after-hours holding message",
      "Urgency keyword escalation — always on",
      "Full AI autonomy toggle when you need complete coverage",
    ],
  },
  {
    n: "05",
    color: AEGEAN,
    title: "Approve, edit, send",
    subtitle: "Every reply lands in your queue. One tap to send.",
    body: "When an athlete messages, Andes drafts a reply using their training context, your voice model, and their recent biometrics. The draft arrives in your queue. You read it, edit if needed, and send. Or ignore it entirely and write your own.",
    detail: "The queue shows you the athlete's message, their training week, their readiness score, and the draft reply — all on one screen. No context-switching. No searching through chat history.",
    points: [
      "Draft includes training context + biometrics",
      "One-tap approve or edit before sending",
      "Always sent from your number, in your name",
      "Nothing sends without your sign-off",
    ],
  },
  {
    n: "06",
    color: TERRA_DEEP,
    title: "Morning pulse, every day",
    subtitle: "Your athletes check in. You get the full picture before 8am.",
    body: "Every morning, each athlete receives 2–5 questions you configure — readiness, sleep, any pain. Answers flow into your daily briefing. By the time you open WhatsApp, you already know who needs attention today.",
    detail: "The daily briefing is AI-generated: 3–4 sentences synthesizing the whole roster's pulse data, surfacing the 1–2 athletes who need you most. It's the pre-training-call you never had time to prepare.",
    points: [
      "Custom questions per athlete or per phase",
      "Answers arrive via WhatsApp — no app required",
      "Daily briefing generated by 7am",
      "Roster heatmap: red/amber/green readiness at a glance",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>How it works</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            Six steps from setup<br />to <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>superhuman coaching.</em>
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: INK_SOFT, margin: "0 auto", maxWidth: 620 }}>
            Andes takes 30 minutes to set up and pays back hours every day. Here is exactly what happens.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 32px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
          {STEPS.map((step, i) => (
            <div key={step.n} style={{ display: "grid", gridTemplateColumns: i % 2 === 0 ? "320px 1fr" : "1fr 320px", background: LINEN }}>
              {/* Number panel */}
              <div style={{
                order: i % 2 === 0 ? 0 : 1,
                background: step.color,
                padding: "48px 44px",
                display: "flex", flexDirection: "column", justifyContent: "center",
                borderBottom: i < STEPS.length - 1 ? "1px solid oklch(1 0 0 / 0.15)" : "none",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: "oklch(1 0 0 / 0.2)", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 16 }}>{step.n}</div>
                <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: "oklch(0.98 0.02 80)", margin: "0 0 12px", lineHeight: 1.15 }}>{step.title}</h2>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.5, color: "oklch(1 0 0 / 0.72)", margin: 0 }}>{step.subtitle}</p>
              </div>
              {/* Detail panel */}
              <div style={{
                order: i % 2 === 0 ? 1 : 0,
                padding: "48px 44px",
                borderBottom: i < STEPS.length - 1 ? `1px solid ${RULE}` : "none",
              }}>
                <p style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, lineHeight: 1.7, margin: "0 0 16px" }}>{step.body}</p>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: INK_MUTE, lineHeight: 1.65, margin: "0 0 24px", borderLeft: `2px solid ${step.color}`, paddingLeft: 14 }}>
                  {step.detail}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {step.points.map(p => (
                    <li key={p} style={{ display: "flex", gap: 10, fontFamily: BODY, fontSize: 14, color: INK }}>
                      <span style={{ color: step.color, flexShrink: 0 }}>✓</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Integration strip */}
      <section style={{ background: PARCHMENT, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: "48px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 8 }}>Works with</div>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: INK_SOFT, margin: 0 }}>
              Andes reads from the platforms your athletes already use.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {["Garmin Connect", "Strava", "WHOOP", "Oura Ring", "TrainingPeaks", "Wahoo", "Zwift", "Apple Health"].map(name => (
              <span key={name} style={{
                padding: "8px 18px",
                background: LINEN, border: `1px solid ${RULE}`, borderRadius: 2,
                fontFamily: BODY, fontSize: 13, color: INK_SOFT,
              }}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, padding: "72px 32px", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Ready in 30 minutes</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, margin: "0 auto 20px", color: INK, maxWidth: 520, lineHeight: 1.1 }}>
          Start today. Your athletes won't notice anything changed.
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32 }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
            Start 14-day trial →
          </Link>
          <Link href="/methodology" style={{ display: "inline-flex", alignItems: "center", padding: "12px 24px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
            Read the methodology
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
