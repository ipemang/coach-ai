"use client";

import Link from "next/link";
import { useState } from "react";

/* ─── Design tokens ─────────────────────────────────────────────────────── */
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
const OCHRE_SOFT = "oklch(0.92 0.040 82)";
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

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function WordMark() {
  return (
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
  );
}

function Eyebrow({ children, color = TERRA_DEEP }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, letterSpacing: "-0.01em", margin: "0 0 12px", color: INK, lineHeight: 1.1 }}>
      {children}
    </h2>
  );
}

function SectionAside({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: "0 auto", maxWidth: 580 }}>
      {children}
    </p>
  );
}

function FaqGroup({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE, margin: "0 0 16px" }}>{title}</h3>
      {items.map((item, i) => (
        <details key={i} style={{ borderTop: `1px solid ${RULE}`, padding: "0" }}>
          <summary style={{
            cursor: "pointer", padding: "18px 0", listStyle: "none",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontFamily: SERIF, fontSize: 19, fontWeight: 500, color: INK,
          }}>
            {item.q}
            <span style={{ fontFamily: MONO, fontSize: 16, color: TERRA_DEEP, flexShrink: 0, marginLeft: 16 }}>+</span>
          </summary>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.65, color: INK_SOFT, margin: "0 0 20px", maxWidth: 760 }}>
            {item.a}
          </p>
        </details>
      ))}
      <div style={{ borderTop: `1px solid ${RULE}` }} />
    </div>
  );
}

const FAQ_DATA = {
  g: {
    title: "Getting started",
    items: [
      { q: "Do my athletes need to install anything?", a: "No. Andes works through WhatsApp, where your athletes already are. They keep messaging you the same way; you reply faster. The athlete-facing web app is optional and adds a calendar view, daily check-in form, and progress charts." },
      { q: "How long does onboarding take?", a: "A first-time setup is about 25 minutes: connect your WhatsApp, paste a few of your past replies for voice-cloning, import your roster from a CSV or TrainingPeaks. Most coaches send their first AI-drafted reply on day one." },
      { q: "Do I need a technical background?", a: "No. If you can run a roster on TrainingPeaks and a phone, you can run Andes. We have a 1:1 onboarding call on the Coach plan and above." },
    ],
  },
  v: {
    title: "Voice & AI",
    items: [
      { q: "Will my athletes know it's AI?", a: "Only if you tell them. Andes drafts; you approve. Replies go from your number, in your phrasing, with your typos — because every reply gets your final glance before it leaves. Most coaches tell their athletes anyway, and athletes appreciate the candor." },
      { q: "How does voice cloning work?", a: "Paste 30–50 of your past WhatsApp replies during onboarding. Andes learns your phrasing, casing, use of emoji, common abbreviations, and how you tend to soften or push. It improves as you edit drafts." },
      { q: "Is the AI making up training advice?", a: "No. Andes can only propose actions inside the plan structure you've defined for that athlete. It can suggest moving a session, swapping intensities, or adding a recovery day — and it shows its reasoning. It doesn't invent training principles. Final word is always yours." },
    ],
  },
  d: {
    title: "Data & integrations",
    items: [
      { q: "Which wearables and platforms do you connect to?", a: "Garmin, Wahoo, Polar, Suunto, Coros, Apple Health, WHOOP, Oura, Strava, Zwift, TrainingPeaks, Final Surge. New ones land monthly — vote in-app for what's next." },
      { q: "Where is my athlete data stored?", a: "EU and US datacenters with at-rest encryption. Athlete records and chat history export to CSV anytime — no lock-in. We do not sell or share data with third parties." },
      { q: "Can I bring my own plan templates?", a: "Yes. Import any plan you've written before — TrainingPeaks .ZWO, plain CSV, or paste-from-document — and Andes will use it as a starting point for that athlete cohort." },
    ],
  },
  b: {
    title: "Billing",
    items: [
      { q: "How does the free trial work?", a: "14 days on the Coach plan, no credit card. At the end you can stay on Starter (up to 3 athletes, free forever) or upgrade. We'll remind you a few days before — no auto-charges." },
      { q: "What if I have more than 25 athletes?", a: "You'll want Studio (unlimited athletes, multi-coach). If you're a coaching team of 5+, talk to us about federation pricing." },
      { q: "Can I pause my subscription off-season?", a: "Yes. Pause for up to 4 months — your plans, athletes, and history are kept. Resume in one click." },
    ],
  },
};

