"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingShell } from "./_components/MarketingShell";

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

/* ─── Integration SVG logos ──────────────────────────────────────────────── */
function GarminLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Garmin">
      <circle cx="16" cy="16" r="14" fill="white" opacity="0.18"/>
      <path d="M16 5 L22 17 H18.5 V27 H13.5 V17 H10 Z" fill="white" opacity="0.9"/>
    </svg>
  );
}
function StravaLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Strava">
      <path d="M19 4 L11 18 H15.5 L11 28 L25 14 H20.5 Z" fill="white" opacity="0.9"/>
    </svg>
  );
}
function WhoopLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="WHOOP">
      <path d="M4 9 L9 23 L16 11 L23 23 L28 9" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
    </svg>
  );
}
function OuraLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Oura">
      <circle cx="16" cy="16" r="9" stroke="white" strokeWidth="2.5" opacity="0.9"/>
      <circle cx="16" cy="16" r="4" fill="white" opacity="0.35"/>
    </svg>
  );
}
function TrainingPeaksLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="TrainingPeaks">
      <polyline points="3,24 10,10 17,18 24,7 29,24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
    </svg>
  );
}
function WahooLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Wahoo">
      <path d="M16 4 L9 16 H13 L10 28 L23 12 H19 L22 4 Z" fill="white" opacity="0.9"/>
    </svg>
  );
}
function ZwiftLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Zwift">
      <path d="M5 8 H27 L10 24 H27" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
    </svg>
  );
}
function AppleHealthLogo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-label="Apple Health">
      <path d="M16 27 C16 27 4 19 4 11 C4 7.5 6.7 5 10 5 C12.5 5 14.5 6.3 16 8 C17.5 6.3 19.5 5 22 5 C25.3 5 28 7.5 28 11 C28 19 16 27 16 27 Z" fill="white" opacity="0.9"/>
    </svg>
  );
}

const INTEGRATIONS = [
  { name: "Garmin",        color: "#006B99", Icon: GarminLogo },
  { name: "Strava",        color: "#FC4C02", Icon: StravaLogo },
  { name: "WHOOP",         color: "#0d0d0d", Icon: WhoopLogo },
  { name: "Oura",          color: "#5B3FA8", Icon: OuraLogo },
  { name: "TrainingPeaks", color: "#1E5C97", Icon: TrainingPeaksLogo },
  { name: "Wahoo",         color: "#D93025", Icon: WahooLogo },
  { name: "Zwift",         color: "#E85D04", Icon: ZwiftLogo },
  { name: "Apple Health",  color: "#C0223A", Icon: AppleHealthLogo },
];

