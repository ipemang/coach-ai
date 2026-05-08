"use client";

import { useState } from "react";
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

type Category = "getting-started" | "ai" | "privacy" | "athletes" | "coaches" | "billing";

interface FAQ {
  q: string;
  a: string | React.ReactNode;
}

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "getting-started", label: "Getting started" },
  { id: "coaches",         label: "For coaches" },
  { id: "athletes",        label: "For athletes" },
  { id: "ai",              label: "How the AI works" },
  { id: "privacy",         label: "Privacy & data" },
  { id: "billing",         label: "Billing" },
];

const FAQS: Record<Category, FAQ[]> = {
  "getting-started": [
    {
      q: "What is Andes.IA?",
      a: "Andes.IA is an AI-powered coaching assistant for endurance coaches. It listens to your athletes on WhatsApp, learns how you communicate, drafts replies in your voice, and sends daily check-in questions — so you can coach more athletes without burning out.",
    },
    {
      q: "Do my athletes need to install anything?",
      a: "No. Andes works through WhatsApp. Athletes keep messaging their coach the same way they always have. They receive AI-assisted replies and morning pulse questions via WhatsApp. The athlete web app (for viewing training plans and check-ins) is optional.",
    },
    {
      q: "How long does onboarding take?",
      a: "Most coaches are up and running in under 30 minutes. You paste 20–30 of your past WhatsApp messages so Andes can learn your voice, configure your office hours, and add your athletes. That's it — Andes starts drafting replies from your first athlete message.",
    },
    {
      q: "What sports does Andes support?",
      a: "Andes is methodology-agnostic and sport-agnostic. It works for running, triathlon, cycling, swimming, rowing, and hybrid programs. If your athletes train and communicate, Andes can help.",
    },
    {
      q: "Do I need to know anything about AI to use Andes?",
      a: "Not at all. You don't configure prompts or manage any AI settings. You coach the way you always have — Andes learns from watching you. The only technical step is connecting your WhatsApp Business number during setup.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — 14 days, no credit card required. You get access to all features: voice training, morning pulse, reply drafts, and the full athlete dashboard.",
    },
  ],
  "coaches": [
    {
      q: "Why would I use Andes instead of just replying myself?",
      a: "When you have 5 athletes, you can reply to everyone in minutes. At 20 or 30 athletes, you're spending hours each day just on WhatsApp. Andes doesn't replace your replies — it drafts them in your voice so you approve and send in one tap. You reclaim hours without your athletes noticing the difference.",
    },
    {
      q: "What does 'office hours' mean?",
      a: "Office hours are the windows when you're personally available. Outside those windows, Andes handles incoming messages in your voice — holding the athlete, taking the note, and flagging anything urgent. Athletes always hear from you or your carefully configured understudy. They don't hear from a generic chatbot.",
    },
    {
      q: "What happens if an athlete messages about an injury or emergency?",
      a: "You define urgency keywords (e.g. PAIN, INJURY, RACE, EMERGENCY). If any athlete message contains one, Andes flags it immediately and notifies you — regardless of your office hours. You always know when something can't wait.",
    },
    {
      q: "Can I control every message before it's sent?",
      a: "Yes. Every reply Andes drafts lands in your approval queue. You read it, edit if needed, and send with one tap. Nothing leaves your name without your sign-off. The only exception is after-hours holding messages — those send automatically, because athletes shouldn't wait hours for acknowledgement.",
    },
    {
      q: "Does Andes integrate with my training plan software?",
      a: "Yes. Andes reads your athletes' workouts from platforms like TrainingPeaks, intervals.icu, Garmin Connect, and Strava. Every AI-drafted reply is written against the athlete's actual training week — not a generic response.",
    },
    {
      q: "What does the morning pulse do?",
      a: "Each morning, Andes sends each athlete 2–5 questions you configure (e.g. 'How are your legs feeling today? 1 = very sore, 10 = fresh'). The answers flow into your daily briefing. You see every athlete's readiness score and any flags — before you open WhatsApp.",
    },
    {
      q: "Can I manage athletes who don't use WhatsApp?",
      a: "Currently Andes is optimized for WhatsApp. Athletes without WhatsApp can be added to the system and receive email check-ins, but the real-time voice drafting works best over WhatsApp. Email-first support is on the roadmap.",
    },
    {
      q: "Can I white-label the athlete app with my brand?",
      a: "Yes. The athlete web app carries your name, your colors, and your photo. Andes is invisible to your athletes — they see your coaching brand, not ours.",
    },
    {
      q: "How does the AI learn my coaching voice?",
      a: "During onboarding, you paste 20–30 examples of your past WhatsApp coaching messages. Andes analyzes your phrasing, your sentence length, your level of directness, your softness, and your typical sign-offs. Every draft it writes is run through this voice model. The model improves every time you edit a draft — it learns from your corrections.",
    },
    {
      q: "What is the AI voice setup / onboarding tab?",
      a: "The AI voice setup tab is where you train your voice model. You paste your past messages, review the draft persona that Andes generated, and refine it. You can update it anytime — for instance, if you want a different tone for race week versus base phase.",
    },
    {
      q: "Can multiple coaches use the same account?",
      a: "Multi-coach organizations are on the roadmap. Currently each account is tied to one primary coach persona. Contact us if you need a team plan.",
    },
  ],
  "athletes": [
    {
      q: "How do athletes join?",
      a: "Athletes join via an invite link sent by their coach. There is no public signup — you must be invited by a coach who uses Andes. Once invited, athletes set a password and access their web dashboard.",
    },
    {
      q: "Will athletes know they're talking to AI?",
      a: "This is a question we take seriously. Andes drafts messages in your voice — but coaches approve every message. When you send a reply, it genuinely reflects your judgment, even if Andes drafted it. After-hours holding messages may be fully automated; our recommendation is to mention this to athletes as part of how you work.",
    },
    {
      q: "What does the athlete web app show?",
      a: "Athletes see their weekly training plan, morning pulse history, check-in answers, notes from their coach, and messages. It's a private window into their coaching relationship — not a social platform.",
    },
    {
      q: "Can athletes upload files (DEXA scans, lab results, etc.)?",
      a: "Yes. Athletes and coaches can upload documents to the athlete vault (PDF, TXT, CSV, MD — up to 100 MB). The AI reads uploaded documents and can reference them in coaching replies. DEXA scans, blood panels, race results — all can be attached to an athlete's profile.",
    },
    {
      q: "How do athletes respond to morning pulse questions?",
      a: "Athletes reply to their WhatsApp morning pulse message directly in WhatsApp — the same way they'd reply to any message. No app to open, no login required. Answers flow into the coach's daily briefing automatically.",
    },
  ],
  "ai": [
    {
      q: "What AI model powers Andes?",
      a: "Andes uses Anthropic's Claude models for voice drafting, morning pulse generation, daily briefings, and session note drafting. Claude is one of the leading safety-focused large language models — trained with human feedback and designed to be helpful without being deceptive.",
    },
    {
      q: "Is the AI replacing coaches?",
      a: "No — and this is the core of what Andes believes. The AI cannot assess an athlete's movement, feel the energy in a training camp, or hold the human relationship that makes great coaching transformative. Andes handles the communication overhead so coaches have more time for the things only humans can do. The goal is to make coaches superhuman at scale, not to commoditize their craft.",
    },
    {
      q: "Why AI for coaching communication specifically?",
      a: "The biggest bottleneck for growing coaching practices isn't knowledge — it's bandwidth. A coach with 30 athletes might spend 3–4 hours per day just on WhatsApp. That's time taken from training plan design, video review, and actual athlete relationships. AI is uniquely suited to drafting consistent, personalized communication at scale because it can hold context (past messages, training history, biometrics) and match a person's voice.",
    },
    {
      q: "How does the generate report feature work?",
      a: "The training report generator pulls from the athlete's last 7 days: completed workouts, morning pulse answers, check-in notes, and biometric data. The AI synthesizes this into a structured weekly summary in your voice — ready for you to review, edit, and share with the athlete or use in your own planning.",
    },
    {
      q: "What happens when the AI doesn't have enough context?",
      a: "Andes tells you. If it can't draft a meaningful reply (e.g. the athlete's training context is too sparse), it surfaces this in the queue and invites you to write manually. It never sends a generic response to cover its own uncertainty.",
    },
    {
      q: "Can the AI make coaching errors?",
      a: "Yes — any AI can produce incorrect or inappropriate suggestions. This is why every reply goes through your approval queue. You are always the final filter. Andes is designed as an amplifier for your judgment, not a replacement for it.",
    },
    {
      q: "Does the AI improve over time?",
      a: "Yes. Your voice model improves every time you edit an AI draft — Andes learns that you prefer certain phrasing, avoid certain words, or use a different tone on race week. The more you use it, the better it reflects you.",
    },
    {
      q: "How was the concept of Andes created?",
      a: "Andes was created by coaches who ran into the same scaling problem: the more athletes they took on, the less personal their coaching became. WhatsApp was becoming a full-time job. The insight was that AI could handle the drafting burden while preserving the human voice — if the voice model was trained correctly. Andes is built around that insight.",
    },
  ],
  "privacy": [
    {
      q: "Where is athlete data stored?",
      a: "All data is stored on Supabase (PostgreSQL), hosted in the US East region (AWS). Data in transit is encrypted with TLS 1.3. Data at rest is encrypted with AES-256. We do not store data on third-party AI providers' servers — requests to Claude are processed in-memory and not retained for training.",
    },
    {
      q: "Does Anthropic use my athletes' messages to train its AI?",
      a: "No. We use Anthropic's API under a data processing agreement that prohibits use of your data for model training. Athlete messages are processed to generate responses and then discarded — they are not retained by Anthropic.",
    },
    {
      q: "Who can see my athletes' WhatsApp messages?",
      a: "Only you (the coach), your athletes, and Andes backend systems. No Andes employee can read individual message content without your explicit consent (e.g., for a support ticket). Access is controlled by Row Level Security in the database — queries from one coach cannot return another coach's data.",
    },
    {
      q: "Is Andes HIPAA compliant?",
      a: "Andes is not currently HIPAA certified. If you work with athletes who require HIPAA-compliant handling of medical data, please contact us. We are working toward a HIPAA-ready offering for sports medicine and clinical performance contexts.",
    },
    {
      q: "Can I export or delete an athlete's data?",
      a: "Yes. You can export an athlete's full profile, check-ins, and training history at any time. You can also permanently delete an athlete from your roster, which removes all associated data from the database. Data deletion is irreversible.",
    },
    {
      q: "How do you handle voice cloning data?",
      a: "Your voice model is built from text examples you paste into Andes — not from audio recordings. The resulting persona prompt is stored encrypted and is never shared across coaches. It is private to your account. You can delete or reset your voice model at any time.",
    },
    {
      q: "What is your data retention policy?",
      a: "Active athlete data is retained for the duration of your subscription. If you cancel, data is retained for 90 days before permanent deletion, giving you time to export. WhatsApp messages are retained in the database for 12 months; older messages are archived in cold storage.",
    },
    {
      q: "Do you share data with third parties?",
      a: "We share data with the following processors: Anthropic (AI inference), Twilio/WhatsApp (message delivery), Supabase (database), and Railway (hosting). We do not sell data to advertisers or data brokers. All processors are bound by data processing agreements.",
    },
    {
      q: "How do athletes consent to AI being used in their coaching?",
      a: "Athletes accept Andes Terms of Service when they create their account, which includes disclosure of AI-assisted communication. We recommend coaches proactively tell athletes how they use Andes — it's a conversation that builds trust, not one that risks it.",
    },
  ],
  "billing": [
    {
      q: "How is Andes priced?",
      a: "Andes is priced per seat (athlete). The Starter plan covers up to 10 athletes; the Pro plan covers up to 30; the Elite plan is unlimited. Annual billing saves 20% versus monthly. See the Pricing page for current rates.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — 14 days, no credit card required. Full access to all features. At the end of the trial, you choose a plan or your account pauses.",
    },
    {
      q: "What happens if I go over my athlete limit?",
      a: "You'll be prompted to upgrade before adding a new athlete. We don't silently block athlete communications — you always have a chance to upgrade first.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. Monthly plans can be cancelled at any time; your access continues until the end of the billing period. Annual plans can be cancelled but are non-refundable after the first 30 days.",
    },
    {
      q: "Do you offer discounts for coaches just starting out?",
      a: "Yes — we have a Starter program for coaches with fewer than 5 athletes at a reduced rate. Contact us at support@andes.ia or use the chat on the login page.",
    },
  ],
};

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: `1px solid ${RULE}`,
        cursor: "pointer",
      }}
      onClick={() => setOpen(o => !o)}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        padding: "20px 0",
        gap: 16,
      }}>
        <h3 style={{
          fontFamily: SERIF, fontSize: 20, fontWeight: 500, margin: 0,
          color: open ? TERRA_DEEP : INK, lineHeight: 1.25,
          transition: "color 120ms ease",
        }}>
          {faq.q}
        </h3>
        <span style={{
          fontFamily: MONO, fontSize: 16, color: open ? TERRA_DEEP : INK_MUTE,
          flexShrink: 0, marginTop: 2, transition: "color 120ms ease",
        }}>
          {open ? "×" : "+"}
        </span>
      </div>
      {open && (
        <div style={{ paddingBottom: 20 }}>
          {typeof faq.a === "string" ? (
            <p style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.7,
              color: INK_SOFT, margin: 0,
            }}>
              {faq.a}
            </p>
          ) : faq.a}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("getting-started");

  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>FAQ</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            Questions, mostly answered.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.6, color: INK_SOFT, margin: "0 auto" }}>
            More detail in the{" "}
            <Link href="/methodology" style={{ color: AEGEAN, textDecoration: "none" }}>methodology</Link>
            {" "}and{" "}
            <Link href="/security" style={{ color: AEGEAN, textDecoration: "none" }}>security</Link>
            {" "}pages.
          </p>
        </div>
      </section>

      {/* Category tabs */}
      <div style={{ borderBottom: `1px solid ${RULE}`, background: PARCHMENT, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px", display: "flex", gap: 4, overflowX: "auto" }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: "14px 18px",
                border: "none",
                borderBottom: activeCategory === cat.id ? `2px solid ${TERRA_DEEP}` : "2px solid transparent",
                background: "transparent",
                fontFamily: BODY, fontSize: 14, fontWeight: activeCategory === cat.id ? 600 : 400,
                color: activeCategory === cat.id ? TERRA_DEEP : INK_MUTE,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 120ms ease",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Questions */}
      <section style={{ maxWidth: 840, margin: "0 auto", padding: "48px 32px 80px" }}>
        <div>
          {FAQS[activeCategory].map((faq, i) => (
            <FAQItem key={i} faq={faq} />
          ))}
        </div>

        {/* Still have questions */}
        <div style={{ marginTop: 56, padding: "32px 40px", background: AEGEAN_WASH, border: `1px solid oklch(0.78 0.045 200)`, borderRadius: 4, textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: AEGEAN, marginBottom: 12 }}>Still have questions?</div>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: INK_SOFT, margin: "0 0 24px" }}>
            We answer every message. Usually within a few hours.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
              Talk to us →
            </Link>
            <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
              Start 14-day trial
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