function PricingSection() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");

  const tiers = [
    {
      tag: "Starter",
      price: "$5",
      sub: "forever",
      desc: "Up to 3 athletes. Try Andes on a few.",
      features: ["WhatsApp drafts in your voice", "Plan templates · 4-week build", "Daily check-in summary", "Garmin + Strava sync", "1 coach seat"],
      cta: "Start free",
      primary: false,
    },
    {
      tag: "Coach",
      price: period === "yearly" ? "$99" : "$129",
      strikethrough: period === "yearly" ? "$129" : null,
      sub: "/ month",
      desc: "Up to 25 athletes. Everything you need to run a coaching business.",
      features: [
        "— Voice & reply",
        "Voice cloning for replies",
        "Sentiment + injury-flag detection",
        "Office-hours scheduling",
        "— Plans & data",
        "Periodized plan generator",
        "Garmin · WHOOP · Oura · Wahoo",
        "Execution score + load chart",
        "— Athlete experience",
        "Athlete mobile web app",
        "Push to TrainingPeaks & Garmin",
      ],
      cta: "Start 14-day trial →",
      primary: true,
    },
    {
      tag: "Studio",
      price: period === "yearly" ? "$249" : "$299",
      strikethrough: period === "yearly" ? "$299" : null,
      sub: "/ month",
      desc: "Unlimited athletes. For coaching teams and clubs.",
      features: ["Everything in Coach", "Multi-coach roster sharing", "Custom plan library", "Branded athlete portal", "Onboarding & migration support", "Priority support · 4h SLA"],
      cta: "Talk to us",
      primary: false,
    },
  ];

  return (
    <section id="pricing" style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <Eyebrow>Pricing</Eyebrow>
        <SectionTitle>Pay for the athletes you coach.</SectionTitle>
        <SectionAside>Start free, then a flat monthly fee. No per-athlete surcharges. Cancel anytime.</SectionAside>
      </div>

      {/* Monthly / Yearly toggle */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
        <div style={{ display: "inline-flex", background: LINEN_DEEP, border: `1px solid ${RULE}`, borderRadius: 4, padding: 4, gap: 4 }}>
          {(["monthly", "yearly"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "7px 18px", borderRadius: 2, border: "none", cursor: "pointer",
              fontFamily: BODY, fontSize: 13, fontWeight: 500,
              background: period === p ? PARCHMENT : "transparent",
              color: period === p ? INK : INK_MUTE,
              boxShadow: period === p ? `0 1px 3px oklch(0.3 0.05 60 / 0.12)` : "none",
            }}>
              {p === "monthly" ? "Monthly" : <>Yearly <span style={{ background: TERRA_SOFT, color: TERRA_DEEP, borderRadius: 20, padding: "1px 7px", fontSize: 11, marginLeft: 4 }}>−20%</span></>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: RULE, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
        {tiers.map(tier => (
          <div key={tier.tag} style={{
            background: tier.primary ? AEGEAN : LINEN,
            color: tier.primary ? "oklch(0.97 0.02 190)" : INK,
            padding: "36px 32px", display: "flex", flexDirection: "column",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.75, marginBottom: 16 }}>{tier.tag}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
              {tier.strikethrough && (
                <span style={{ fontFamily: SERIF, fontSize: 22, opacity: 0.45, textDecoration: "line-through" }}>{tier.strikethrough}</span>
              )}
              <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, lineHeight: 1 }}>{tier.price}</span>
              <span style={{ fontFamily: BODY, fontSize: 14, opacity: 0.6 }}>{tier.sub}</span>
            </div>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, opacity: 0.75, margin: "0 0 24px" }}>{tier.desc}</p>
            <div style={{ borderTop: `1px solid ${tier.primary ? "oklch(1 0 0 / 0.18)" : RULE}`, paddingTop: 20, marginBottom: 28, flex: 1 }}>
              {tier.features.map(f => f.startsWith("—") ? (
                <div key={f} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: tier.primary ? "oklch(0.75 0.05 190)" : INK_MUTE, margin: "14px 0 8px" }}>
                  {f.slice(2).trim()}
                </div>
              ) : (
                <div key={f} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "flex-start" }}>
                  <span style={{ color: tier.primary ? "oklch(0.82 0.06 190)" : AEGEAN, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/signup" style={{
              display: "block", textAlign: "center", padding: "11px 20px",
              background: tier.primary ? "oklch(1 0 0 / 0.15)" : AEGEAN,
              color: "oklch(0.97 0.02 190)",
              border: tier.primary ? "1px solid oklch(1 0 0 / 0.28)" : "none",
              borderRadius: 2, textDecoration: "none",
              fontFamily: BODY, fontSize: 14, fontWeight: 600,
            }}>
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: INK_SOFT, marginTop: 24 }}>
        Coaching team of 5+?{" "}
        <Link href="/signup" style={{ color: AEGEAN, textDecoration: "none" }}>We have a plan for federations and brands →</Link>
      </p>
    </section>
  );
}

