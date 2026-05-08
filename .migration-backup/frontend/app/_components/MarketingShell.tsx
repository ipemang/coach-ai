"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const INK        = "oklch(0.28 0.022 55)";
const INK_SOFT   = "oklch(0.42 0.022 60)";
const INK_MUTE   = "oklch(0.58 0.018 65)";
const PARCHMENT  = "oklch(0.965 0.018 85)";
const LINEN      = "oklch(0.925 0.025 78)";
const LINEN_DEEP = "oklch(0.885 0.028 75)";
const RULE       = "oklch(0.80 0.025 70)";
const AEGEAN     = "oklch(0.42 0.080 200)";
const TERRA_DEEP = "oklch(0.52 0.130 38)";
const OCHRE      = "oklch(0.75 0.090 78)";
const SERIF      = "'Cormorant Garamond', Georgia, serif";
const BODY       = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO       = "'JetBrains Mono', ui-monospace, monospace";

function WordMark() {
  return (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
      <svg width="26" height="26" viewBox="0 0 32 32">
        <rect x="2" y="2" width="28" height="28" fill="none" stroke={INK} strokeWidth="1" />
        <g fill="oklch(0.66 0.135 42)" opacity="0.85">
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
      <span style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.01em", color: INK }}>
        Andes<span style={{ color: TERRA_DEEP }}>.</span>IA
      </span>
    </Link>
  );
}

const NAV_LINKS = [
  ["Features", "/features"],
  ["How it works", "/how-it-works"],
  ["Methodology", "/methodology"],
  ["Pricing", "/pricing"],
  ["FAQ", "/faq"],
];

const FOOTER_COLS = [
  {
    head: "Product",
    links: [["Features", "/features"], ["How it works", "/how-it-works"], ["Methodology", "/methodology"], ["Pricing", "/pricing"]],
  },
  {
    head: "For coaches",
    links: [["FAQ", "/faq"], ["Security", "/security"], ["Contact us", "/contact"]],
  },
  {
    head: "Resources",
    links: [["Changelog", "/changelog"], ["Contact", "/contact"]],
  },
  {
    head: "Access",
    links: [["Sign in", "/login"], ["Create account", "/signup"], ["Athlete access", "/athlete/join"]],
  },
];

export function MarketingShell({ children }: { children: ReactNode }) {
  const path = usePathname();

  return (
    <div style={{ minHeight: "100vh", fontFamily: BODY, color: INK, background: PARCHMENT }}>
      {/* Promo bar */}
      <div style={{ background: INK, color: "oklch(0.94 0.015 70)", fontFamily: BODY, fontSize: 13, textAlign: "center", padding: "9px 16px" }}>
        14-day free trial — no card required.{" "}
        <Link href="/contact" style={{ color: OCHRE, textDecoration: "none", fontWeight: 500 }}>
          Talk to us →
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: LINEN, borderBottom: `1px solid ${RULE}`, padding: "14px 32px", display: "flex", alignItems: "center", gap: 24 }}>
        <WordMark />
        <div style={{ display: "flex", gap: 4 }}>
          {NAV_LINKS.map(([label, href]) => (
            <Link key={href} href={href} style={{
              fontFamily: BODY, fontSize: 13, textDecoration: "none", padding: "6px 12px", borderRadius: 2,
              color: path === href ? INK : INK_SOFT,
              fontWeight: path === href ? 600 : 400,
            }}>{label}</Link>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/login" style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textDecoration: "none", padding: "6px 12px" }}>Sign in</Link>
        <Link href="/signup" style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "9px 18px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none" }}>
          Get started →
        </Link>
      </nav>

      {/* Page content */}
      <main>{children}</main>

      {/* Footer */}
      <footer style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 32px 32px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", gap: 48 }}>
          <div>
            <WordMark />
            <p style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6, margin: "16px 0 0", maxWidth: 260 }}>
              An AI coaching assistant built for endurance coaches. Coach · athlete · purpose.
            </p>
          </div>
          {FOOTER_COLS.map((col, i) => (
            <div key={i}>
              <h4 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: INK, margin: "0 0 16px", fontWeight: 600 }}>{col.head}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map(([label, href]) => (
                  <Link key={label} href={href} style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, textDecoration: "none" }}>{label}</Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px", borderTop: `1px solid ${RULE}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>© 2026 Andes.IA</span>
          <div style={{ display: "flex", gap: 20 }}>
            {([["Privacy", "/privacy"], ["Terms", "/terms"], ["Security", "/security"], ["Changelog", "/changelog"]] as [string, string][]).map(([label, href]) => (
              <Link key={label} href={href} style={{ fontFamily: BODY, fontSize: 13, color: INK_MUTE, textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
