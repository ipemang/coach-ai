"use client";
import Link from "next/link";
import { useState } from "react";
import { MarketingShell } from "../_components/MarketingShell";

const INK        = "oklch(0.28 0.022 55)";
const INK_SOFT   = "oklch(0.42 0.022 60)";
const INK_MUTE   = "oklch(0.58 0.018 65)";
const PARCHMENT  = "oklch(0.965 0.018 85)";
const LINEN      = "oklch(0.925 0.025 78)";
const LINEN_DEEP = "oklch(0.885 0.028 75)";
const RULE       = "oklch(0.80 0.025 70)";
const AEGEAN     = "oklch(0.42 0.080 200)";
const TERRA      = "oklch(0.66 0.135 42)";
const TERRA_DEEP = "oklch(0.52 0.130 38)";
const OCHRE      = "oklch(0.75 0.090 78)";
const OLIVE_DEEP = "oklch(0.38 0.045 125)";
const SERIF      = "'Cormorant Garamond', Georgia, serif";
const BODY       = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO       = "'JetBrains Mono', ui-monospace, monospace";

const COACH_PHASES = [
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

const ATHLETE_STEPS = [
  {
    n: "01", color: AEGEAN,
    title: "You get an invite",
    subtitle: "From your coach. That's all it takes.",
    body: "Your coach sends you an invite via email or WhatsApp. You click the link, set a password, and you're in. No app to download. No account to create from scratch.",
    detail: "The invite pre-fills your name, your coach's details, and the sport you're being coached for. Your first task is just a short onboarding questionnaire — takes about 4 minutes.",
    bullets: [
      "Invite arrives by email or WhatsApp",
      "No app download required",
      "Onboarding questionnaire auto-fills your profile",
      "Your coach is notified the moment you're set up",
    ],
  },
  {
    n: "02", color: TERRA,
    title: "Your morning pulse",
    subtitle: "2–5 questions. Every morning. Takes 90 seconds.",
    body: "Each morning at a time your coach sets, you'll receive a short check-in via WhatsApp. How'd you sleep? Any pain? How's your energy? Answer in your own words — Andes reads it and passes the summary to your coach.",
    detail: "Your coach reviews the pulse data before your session or before making training decisions that day. The more consistently you answer, the more tailored your plan becomes.",
    bullets: [
      "Arrives on WhatsApp — no separate app",
      "Plain language answers, no forms to fill",
      "Data stays private between you and your coach",
      "Missed days are fine — no penalty for life",
    ],
  },
  {
    n: "03", color: OLIVE_DEEP,
    title: "Your coach replies — fast",
    subtitle: "Messages that sound like your coach because they are.",
    body: "When you message your coach, Andes drafts a reply using your coach's voice and your recent training data. Your coach approves it before it sends. You always get a real, considered response.",
    detail: "Nothing sends without your coach's sign-off. Andes makes sure your coach can respond thoughtfully even on busy days — the relationship stays real even as it scales.",
    bullets: [
      "Replies sound like your coach — they review every one",
      "Faster responses, even outside office hours",
      "Your message is read in context of your week",
      "Urgent messages are escalated immediately",
    ],
  },
  {
    n: "04", color: OCHRE,
    title: "Your dashboard",
    subtitle: "See your training, notes, and history in one place.",
    body: "Log in to see your upcoming sessions, your coach's notes from recent calls, your pulse history, and any documents your coach has shared. It's your personal coaching record.",
    detail: "You can upload videos, photos of form, or race-day photos directly in the dashboard. Your coach can review them, annotate, and reply — all without switching apps.",
    bullets: [
      "Session log and upcoming week view",
      "Coach notes from calls and check-ins",
      "Document vault: plans, race schedules, guides",
      "Photo and video upload for form review",
    ],
  },
];

export default function MethodologyPage() {
  const [tab, setTab] = useState<"coach" | "athlete">("coach");

  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Methodology</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            {tab === "coach"
              ? <>Four phases of the <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>relationship</em>, amplified.</>
              : <>Your side of the <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>coaching relationship.</em></>}
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: INK_SOFT, margin: "0 auto 40px", maxWidth: 620 }}>
            {tab === "coach"
              ? "Andes makes you superhuman at the part algorithms can't do — the human side. Your methodology, your voice, your brand."
              : "As an athlete on Andes, your experience is simple: check in each morning, get fast replies from your coach, track your progress in one place."}
          </p>

          {/* Tab switcher */}
          <div style={{ display: "inline-flex", background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: 4, gap: 4 }}>
            {(["coach", "athlete"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontFamily: BODY, fontSize: 13, fontWeight: tab === t ? 600 : 400,
                  padding: "8px 24px", borderRadius: 2, border: "none", cursor: "pointer",
                  background: tab === t ? INK : "transparent",
                  color: tab === t ? PARCHMENT : INK_SOFT,
                  transition: "all 140ms ease",
                  textTransform: "capitalize",
                }}
              >
                {t === "coach" ? "For coaches" : "For athletes"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {tab === "coach" ? (
        <>
          {/* Coach principle section */}
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

          {/* Coach phases */}
          <section style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 80px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {COACH_PHASES.map((phase, i) => (
                <div key={phase.roman} style={{ display: "grid", gridTemplateColumns: i % 2 === 0 ? "1fr 1.2fr" : "1.2fr 1fr", gap: 0, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ order: i % 2 === 0 ? 0 : 1, background: phase.color, padding: "48px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ fontFamily: SERIF, fontSize: 80, lineHeight: 1, color: "oklch(1 0 0 / 0.15)", marginBottom: 12 }}>{phase.roman}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(1 0 0 / 0.6)", marginBottom: 8 }}>{phase.tag}</div>
                    <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, color: "oklch(0.98 0.02 80)", margin: "0 0 20px" }}>{phase.name}</h2>
                    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.5, color: "oklch(1 0 0 / 0.75)", margin: 0 }}>{phase.lede}</p>
                  </div>
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

          {/* Coach CTA */}
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
        </>
      ) : (
        <>
          {/* Athlete intro */}
          <section style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 32px 32px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: AEGEAN, marginBottom: 16 }}>What changes for you</div>
                <h2 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, margin: "0 0 20px", color: INK, lineHeight: 1.1 }}>
                  Almost nothing changes.<br />Your coach just gets better.
                </h2>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.65, color: INK_SOFT, margin: "0 0 20px" }}>
                  You still message your coach on WhatsApp. You still get replies from them. Andes works in the background to make sure those replies come faster, with more context, and with fewer things falling through the cracks.
                </p>
                <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.7, color: INK_SOFT, margin: 0 }}>
                  The main addition to your routine is the morning check-in — a 90-second pulse question that helps your coach understand how you&apos;re arriving to each training day. Everything else is exactly what you already do.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { icon: "→", label: "No new app to download", desc: "Everything happens on WhatsApp + a simple web dashboard." },
                  { icon: "→", label: "Your coach still replies", desc: "Every message is reviewed and approved by your coach before it sends." },
                  { icon: "→", label: "Nothing is shared without consent", desc: "Your data is private to you and your coach. We don't share it." },
                  { icon: "→", label: "You can opt out anytime", desc: "Ask your coach to disable pulse check-ins or delete your data at any time." },
                ].map(item => (
                  <div key={item.label} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "18px 20px", display: "flex", gap: 16 }}>
                    <span style={{ fontFamily: MONO, fontSize: 14, color: AEGEAN, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, lineHeight: 1.55, color: INK_SOFT }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Athlete steps */}
          <section style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 80px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 32, textAlign: "center" }}>Your four-step journey</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
              {ATHLETE_STEPS.map((step, i) => (
                <div key={step.n} style={{ display: "grid", gridTemplateColumns: i % 2 === 0 ? "280px 1fr" : "1fr 280px", background: LINEN }}>
                  <div style={{
                    order: i % 2 === 0 ? 0 : 1,
                    background: step.color, padding: "40px 36px",
                    display: "flex", flexDirection: "column", justifyContent: "center",
                    borderBottom: i < ATHLETE_STEPS.length - 1 ? "1px solid oklch(1 0 0 / 0.12)" : "none",
                  }}>
                    <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: "oklch(1 0 0 / 0.18)", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 14 }}>{step.n}</div>
                    <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: "oklch(0.98 0.02 80)", margin: "0 0 10px", lineHeight: 1.2 }}>{step.title}</h2>
                    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, lineHeight: 1.5, color: "oklch(1 0 0 / 0.70)", margin: 0 }}>{step.subtitle}</p>
                  </div>
                  <div style={{
                    order: i % 2 === 0 ? 1 : 0,
                    padding: "40px 40px",
                    borderBottom: i < ATHLETE_STEPS.length - 1 ? `1px solid ${RULE}` : "none",
                  }}>
                    <p style={{ fontFamily: BODY, fontSize: 14.5, color: INK_SOFT, lineHeight: 1.7, margin: "0 0 14px" }}>{step.body}</p>
                    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14.5, color: INK_MUTE, lineHeight: 1.65, margin: "0 0 20px", borderLeft: `2px solid ${step.color}`, paddingLeft: 14 }}>
                      {step.detail}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {step.bullets.map(b => (
                        <li key={b} style={{ display: "flex", gap: 10, fontFamily: BODY, fontSize: 13.5, color: INK }}>
                          <span style={{ color: step.color, flexShrink: 0 }}>✓</span>{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Athlete CTA */}
          <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, padding: "64px 32px", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Already invited?</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, margin: "0 auto 20px", color: INK, maxWidth: 480, lineHeight: 1.15 }}>
              Set up your profile and start your first check-in.
            </h2>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: "0 auto 32px", maxWidth: 420, lineHeight: 1.5 }}>
              Check your email or WhatsApp for an invite link from your coach. It takes about 4 minutes.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/athlete/join" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
                Enter invite code →
              </Link>
              <Link href="/faq" style={{ display: "inline-flex", alignItems: "center", padding: "12px 24px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
                Read the FAQ
              </Link>
            </div>
          </section>
        </>
      )}
    </MarketingShell>
  );
}