function FaqSection() {
  type TabKey = "all" | "g" | "v" | "d" | "b";
  const [tab, setTab] = useState<TabKey>("all");
  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "g", label: "Getting started" },
    { key: "v", label: "Voice & AI" },
    { key: "d", label: "Data & integrations" },
    { key: "b", label: "Billing" },
  ];

  return (
    <section id="faq" style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <Eyebrow>Frequently asked</Eyebrow>
          <SectionTitle>Questions, mostly answered.</SectionTitle>
          <SectionAside>If yours isn&apos;t here, reply to any onboarding email — we read every one.</SectionAside>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 40, justifyContent: "center" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "7px 16px", border: `1px solid ${tab === t.key ? AEGEAN : RULE}`,
              borderRadius: 2, cursor: "pointer", fontFamily: BODY, fontSize: 13,
              background: tab === t.key ? AEGEAN_WASH : PARCHMENT,
              color: tab === t.key ? AEGEAN : INK_SOFT, fontWeight: tab === t.key ? 600 : 400,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {(Object.entries(FAQ_DATA) as [string, { title: string; items: { q: string; a: string }[] }][])
            .filter(([key]) => tab === "all" || tab === key)
            .map(([key, group]) => (
              <FaqGroup key={key} title={group.title} items={group.items} />
            ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", fontFamily: BODY, color: INK, background: PARCHMENT }}>

      {/* Promo bar */}
      <div style={{ background: INK, color: "oklch(0.94 0.015 70)", fontFamily: BODY, fontSize: 13, textAlign: "center", padding: "9px 16px" }}>
        Coaching season starts here.{" "}
        <Link href="/signup" style={{ color: OCHRE, textDecoration: "none", fontWeight: 500 }}>
          Try Andes.IA free for 14 days →
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: LINEN, borderBottom: `1px solid ${RULE}`, padding: "14px 32px", display: "flex", alignItems: "center", gap: 24 }}>
        <WordMark />
        <div style={{ display: "flex", gap: 4 }}>
          {[["Features", "#features"], ["How it works", "#how-it-works"], ["Methodology", "#methodology"], ["Pricing", "#pricing"], ["FAQ", "#faq"]].map(([label, href]) => (
            <a key={href} href={href} style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textDecoration: "none", padding: "6px 12px", borderRadius: 2 }}>{label}</a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/login" style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textDecoration: "none", padding: "6px 12px" }}>Sign in</Link>
        <Link href="/signup" style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "9px 18px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none" }}>
          Get started →
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ ...MOSAIC_BG, padding: "80px 32px 96px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 64, alignItems: "center" }}>
          <div>
            <Eyebrow>For endurance coaches</Eyebrow>
            <h1 style={{ fontFamily: SERIF, fontSize: 60, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK }}>
              Your athletes.<br />Your voice.<br />
              <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Your AI.</em>
            </h1>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.55, color: INK_SOFT, margin: "0 0 36px", maxWidth: 500 }}>
              Andes.IA is the communication layer for serious endurance coaches.
              Bring your own methodology — we make you superhuman at the human side:
              daily check-ins, voice-note replies, accountability, and the 11pm
              &ldquo;I&apos;m exhausted&rdquo; message you&apos;re tired of missing.
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 26px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
                Get started →
              </Link>
              <a href="#features" style={{ display: "inline-flex", alignItems: "center", padding: "11px 22px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
                See how it works
              </a>
            </div>
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
          <div style={{ position: "relative", background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, boxShadow: `0 1px 0 oklch(1 0 0 / 0.6) inset, 0 6px 20px -12px oklch(0.3 0.05 60 / 0.25)`, padding: "22px 24px", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: TESSERA_OVERLAY, opacity: 0.6, pointerEvents: "none", borderRadius: 4 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 2, background: AEGEAN_WASH, border: `1px solid ${AEGEAN_SOFT}`, display: "grid", placeItems: "center", fontFamily: SERIF, fontWeight: 500, fontSize: 16, color: AEGEAN, flexShrink: 0 }}>PT</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500 }}>Patrick Torres</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, marginTop: 3 }}>Build phase · Wk 8</div>
                </div>
                <span style={{ background: TERRA_SOFT, border: `1px solid oklch(0.80 0.08 45)`, borderRadius: 2, padding: "2px 9px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: TERRA_DEEP }}>1 Pending</span>
              </div>
              <div style={{ borderLeft: `2px solid ${OCHRE}`, paddingLeft: 12, marginBottom: 14, fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, color: INK_SOFT, lineHeight: 1.55 }}>
                &ldquo;Legs felt heavy on the long run today, but held target pace. Should I rest tomorrow?&rdquo;
              </div>
              <div style={{ background: PARCHMENT2, border: `1px solid ${RULE_SOFT}`, borderRadius: 2, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 6 }}>
                  Suggested reply · <span style={{ color: TERRA_DEEP }}>in your voice</span>
                </div>
                <p style={{ margin: 0, fontFamily: BODY, fontSize: 13, color: INK, lineHeight: 1.5 }}>
                  Heavy legs after a long run at target pace is a great sign — your body is adapting.
                  Take Tuesday easy, then we&apos;ll see how Thursday&apos;s intervals feel. Trust the process.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, padding: "10px 16px", background: AEGEAN, color: "oklch(0.97 0.02 190)", border: "none", borderRadius: 2, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Approve &amp; send
                </button>
                <button style={{ padding: "10px 18px", background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: 2, fontFamily: BODY, fontSize: 13, color: INK, cursor: "pointer" }}>
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <div style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 32px", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE, flexShrink: 0 }}>Trusted by coaches at</span>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
            {[["Cordillera", "Tri"], ["RunSur", ""], ["Pampa", "Endurance"], ["Atacama", "Coaching"], ["Litoral", "Tri Club"], ["Patagonia", "Performance"]].map(([b, s]) => (
              <span key={b} style={{ fontFamily: SERIF, fontSize: 16, color: INK_SOFT, opacity: 0.78 }}>
                <strong style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>{b}</strong>{s ? ` ${s}` : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Feature triptych */}
      <section id="features" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <Eyebrow>What it does</Eyebrow>
          <SectionTitle>Three ways Andes makes your week back.</SectionTitle>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {/* Feature 1 — WhatsApp chat */}
          <div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "28px 24px", marginBottom: 20, minHeight: 180 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 16 }}>9:14 · WhatsApp</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ alignSelf: "flex-start", background: LINEN_DEEP, border: `1px solid ${RULE}`, borderRadius: "2px 10px 10px 10px", padding: "9px 14px", fontFamily: BODY, fontSize: 13, color: INK, maxWidth: "85%" }}>
                  Should I do tomorrow&apos;s intervals or rest?
                </div>
                <div style={{ alignSelf: "flex-end", background: AEGEAN, borderRadius: "10px 2px 10px 10px", padding: "9px 14px", fontFamily: BODY, fontSize: 13, color: "oklch(0.97 0.02 190)", maxWidth: "85%" }}>
                  Your legs were heavy — but pace held. Take Tue easy, see how Thu feels.
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, textAlign: "right", opacity: 0.6 }}>drafted in your voice</div>
              </div>
            </div>
            <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: INK }}>Replies in your voice, not a chatbot&apos;s.</h3>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>Andes learns from your past WhatsApp messages and drafts each reply the way you&apos;d say it. Edit anything, then approve in one tap.</p>
          </div>

          {/* Feature 2 — Training plan mosaic */}
          <div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "28px 24px", marginBottom: 20, minHeight: 180 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "auto auto", gap: 8 }}>
                {[
                  { label: "VO₂", bg: TERRA_SOFT, color: TERRA_DEEP, span: 1 },
                  { label: "Threshold · Build", bg: AEGEAN_WASH, color: AEGEAN, span: 2 },
                  { label: "Long Run", bg: LINEN_DEEP, color: INK, span: 1 },
                  { label: "Recover", bg: OCHRE_SOFT, color: OLIVE_DEEP, span: 1 },
                  { label: "Tempo · Race-pace", bg: TERRA_SOFT, color: TERRA_DEEP, span: 1 },
                ].map((tile, i) => (
                  <div key={i} style={{
                    background: tile.bg, border: `1px solid ${RULE}`, borderRadius: 2,
                    padding: "10px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.10em",
                    textTransform: "uppercase", color: tile.color,
                    gridColumn: tile.span === 2 ? "span 2" : undefined,
                  }}>{tile.label}</div>
                ))}
              </div>
            </div>
            <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: INK }}>Personalized plans, written like you&apos;d write them.</h3>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>Set goals, training environment, and key races. Andes builds a periodized plan in your style and adapts it as the athlete responds.</p>
          </div>

          {/* Feature 3 — Integrations */}
          <div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "28px 24px", marginBottom: 20, minHeight: 180, display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start" }}>
              {["Garmin", "Strava", "WHOOP", "Oura", "Wahoo", "Zwift", "TrainingPeaks", "Polar", "Apple Health"].map(name => (
                <span key={name} style={{ background: PARCHMENT2, border: `1px solid ${RULE}`, borderRadius: 20, padding: "5px 12px", fontFamily: BODY, fontSize: 12.5, color: INK_SOFT }}>
                  {name}
                </span>
              ))}
            </div>
            <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: INK }}>Connects to the wearables they already wear.</h3>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>Heart rate, HRV, sleep, completed sessions — in one calm dashboard. No new device. No new app.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <Eyebrow>The daily loop</Eyebrow>
            <SectionTitle>Three steps a day.<br /><em style={{ fontStyle: "italic", color: TERRA_DEEP }}>The AI drafts; you decide.</em></SectionTitle>
            <div style={{ marginTop: 12 }}>
              <SectionAside>Built around how endurance coaches actually work: WhatsApp on the phone, plan in the dashboard, race on the calendar.</SectionAside>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              { num: "01 · Listen", title: "Athlete checks in", body: "A quick voice note or message on WhatsApp — about today's run, their sleep, how they feel. Andes transcribes and tags it.", color: AEGEAN },
              { num: "02 · Draft", title: "Andes drafts a reply", body: "It pulls in the plan, recent workouts, wearable data, and your past replies. Then it writes one in your voice.", color: TERRA },
              { num: "03 · Decide", title: "You approve and send", body: "Edit anything, or send as-is in one tap. The athlete just sees their coach replying — same as ever, just faster.", color: OLIVE_DEEP },
            ].map(step => (
              <div key={step.num} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "28px 28px 32px", boxShadow: `0 1px 0 oklch(1 0 0 / 0.5) inset` }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: step.color, marginBottom: 14, opacity: 0.9 }}>{step.num}</div>
                <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 12px", color: INK }}>{step.title}</h3>
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section id="methodology" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <Eyebrow>The methodology</Eyebrow>
          <SectionTitle>Four phases of the <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>relationship</em>, amplified.</SectionTitle>
          <div style={{ marginTop: 12 }}>
            <SectionAside>Other tools want to replace your coaching judgment with their algorithm. Andes makes you superhuman at the part algorithms can&apos;t do — the human side. Your methodology, your voice, your brand.</SectionAside>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[
            { roman: "i.", tag: "Phase one", name: "Listen", lede: "Hear what the athlete is saying — and what they're not saying.", body: "WhatsApp voice notes, daily pulse questions, the 11pm \"I'm exhausted\" message, the athlete who ghosts for two weeks. Andes catches it all, tags sentiment, and tells you who needs you today.", bullets: ["Voice-note transcription in 9 languages", "Daily pulse questions, in your tone", "Ghost-detection & quiet-injury flags", "Roster heatmap: who needs you today"] },
            { roman: "ii.", tag: "Phase two", name: "Respond", lede: "A reply in your voice, ready before they put the phone down.", body: "Andes drafts every reply in your phrasing, your casing, your softness or push — using your past WhatsApp messages. You approve in one tap. Athletes hear from you, not a chatbot.", bullets: ["Voice cloning from 30+ past replies", "Reply drafts cite the plan + last 7 days", "Edit, regenerate, or send as-is", "Sent from your number, in your name"] },
            { roman: "iii.", tag: "Phase three", name: "Hold", lede: "Accountability is a relationship, not a notification.", body: "Missed sessions, fading consistency, early signs of burnout — Andes nudges the athlete in your voice, escalates to you when it matters, and remembers what you promised in last month's call.", bullets: ["Smart nudges before sessions go cold", "Conversation memory across check-ins", "Escalation rules: when to ping the coach", "Weekly debrief drafts, ready Sunday"] },
            { roman: "iv.", tag: "Phase four", name: "Personalize", lede: "Your methodology, kept yours. Your brand, on every screen.", body: "Andes plugs into the plan platform you already use and never overrides your prescription. The athlete app carries your name, your colors, your photo. Andes is invisible.", bullets: ["Methodology-agnostic: bring your own plans", "White-labeled athlete app & emails", "Multi-sport · run · tri · cycling · hybrid", "Your IP stays your IP. Export anytime."] },
          ].map(phase => (
            <div key={phase.roman} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "32px 36px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
                <span style={{ fontFamily: SERIF, fontSize: 36, color: TERRA, opacity: 0.4, lineHeight: 1, flexShrink: 0 }}>{phase.roman}</span>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 4 }}>{phase.tag}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, color: INK }}>{phase.name}</div>
                </div>
              </div>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: "0 0 12px", lineHeight: 1.5 }}>{phase.lede}</p>
              <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.6, margin: "0 0 20px" }}>{phase.body}</p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {phase.bullets.map(b => (
                  <li key={b} style={{ display: "flex", gap: 8, fontFamily: BODY, fontSize: 13.5, color: INK }}>
                    <span style={{ color: AEGEAN, flexShrink: 0 }}>✓</span>{b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* For coaches — dark band */}
      <section id="for-coaches" style={{ background: INK, color: "oklch(0.94 0.015 70)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.68 0.020 70)", marginBottom: 12 }}>For coaches who actually coach</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, margin: "0 0 16px", color: "oklch(0.96 0.012 80)", maxWidth: 700, marginInline: "auto", lineHeight: 1.15 }}>
              Take your practice to the next level — without working another late night.
            </h2>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: "oklch(0.82 0.018 75)", margin: 0 }}>More athletes, served better, with less of your evening. That&apos;s the whole pitch.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { b: "Save hours weekly", t: "on plan-writing and athlete check-ins — the work you'd otherwise do at 9pm on the couch." },
              { b: "Free up bandwidth", t: "for the human side of coaching: the phone call before the A-race, the conversation about quitting their job to train for Kona." },
              { b: "Grow your roster sustainably", t: "— coach 25, 40, 60 athletes without sacrificing the experience that got them to sign up." },
              { b: "Reduce no-shows and missed sessions", t: "with daily check-ins that actually arrive — and replies that actually feel like you." },
              { b: "Spot warning signs early", t: "— overtraining flags, mood dips, and missed-easy-day patterns before they turn into injuries." },
              { b: "Replace four tools with one", t: ": TrainingPeaks, WhatsApp, Notion, and the spreadsheet you've been meaning to clean up since 2023." },
              { b: "Keep your style", t: ". Andes is shaped to your voice, your zones, your coaching philosophy — not a template borrowed from someone else's book." },
              { b: "Own your data", t: ". Athlete records and chat history export to CSV anytime. No lock-in, no surprises." },
            ].map(item => (
              <div key={item.b} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: `1px solid oklch(1 0 0 / 0.08)` }}>
                <span style={{ color: OCHRE, flexShrink: 0, marginTop: 2 }}>✓</span>
                <p style={{ fontFamily: BODY, fontSize: 14, color: "oklch(0.88 0.015 75)", lineHeight: 1.55, margin: 0 }}>
                  <strong style={{ color: "oklch(0.96 0.012 80)", fontWeight: 600 }}>{item.b}</strong>{item.t}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison — replace vs amplify */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <Eyebrow>The difference</Eyebrow>
          <SectionTitle>Most &ldquo;AI coaching&rdquo; tools <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>replace</em> the coach.<br />Andes amplifies you.</SectionTitle>
          <div style={{ marginTop: 12 }}>
            <SectionAside>If you coach on a closed algorithmic platform, you become a distribution channel for their IP. Andes is the opposite bet: the coach is the product.</SectionAside>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 36 }}>
          <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "36px" }}>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 16 }}>Closed algorithmic platforms</div>
            <h3 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, margin: "0 0 16px", color: INK }}>Their methodology. Their brand. Your athletes.</h3>
            <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 12px" }}>Closed coaching platforms ship a single prescription engine and ask you to coach on top of it. Their algorithm decides the workout. Their brand sits on the athlete's screen. Their training philosophy becomes yours by default.</p>
            <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.65, margin: 0 }}>If you've spent ten years developing your own periodization approach, you can't bring it.</p>
            <div style={{ marginTop: 24, borderTop: `1px solid ${RULE}`, paddingTop: 20, fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_MUTE }}>
              You become a distribution channel for someone else&apos;s IP.
            </div>
          </div>
          <div style={{ background: AEGEAN, borderRadius: 4, padding: "36px", color: "oklch(0.97 0.02 190)" }}>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.75 0.05 190)", marginBottom: 16 }}>Andes.IA</div>
            <h3 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, margin: "0 0 16px" }}>Your methodology. Your brand. Your relationships, supercharged.</h3>
            <p style={{ fontFamily: BODY, fontSize: 14, color: "oklch(0.88 0.03 190)", lineHeight: 1.65, margin: "0 0 12px" }}>Andes is methodology-agnostic. Bring your own plans, your own zones, your own philosophy — Andes makes you superhuman at the part nobody else is solving: the daily check-in, the 11pm message, the athlete who ghosts for two weeks.</p>
            <p style={{ fontFamily: BODY, fontSize: 14, color: "oklch(0.88 0.03 190)", lineHeight: 1.65, margin: 0 }}>The reply lands in your voice. Your IP stays yours, exportable anytime.</p>
            <div style={{ marginTop: 24, borderTop: "1px solid oklch(1 0 0 / 0.18)", paddingTop: 20, fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: "oklch(0.82 0.05 190)" }}>
              The coach is the product. Andes makes you superhuman.
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { label: "Methodology-agnostic", body: "Your periodization, your zones, your philosophy. Andes never overrides your prescription." },
            { label: "Your brand on screen", body: "Athlete app and emails carry your name and colors. Andes stays invisible." },
            { label: "Owns the communication layer", body: "Daily check-ins, voice notes, nudges, escalation. The work no prescription engine touches." },
            { label: "Multi-sport, hybrid, self-coached", body: "Run, tri, cycling, hybrid, off-season. Whatever your athletes train for, Andes works." },
          ].map(w => (
            <div key={w.label} style={{ border: `1px solid ${RULE}`, borderRadius: 4, padding: "20px", background: LINEN }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 8 }}>✦</div>
              <h4 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, margin: "0 0 8px", color: INK }}>{w.label}</h4>
              <p style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, lineHeight: 1.55, margin: 0 }}>{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 64, alignItems: "center" }}>
          <div>
            <Eyebrow color={AEGEAN}>Connections</Eyebrow>
            <h3 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, margin: "6px 0 16px", color: INK, lineHeight: 1.2 }}>The data your athletes already collect, finally in one calm place.</h3>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: INK_SOFT, lineHeight: 1.65, margin: 0 }}>One-click sync with the platforms your roster already uses. New integrations land monthly — tell us what&apos;s missing and we&apos;ll prioritize it.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { name: "Garmin", kind: "Watch · Edge" }, { name: "Strava", kind: "Activities" },
              { name: "WHOOP", kind: "Recovery · Strain" }, { name: "Oura", kind: "Sleep · HRV" },
              { name: "Wahoo", kind: "Bike · HR" }, { name: "Zwift", kind: "Indoor rides" },
              { name: "TrainingPeaks", kind: "Plans · Library" }, { name: "WhatsApp", kind: "Check-ins" },
            ].map(int => (
              <div key={int.name} style={{ background: PARCHMENT, border: `1px solid ${RULE_SOFT}`, borderRadius: 4, padding: "14px 14px" }}>
                <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: INK, marginBottom: 4 }}>{int.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.10em", textTransform: "uppercase", color: INK_MUTE }}>{int.kind}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="voices" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <Eyebrow>Coaches say</Eyebrow>
          <SectionTitle>Listen first.<br />Change the plan second.</SectionTitle>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {[
            { q: "It used to take me two hours every evening to message all 22 of my athletes. Now it's twenty minutes — and the messages sound more like me, not less.", initials: "FD", name: "Felipe Deidan", sub: "Triathlon · 22 athletes", avatarBg: TERRA_SOFT, avatarColor: TERRA_DEEP },
            { q: "I was nervous about the AI replying for me. After two weeks I trust it more than I trust my own typing on the phone at 9pm.", initials: "SL", name: "Sara Lima", sub: "Marathon · 14 athletes", avatarBg: OCHRE_SOFT, avatarColor: OLIVE_DEEP },
          ].map(t => (
            <div key={t.initials} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "36px" }}>
              <q style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: INK, display: "block", marginBottom: 28, quotes: "none" }}>
                &ldquo;{t.q}&rdquo;
              </q>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 2, background: t.avatarBg, border: `1px solid ${RULE}`, display: "grid", placeItems: "center", fontFamily: SERIF, fontSize: 14, fontWeight: 500, color: t.avatarColor, flexShrink: 0 }}>
                  {t.initials}
                </div>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: INK }}>{t.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, marginTop: 3 }}>{t.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* FAQ */}
      <FaqSection />

      {/* Bottom CTA */}
      <section style={{ background: `linear-gradient(160deg, ${TERRA} 0%, ${TERRA_DEEP} 100%)`, padding: "80px 32px", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.88 0.05 45)", marginBottom: 20 }}>Ready when you are</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 500, margin: "0 0 16px", color: "oklch(0.98 0.02 50)", maxWidth: 640, marginInline: "auto", lineHeight: 1.1 }}>
          You stay the coach. <em style={{ fontStyle: "italic" }}>Andes gives you the time back.</em>
        </h2>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: "oklch(0.92 0.03 50)", marginBottom: 36 }}>14 days free. Coach the way you actually want to.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: "oklch(1 0 0 / 0.15)", border: "1px solid oklch(1 0 0 / 0.3)", color: "oklch(0.98 0.02 50)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 15, fontWeight: 600 }}>
            Get started →
          </Link>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: "transparent", border: "1px solid oklch(1 0 0 / 0.22)", color: "oklch(0.95 0.03 50)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 15 }}>
            Book a 15-min walkthrough
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 32px 32px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", gap: 48 }}>
          <div>
            <WordMark />
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6, margin: "16px 0 0", maxWidth: 260 }}>An AI coaching assistant built for endurance coaches. Coach · athlete · purpose.</p>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, marginTop: 20 }}>Made in Bogotá &amp; Buenos Aires</div>
          </div>
          {[
            { head: "Product", links: [["Features", "#features"], ["How it works", "#how-it-works"], ["Methodology", "#methodology"], ["Pricing", "#pricing"], ["Changelog", "#"]] },
            { head: "For coaches", links: [["Onboarding guide", "#"], ["Voice cloning 101", "#"], ["Federation pricing", "#"], ["Coach community", "#"]] },
            { head: "Resources", links: [["FAQ", "#faq"], ["Help center", "#"], ["API & webhooks", "#"], ["Status", "#"]] },
            { head: "Company", links: [["About", "#"], ["Press", "#"], ["Careers", "#"], ["Contact", "#"]] },
          ].map(col => (
            <div key={col.head}>
              <h4 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: INK, margin: "0 0 16px", fontWeight: 600 }}>{col.head}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, textDecoration: "none" }}>{label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px", borderTop: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>© 2026 Andes.IA Labs · S.A.S.</span>
          <div style={{ display: "flex", gap: 20 }}>
            {["Privacy", "Terms", "DPA", "Security"].map(l => (
              <a key={l} href="#" style={{ fontFamily: BODY, fontSize: 13, color: INK_MUTE, textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