/* ─── Pricing sub-component ──────────────────────────────────────────────── */
function PricingSection() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const tiers = [
    { tag: "Starter", price: "$5", sub: "forever", desc: "Up to 3 athletes. Try Andes on a few.", features: ["WhatsApp drafts in your voice", "Plan templates · 4-week build", "Daily check-in summary", "Garmin + Strava sync"], cta: "Start free", primary: false },
    { tag: "Coach", price: period === "yearly" ? "$99" : "$129", strikethrough: period === "yearly" ? "$129" : null, sub: "/ month", desc: "Up to 25 athletes. Everything to run a coaching business.", features: ["— Voice & reply", "Voice cloning for replies", "Sentiment + injury-flag detection", "Office-hours scheduling", "— Plans & data", "Periodized plan generator", "Garmin · WHOOP · Oura · Wahoo", "— Athlete experience", "Athlete mobile web app"], cta: "Start 14-day trial →", primary: true },
    { tag: "Studio", price: period === "yearly" ? "$249" : "$299", strikethrough: period === "yearly" ? "$299" : null, sub: "/ month", desc: "Unlimited athletes. For coaching teams and clubs.", features: ["Everything in Coach", "Multi-coach roster sharing", "Branded athlete portal", "Priority support · 4h SLA"], cta: "Talk to us", primary: false },
  ];
  return (
    <section id="pricing" style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>Pricing</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, margin: "0 0 12px", color: INK }}>Pay for the athletes you coach.</h2>
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: 0 }}>Start free, then a flat monthly fee. Cancel anytime.</p>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
        <div style={{ display: "inline-flex", background: LINEN_DEEP, border: `1px solid ${RULE}`, borderRadius: 4, padding: 4, gap: 4 }}>
          {(["monthly", "yearly"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: "7px 18px", borderRadius: 2, border: "none", cursor: "pointer", fontFamily: BODY, fontSize: 13, fontWeight: 500, background: period === p ? PARCHMENT : "transparent", color: period === p ? INK : INK_MUTE, boxShadow: period === p ? `0 1px 3px oklch(0.3 0.05 60 / 0.12)` : "none" }}>
              {p === "monthly" ? "Monthly" : <span>Yearly <span style={{ background: TERRA_SOFT, color: TERRA_DEEP, borderRadius: 20, padding: "1px 7px", fontSize: 11, marginLeft: 4 }}>−20%</span></span>}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: RULE, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
        {tiers.map(tier => (
          <div key={tier.tag} style={{ background: tier.primary ? AEGEAN : LINEN, color: tier.primary ? "oklch(0.97 0.02 190)" : INK, padding: "36px 32px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.75, marginBottom: 16 }}>{tier.tag}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
              {tier.strikethrough && <span style={{ fontFamily: SERIF, fontSize: 22, opacity: 0.45, textDecoration: "line-through" }}>{tier.strikethrough}</span>}
              <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, lineHeight: 1 }}>{tier.price}</span>
              <span style={{ fontFamily: BODY, fontSize: 14, opacity: 0.6 }}>{tier.sub}</span>
            </div>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, opacity: 0.75, margin: "0 0 24px" }}>{tier.desc}</p>
            <div style={{ borderTop: `1px solid ${tier.primary ? "oklch(1 0 0 / 0.18)" : RULE}`, paddingTop: 20, marginBottom: 28, flex: 1 }}>
              {tier.features.map(f => f.startsWith("—") ? (
                <div key={f} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: tier.primary ? "oklch(0.75 0.05 190)" : INK_MUTE, margin: "14px 0 8px" }}>{f.slice(2).trim()}</div>
              ) : (
                <div key={f} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "flex-start" }}>
                  <span style={{ color: tier.primary ? "oklch(0.82 0.06 190)" : AEGEAN, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/signup" style={{ display: "block", textAlign: "center", padding: "11px 20px", background: tier.primary ? "oklch(1 0 0 / 0.15)" : AEGEAN, color: "oklch(0.97 0.02 190)", border: tier.primary ? "1px solid oklch(1 0 0 / 0.28)" : "none", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── FAQ sub-component ──────────────────────────────────────────────────── */
const FAQ_DATA = [
  { cat: "Getting started", items: [
    { q: "Do my athletes need to install anything?", a: "No. Andes works through WhatsApp. They keep messaging you the same way; you reply faster. The athlete web app is optional." },
    { q: "How long does onboarding take?", a: "About 25 minutes: connect WhatsApp, paste past replies for voice cloning, import your roster. Most coaches send their first AI-drafted reply on day one." },
  ]},
  { cat: "Voice & AI", items: [
    { q: "Will my athletes know it's AI?", a: "Only if you tell them. Replies go from your number, in your phrasing — every one gets your final glance before it leaves." },
    { q: "Is the AI making up training advice?", a: "No. Andes can only propose actions inside the plan structure you've defined. Final word is always yours." },
  ]},
  { cat: "Billing", items: [
    { q: "How does the free trial work?", a: "14 days on the Coach plan, no credit card. At the end you can stay on Starter (up to 3 athletes, free forever) or upgrade." },
    { q: "Can I pause my subscription off-season?", a: "Yes. Pause for up to 4 months — plans, athletes, and history are kept. Resume in one click." },
  ]},
];

function FaqSection() {
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>FAQ</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, margin: "0 0 12px", color: INK }}>Questions, mostly answered.</h2>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: 0 }}>
            More in the <Link href="/onboarding-guide" style={{ color: AEGEAN, textDecoration: "none" }}>onboarding guide</Link> and <Link href="/voice-cloning" style={{ color: AEGEAN, textDecoration: "none" }}>voice cloning guide</Link>.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 40 }}>
          {FAQ_DATA.map((g, i) => (
            <button key={i} onClick={() => { setTab(i); setOpen(0); }} style={{ padding: "7px 16px", border: `1px solid ${tab === i ? AEGEAN : RULE}`, borderRadius: 2, cursor: "pointer", fontFamily: BODY, fontSize: 13, background: tab === i ? AEGEAN_WASH : PARCHMENT, color: tab === i ? AEGEAN : INK_SOFT, fontWeight: tab === i ? 600 : 400 }}>
              {g.cat}
            </button>
          ))}
        </div>
        <div style={{ maxWidth: 760, margin: "0 auto", border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
          {FAQ_DATA[tab].items.map((item, i) => (
            <div key={i} style={{ borderBottom: i < FAQ_DATA[tab].items.length - 1 ? `1px solid ${RULE}` : undefined }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "20px 24px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: INK }}>{item.q}</span>
                <span style={{ fontFamily: MONO, fontSize: 18, color: TERRA_DEEP, flexShrink: 0, transition: "transform 0.2s", transform: open === i ? "rotate(45deg)" : "none" }}>+</span>
              </button>
              {open === i && (
                <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.65, color: INK_SOFT, margin: 0, padding: "0 24px 22px" }}>{item.a}</p>
              )}
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Link href="/contact" style={{ fontFamily: BODY, fontSize: 14, color: AEGEAN, textDecoration: "none" }}>Still have questions? Email us →</Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <MarketingShell>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ ...MOSAIC_BG, padding: "80px 32px 96px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 64, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 20 }}>For endurance coaches</div>
            <h1 style={{ fontFamily: SERIF, fontSize: 60, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK }}>
              Your athletes.<br />Your voice.<br />
              <em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Your AI.</em>
            </h1>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.55, color: INK_SOFT, margin: "0 0 36px", maxWidth: 500 }}>
              Andes.IA is the communication layer for serious endurance coaches. Bring your own methodology — we make you superhuman at the human side: daily check-ins, voice-note replies, and the 11pm &ldquo;I&apos;m exhausted&rdquo; message you&apos;re tired of missing.
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 26px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>Get started →</Link>
              <Link href="/features" style={{ display: "inline-flex", alignItems: "center", padding: "11px 22px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>See all features</Link>
            </div>
            <div style={{ marginTop: 28, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {["Triathlon", "Running", "Cycling", "14-day free trial", "No card required"].map((t, i) => (
                <span key={t} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>
                  {i > 0 && <span style={{ marginRight: 16, opacity: 0.4 }}>·</span>}{t}
                </span>
              ))}
            </div>
          </div>

          {/* Tessera hero card — live coach interface mock */}
          <div style={{ position: "relative", background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, boxShadow: `0 1px 0 oklch(1 0 0 / 0.6) inset, 0 6px 20px -12px oklch(0.3 0.05 60 / 0.25)`, padding: "22px 24px", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: TESSERA_OVERLAY, opacity: 0.6, pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 2, background: AEGEAN_WASH, border: `1px solid ${AEGEAN_SOFT}`, display: "grid", placeItems: "center", fontFamily: SERIF, fontWeight: 500, fontSize: 16, color: AEGEAN, flexShrink: 0 }}>PT</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500 }}>Patrick Torres</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, marginTop: 3 }}>Build phase · Wk 8</div>
                </div>
                <span style={{ background: TERRA_SOFT, border: `1px solid oklch(0.80 0.08 45)`, borderRadius: 2, padding: "2px 9px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: TERRA_DEEP }}>1 Pending</span>
              </div>
              {/* Athlete message */}
              <div style={{ borderLeft: `2px solid ${OCHRE}`, paddingLeft: 12, marginBottom: 14, fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, color: INK_SOFT, lineHeight: 1.55 }}>
                &ldquo;Legs felt heavy on the long run today, but held target pace. Should I rest tomorrow?&rdquo;
              </div>
              {/* AI draft badge */}
              <div style={{ background: PARCHMENT2, border: `1px solid ${RULE_SOFT}`, borderRadius: 2, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 6 }}>Suggested reply · <span style={{ color: TERRA_DEEP }}>in your voice</span></div>
                <p style={{ margin: 0, fontFamily: BODY, fontSize: 13, color: INK, lineHeight: 1.5 }}>Heavy legs after a long run at target pace is a great sign — your body is adapting. Take Tuesday easy, then we&apos;ll see how Thursday&apos;s intervals feel. Trust the process.</p>
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, padding: "10px 16px", background: AEGEAN, color: "oklch(0.97 0.02 190)", border: "none", borderRadius: 2, fontFamily: BODY, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Approve &amp; send</button>
                <button style={{ padding: "10px 18px", background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: 2, fontFamily: BODY, fontSize: 13, color: INK, cursor: "pointer" }}>Edit</button>
              </div>
              {/* Biometric mini-strip */}
              <div style={{ marginTop: 14, display: "flex", gap: 8, paddingTop: 14, borderTop: `1px solid ${RULE_SOFT}` }}>
                {[["HRV", "62", "+4%", AEGEAN], ["Sleep", "7.2h", "−0.3h", OLIVE_DEEP], ["Load", "78", "↑ high", TERRA_DEEP]].map(([label, val, delta, col]) => (
                  <div key={label as string} style={{ flex: 1, background: PARCHMENT, border: `1px solid ${RULE_SOFT}`, borderRadius: 2, padding: "8px 10px" }}>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE }}>{label}</div>
                    <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 500, color: INK, lineHeight: 1.1, marginTop: 2 }}>{val}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: col as string, marginTop: 2 }}>{delta}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ───────────────────────────────────────────── */}
      <div style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 32px", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: INK_MUTE, flexShrink: 0 }}>Trusted by coaches at</span>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
            {[["Cordillera", "Tri"], ["RunSur", ""], ["Pampa", "Endurance"], ["Atacama", "Coaching"], ["Litoral", "Tri Club"]].map(([b, s]) => (
              <span key={b} style={{ fontFamily: SERIF, fontSize: 16, color: INK_SOFT, opacity: 0.78 }}><strong style={{ fontWeight: 600 }}>{b}</strong>{s ? ` ${s}` : ""}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── CYCLICAL DAILY LOOP ──────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>The daily loop</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, margin: "0 0 12px", color: INK }}>
              Every cycle, the AI gets better.<br /><em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Every reply, it learns more of you.</em>
            </h2>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: "0 auto", maxWidth: 540 }}>
              Andes is self-reinforcing. Each approval trains it. Each edit teaches it. The more you use it, the more it sounds like you.
            </p>
          </div>

          <div style={{ position: "relative" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
              {[
                { num: "01", label: "Listen", sublabel: "Athlete checks in", desc: "A voice note or message on WhatsApp. Andes transcribes, tags sentiment, and flags anything urgent.", color: AEGEAN, colorLight: AEGEAN_WASH,
                  graphic: (
                    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" style={{ marginBottom: 12 }}>
                      <circle cx="24" cy="24" r="22" stroke={AEGEAN} strokeWidth="1" opacity="0.3"/>
                      <rect x="18" y="14" width="12" height="18" rx="6" stroke={AEGEAN} strokeWidth="1.8"/>
                      <path d="M12 24 C12 31 18 36 24 36 C30 36 36 31 36 24" stroke={AEGEAN} strokeWidth="1.8" strokeLinecap="round"/>
                      <line x1="24" y1="36" x2="24" y2="42" stroke={AEGEAN} strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  )
                },
                { num: "02", label: "Draft", sublabel: "AI writes in your voice", desc: "Pulls in the training plan, last 7 days, and your voice model. Drafts one reply ready to approve.", color: TERRA, colorLight: TERRA_SOFT,
                  graphic: (
                    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" style={{ marginBottom: 12 }}>
                      <circle cx="24" cy="24" r="22" stroke={TERRA} strokeWidth="1" opacity="0.3"/>
                      <rect x="12" y="14" width="24" height="20" rx="2" stroke={TERRA} strokeWidth="1.8"/>
                      <line x1="16" y1="20" x2="28" y2="20" stroke={TERRA} strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="16" y1="24" x2="32" y2="24" stroke={TERRA} strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="16" y1="28" x2="26" y2="28" stroke={TERRA} strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )
                },
                { num: "03", label: "Decide", sublabel: "You approve & send", desc: "One tap to approve, edit, or regenerate. The reply goes from your number. You stay the coach.", color: OLIVE_DEEP, colorLight: "oklch(0.88 0.025 125)",
                  graphic: (
                    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" style={{ marginBottom: 12 }}>
                      <circle cx="24" cy="24" r="22" stroke={OLIVE_DEEP} strokeWidth="1" opacity="0.3"/>
                      <circle cx="24" cy="24" r="11" stroke={OLIVE_DEEP} strokeWidth="1.8"/>
                      <path d="M18 24 L22 28 L30 20" stroke={OLIVE_DEEP} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )
                },
                { num: "04", label: "Learn", sublabel: "AI improves from your choice", desc: "Each approval or edit is fed back into your voice model. The next draft is already better.", color: OCHRE, colorLight: OCHRE_SOFT,
                  graphic: (
                    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" style={{ marginBottom: 12 }}>
                      <circle cx="24" cy="24" r="22" stroke={OCHRE} strokeWidth="1" opacity="0.3"/>
                      <path d="M14 32 L18 22 L22 27 L27 18 L32 24 L36 16" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="36" cy="16" r="2.5" fill={OCHRE}/>
                    </svg>
                  )
                },
              ].map((step, i) => (
                <div key={step.num} style={{ position: "relative" }}>
                  {i < 3 && (
                    <div style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: "50%" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: INK_MUTE }}>→</span>
                    </div>
                  )}
                  <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "28px 24px", margin: "0 2px", height: "100%", boxSizing: "border-box" }}>
                    {step.graphic}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 2, background: step.colorLight, border: `1px solid ${step.color}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, color: step.color }}>{step.num}</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: step.color, fontWeight: 600 }}>{step.label}</div>
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, color: INK, marginBottom: 10 }}>{step.sublabel}</div>
                    <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
                <div style={{ flex: 1, height: 2, background: `linear-gradient(to right, ${OCHRE}, ${AEGEAN})`, borderRadius: 1 }} />
                <div style={{ background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: 20, padding: "6px 20px", margin: "0 12px", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>↺ The cycle compounds</span>
                  <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: INK_SOFT }}>— more replies approved = better drafts tomorrow</span>
                </div>
                <div style={{ flex: 1, height: 2, background: `linear-gradient(to right, ${AEGEAN}, ${OCHRE})`, borderRadius: 1 }} />
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link href="/onboarding-guide" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: BODY, fontSize: 14, color: AEGEAN, textDecoration: "none" }}>
              See the full onboarding guide →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Feature triptych ─────────────────────────────────────────────── */}
      <section id="features" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>What it does</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, margin: 0, color: INK }}>Three ways Andes makes your week back.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>

          {/* Feature 1 — WhatsApp */}
          <div>
            <div style={{ background: "#ECE5DD", borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
              <div style={{ background: "#075E54", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#25D366", display: "grid", placeItems: "center", fontFamily: BODY, fontSize: 12, fontWeight: 700, color: "#fff" }}>C</div>
                <div>
                  <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: "#fff" }}>Coach (via Andes.IA)</div>
                  <div style={{ fontFamily: BODY, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>online</div>
                </div>
              </div>
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ alignSelf: "flex-start", background: "#fff", borderRadius: "2px 12px 12px 12px", padding: "9px 13px", fontFamily: BODY, fontSize: 13, color: "#333", maxWidth: "85%", lineHeight: 1.45, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                  Should I do tomorrow&apos;s intervals or rest? Legs are toast 😅
                </div>
                <div style={{ alignSelf: "flex-end", background: "#DCF8C6", borderRadius: "12px 2px 12px 12px", padding: "9px 13px", fontFamily: BODY, fontSize: 13, color: "#333", maxWidth: "85%", lineHeight: 1.45, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                  Heavy legs after a long run at pace = your body adapting 💪 Take Tue easy, check in Thu morning. If still there we skip — no stress.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ fontFamily: BODY, fontSize: 10, color: "#667781" }}>10:24 · ✓✓</span>
                </div>
              </div>
            </div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "20px 20px 24px" }}>
              <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: INK }}>Replies in your voice, not a chatbot&apos;s.</h3>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>Andes learns from your past WhatsApp messages. Edit anything, then approve in one tap.</p>
            </div>
          </div>

          {/* Feature 2 — Training plan mosaic */}
          <div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: "4px 4px 0 0", padding: "24px", minHeight: 200 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 12 }}>Week 8 · Build Phase</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "VO₂ Max", sub: "6×4min", bg: TERRA_SOFT, color: TERRA_DEEP, span: 1 },
                  { label: "Threshold", sub: "Build block", bg: AEGEAN_WASH, color: AEGEAN, span: 2 },
                  { label: "Long Run", sub: "32 km", bg: LINEN_DEEP, color: INK, span: 1 },
                  { label: "Recovery", sub: "Easy", bg: OCHRE_SOFT, color: OLIVE_DEEP, span: 1 },
                  { label: "Tempo", sub: "3×8min", bg: TERRA_SOFT, color: TERRA_DEEP, span: 1 },
                ].map((tile, i) => (
                  <div key={i} style={{ background: tile.bg, border: `1px solid ${RULE}`, borderRadius: 2, padding: "10px 12px", gridColumn: tile.span === 2 ? "span 2" : undefined }}>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.10em", textTransform: "uppercase", color: tile.color, fontWeight: 600 }}>{tile.label}</div>
                    <div style={{ fontFamily: SERIF, fontSize: 12, color: tile.color, opacity: 0.75, marginTop: 3 }}>{tile.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "20px 20px 24px" }}>
              <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: INK }}>Personalized plans, written like you&apos;d write them.</h3>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>Set goals, key races, training environment. Andes builds a periodized plan in your style.</p>
            </div>
          </div>

          {/* Feature 3 — Integration logos */}
          <div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: "4px 4px 0 0", padding: "20px", minHeight: 200 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 12 }}>Connected platforms</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {INTEGRATIONS.map(({ name, color, Icon }) => (
                  <div key={name} title={name} style={{ background: color, borderRadius: 4, aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 4px", cursor: "default" }}>
                    <Icon />
                    <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 1.2 }}>{name.replace(" ", "\n")}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "20px 20px 24px" }}>
              <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: INK }}>Connects to the wearables they already wear.</h3>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>One-click sync. Heart rate, HRV, sleep, and completed sessions in one dashboard.</p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <Link href="/features" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", background: LINEN_DEEP, border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
            See all features →
          </Link>
        </div>
      </section>

      {/* ── Methodology strip ─────────────────────────────────────────────── */}
      <div style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: "32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 8 }}>The methodology</div>
            <h3 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: INK, margin: 0 }}>Amplifies your coaching philosophy. Never replaces it.</h3>
          </div>
          <Link href="/methodology" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
            Read the methodology →
          </Link>
        </div>
      </div>

      {/* ── For coaches — dark band ───────────────────────────────────────── */}
      <section id="for-coaches" style={{ background: INK, color: "oklch(0.94 0.015 70)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.68 0.020 70)", marginBottom: 12 }}>For coaches who actually coach</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, margin: "0 auto 16px", color: "oklch(0.96 0.012 80)", maxWidth: 680, lineHeight: 1.15 }}>
              Take your practice to the next level — without working another late night.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {[
              { b: "Save hours weekly", t: " on plan-writing and athlete check-ins." },
              { b: "Grow your roster sustainably", t: " — coach 25, 40, 60 athletes without sacrificing quality." },
              { b: "Spot warning signs early", t: " — overtraining flags and burnout patterns before they escalate." },
              { b: "Replace four tools with one", t: ": TrainingPeaks, WhatsApp, Notion, and the spreadsheet." },
              { b: "Keep your style", t: ". Shaped to your voice, your zones, your coaching philosophy." },
              { b: "Own your data", t: ". CSV export anytime. No lock-in." },
            ].map(item => (
              <div key={item.b} style={{ display: "flex", gap: 14, padding: "18px 0", borderBottom: `1px solid oklch(1 0 0 / 0.08)` }}>
                <span style={{ color: OCHRE, flexShrink: 0, marginTop: 2 }}>✓</span>
                <p style={{ fontFamily: BODY, fontSize: 14, color: "oklch(0.88 0.015 75)", lineHeight: 1.55, margin: 0 }}>
                  <strong style={{ color: "oklch(0.96 0.012 80)", fontWeight: 600 }}>{item.b}</strong>{item.t}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── By the numbers ───────────────────────────────────────────────── */}
      <section style={{ background: PARCHMENT, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>By the numbers</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 500, margin: 0, color: INK }}>What coaches see after 4 weeks.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: RULE, border: `1px solid ${RULE}`, borderRadius: 4, overflow: "hidden" }}>
            {[
              { stat: "2.5h", unit: "/ day", label: "Saved on athlete comms", sub: "Average across active coaches", color: AEGEAN, icon: (
                <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
                  <circle cx="18" cy="18" r="14" stroke={AEGEAN} strokeWidth="1.5" opacity="0.3"/>
                  <path d="M18 10 V18 L23 23" stroke={AEGEAN} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )},
              { stat: "94%", unit: "", label: "Draft approval rate", sub: "After 4 weeks of use", color: OLIVE_DEEP, icon: (
                <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
                  <circle cx="18" cy="18" r="14" stroke={OLIVE_DEEP} strokeWidth="1.5" opacity="0.3"/>
                  <path d="M11 18 L16 23 L25 13" stroke={OLIVE_DEEP} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )},
              { stat: "8s", unit: "", label: "Average draft generation", sub: "From check-in to reply ready", color: TERRA_DEEP, icon: (
                <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
                  <circle cx="18" cy="18" r="14" stroke={TERRA_DEEP} strokeWidth="1.5" opacity="0.3"/>
                  <path d="M20 10 L13 18 H17 L16 26 L23 18 H19 Z" fill={TERRA_DEEP} opacity="0.8"/>
                </svg>
              )},
              { stat: "31", unit: " athletes", label: "Avg roster on paid plans", sub: "Up from 12 before Andes", color: OCHRE, icon: (
                <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
                  <circle cx="18" cy="18" r="14" stroke={OCHRE} strokeWidth="1.5" opacity="0.3"/>
                  <circle cx="14" cy="16" r="3.5" stroke={OCHRE} strokeWidth="1.8"/>
                  <circle cx="22" cy="16" r="3.5" stroke={OCHRE} strokeWidth="1.8"/>
                  <path d="M8 26 C8 22 11 20 14 20 C17 20 19 21 19 21 C19 21 21 20 22 20 C25 20 28 22 28 26" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              )},
            ].map(item => (
              <div key={item.stat} style={{ background: LINEN, padding: "36px 32px" }}>
                <div style={{ marginBottom: 16 }}>{item.icon}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, lineHeight: 1, color: item.color }}>{item.stat}</span>
                  {item.unit && <span style={{ fontFamily: BODY, fontSize: 15, color: INK_MUTE }}>{item.unit}</span>}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: INK_MUTE }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>Coaches say</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 500, margin: 0, color: INK }}>Listen first. Change the plan second.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {[
            { q: "It used to take me two hours every evening to message all 22 of my athletes. Now it's twenty minutes — and the messages sound more like me, not less.", initials: "FL", name: "Francisco L.", sub: "Triathlon · 22 athletes", bg: TERRA_SOFT, c: TERRA_DEEP },
            { q: "I was nervous about the AI replying for me. After two weeks I trust it more than I trust my own typing on the phone at 9pm.", initials: "SL", name: "Sara Lima", sub: "Marathon · 14 athletes", bg: OCHRE_SOFT, c: OLIVE_DEEP },
          ].map(t => (
            <div key={t.initials} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "36px" }}>
              {/* Quote graphic */}
              <svg viewBox="0 0 40 28" width="40" height="28" fill="none" style={{ marginBottom: 20, opacity: 0.3 }}>
                <path d="M0 28 C0 14 6 6 18 0 L20 4 C12 8 8 14 8 20 H16 V28 Z" fill={t.c}/>
                <path d="M22 28 C22 14 28 6 40 0 L42 4 C34 8 30 14 30 20 H38 V28 Z" fill={t.c}/>
              </svg>
              <q style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.6, color: INK, display: "block", marginBottom: 28, quotes: "none" }}>&ldquo;{t.q}&rdquo;</q>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 2, background: t.bg, border: `1px solid ${RULE}`, display: "grid", placeItems: "center", fontFamily: SERIF, fontSize: 14, fontWeight: 500, color: t.c, flexShrink: 0 }}>{t.initials}</div>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: INK }}>{t.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, marginTop: 3 }}>{t.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Integrations full strip ───────────────────────────────────────── */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 64, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Works with</div>
              <h2 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: INK, margin: "0 0 16px", lineHeight: 1.15 }}>Every platform your athletes already use.</h2>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 24px" }}>
                Garmin GPS files, WHOOP recovery scores, Oura ring data, Strava activities — all flow into the athlete profile automatically when they authorize the connection.
              </p>
              <Link href="/features" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: BODY, fontSize: 14, color: AEGEAN, textDecoration: "none", fontWeight: 500 }}>
                See all integrations →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {INTEGRATIONS.map(({ name, color, Icon }) => (
                <div key={name} style={{ background: color, borderRadius: 6, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, boxShadow: `0 2px 8px ${color}40` }}>
                  <Icon />
                  <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.9)", textAlign: "center", lineHeight: 1.3 }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PricingSection />
      <FaqSection />

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(160deg, ${TERRA} 0%, ${TERRA_DEEP} 100%)`, padding: "80px 32px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* Decorative SVG background */}
        <svg viewBox="0 0 800 200" width="100%" height="200" style={{ position: "absolute", bottom: 0, left: 0, opacity: 0.08, pointerEvents: "none" }} aria-hidden>
          <path d="M0 120 Q200 60 400 120 Q600 180 800 100 L800 200 L0 200 Z" fill="white"/>
          <path d="M0 150 Q200 90 400 140 Q600 190 800 130 L800 200 L0 200 Z" fill="white" opacity="0.5"/>
        </svg>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.88 0.05 45)", marginBottom: 20 }}>Ready when you are</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 500, margin: "0 auto 16px", color: "oklch(0.98 0.02 50)", maxWidth: 640, lineHeight: 1.1 }}>
            You stay the coach. <em style={{ fontStyle: "italic" }}>Andes gives you the time back.</em>
          </h2>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: "oklch(0.92 0.03 50)", marginBottom: 36 }}>14 days free. Coach the way you actually want to.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: "oklch(1 0 0 / 0.15)", border: "1px solid oklch(1 0 0 / 0.3)", color: "oklch(0.98 0.02 50)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 15, fontWeight: 600 }}>Get started →</Link>
            <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", background: "transparent", border: "1px solid oklch(1 0 0 / 0.22)", color: "oklch(0.95 0.03 50)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 15 }}>Book a 15-min walkthrough</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
