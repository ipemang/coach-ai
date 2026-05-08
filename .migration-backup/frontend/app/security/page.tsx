import { MarketingShell } from "../_components/MarketingShell";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const LINEN     = "oklch(0.925 0.025 78)";
const LINEN_DEEP= "oklch(0.885 0.028 75)";
const RULE      = "oklch(0.80 0.025 70)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const AEGEAN_WASH="oklch(0.92 0.030 190)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const OLIVE_DEEP= "oklch(0.38 0.045 125)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

function Section({ id, title, icon, children }: { id: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 56, paddingBottom: 56, borderBottom: `1px solid ${RULE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: INK, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 16px" }}>{children}</p>;
}

function UL({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 16px", paddingLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => <li key={i} style={{ lineHeight: 1.65 }}>{item}</li>)}
    </ul>
  );
}

const TOC = [
  ["Infrastructure", "#infrastructure"],
  ["Data encryption", "#encryption"],
  ["Authentication", "#authentication"],
  ["Voice data isolation", "#voice-isolation"],
  ["Access controls", "#access-controls"],
  ["Third-party integrations", "#third-party"],
  ["Incident response", "#incident-response"],
  ["Responsible disclosure", "#disclosure"],
  ["Contact", "#contact"],
];

const PILLARS = [
  { icon: "🔒", label: "Encrypted at rest", desc: "All data encrypted with AES-256 at the storage layer." },
  { icon: "🔐", label: "Encrypted in transit", desc: "TLS 1.2+ on every connection. No plaintext channels." },
  { icon: "🧱", label: "Isolated voice models", desc: "Your voice model is scoped to your account only. Never shared." },
  { icon: "🕵️", label: "Audit logs", desc: "Every data access and mutation is logged and retained." },
  { icon: "🔑", label: "MFA support", desc: "Multi-factor authentication available on all coach accounts." },
  { icon: "📋", label: "Responsible disclosure", desc: "We take bug reports seriously and respond within 48 hours." },
];

export default function SecurityPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <div style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "56px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Security</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 16px", color: INK }}>How we protect your data</h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>
            Coaches and athletes trust us with sensitive training data. We take that seriously — from the infrastructure up.
          </p>
        </div>
      </div>

      {/* Security pillars */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 64 }}>
          {PILLARS.map(p => (
            <div key={p.label} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "24px" }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{p.icon}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 8 }}>{p.label}</div>
              <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px 64px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 64, alignItems: "start" }}>
        {/* Sticky TOC */}
        <nav style={{ position: "sticky", top: 80 }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 16 }}>Contents</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TOC.map(([label, href]) => (
              <a key={href} href={href} style={{ fontFamily: BODY, fontSize: 13.5, color: INK_SOFT, textDecoration: "none", lineHeight: 1.4 }}>{label}</a>
            ))}
          </div>
        </nav>

        {/* Body */}
        <article>
          <Section id="infrastructure" title="Infrastructure" icon="🏗️">
            <P>Andes.IA is hosted on Railway, which provides managed cloud infrastructure with built-in redundancy, automated backups, and DDoS protection. Our database layer runs on Supabase, a Postgres-based platform with enterprise-grade security controls.</P>
            <UL items={[
              "All production infrastructure runs in isolated environments with no shared tenancy at the application layer.",
              "Database backups are performed daily and retained for 30 days.",
              "Infrastructure changes go through code review before deployment — no manual production access without an audit trail.",
              "We maintain separation between production and staging environments.",
            ]} />
          </Section>

          <Section id="encryption" title="Data encryption" icon="🔒">
            <P>We encrypt data in transit and at rest:</P>
            <UL items={[
              "In transit: all communication between your browser, our API, and third-party services uses TLS 1.2 or higher. We do not support legacy SSL versions.",
              "At rest: all database storage is encrypted using AES-256 at the infrastructure layer.",
              "Passwords: stored exclusively as bcrypt hashes with per-user salts. We never store plaintext passwords.",
              "API keys and secrets: stored using environment-level secrets management. They do not appear in logs, source code, or version control.",
            ]} />
          </Section>

          <Section id="authentication" title="Authentication" icon="🔑">
            <P>Account authentication is handled via Supabase Auth, which provides:</P>
            <UL items={[
              "Email + password login with bcrypt password hashing.",
              "Optional multi-factor authentication (MFA) via authenticator apps — available to all coach accounts.",
              "JWT-based session tokens with short expiry windows and server-side invalidation on logout.",
              "Rate limiting on login attempts to prevent brute-force attacks.",
              "Secure password reset flows with time-limited tokens sent to verified email addresses.",
            ]} />
            <P>We recommend enabling MFA on your Andes.IA account, particularly if you manage a large athlete roster.</P>
          </Section>

          <Section id="voice-isolation" title="Voice data isolation" icon="🎙️">
            <P>Voice cloning is our most sensitive data processing capability. We have built strict isolation to ensure your voice model is never accessible to anyone else:</P>
            <UL items={[
              "Voice training data (your past WhatsApp replies) is stored in a partition scoped exclusively to your account ID.",
              "Your voice model is never used to generate replies for other coaches or athletes outside your account.",
              "Andes.IA engineers do not have access to individual voice model parameters — only aggregate pipeline metrics for debugging.",
              "Training data and voice models are deleted within 30 days of account deletion.",
              "You can request deletion of your voice model at any time without deleting your full account.",
            ]} />
            <P>Athlete check-in messages processed by our AI are used only to generate draft replies for their coach. They are not used to train voice models or shared with any party outside the coach-athlete relationship.</P>
          </Section>

          <Section id="access-controls" title="Access controls" icon="🧱">
            <P>We apply the principle of least privilege throughout our system:</P>
            <UL items={[
              "Coach accounts only see their own athletes, plans, and check-in history. There is no cross-account data access.",
              "Athletes can only see content their coach explicitly shares with them.",
              "Our internal team uses role-based access: engineers have no access to production customer data as part of their standard workflow.",
              "Production database access requires approval, is logged, and is used only for support escalations or incident response.",
              "All internal access is protected by MFA and SSO.",
            ]} />
          </Section>

          <Section id="third-party" title="Third-party integrations" icon="🔗">
            <P>When you connect wearable devices or third-party platforms (Garmin, Strava, WHOOP, Oura, TrainingPeaks, etc.), data flows under the following controls:</P>
            <UL items={[
              "We use OAuth 2.0 for all wearable and platform integrations. We never ask for or store your login credentials for third-party services.",
              "Access tokens are encrypted at rest and rotated according to each provider's refresh policies.",
              "You can revoke any integration at any time from your account settings. Revocation immediately invalidates our stored token.",
              "Third-party data is only used to populate athlete profiles visible to their coach. It is not shared with other coaches or athletes.",
            ]} />
          </Section>

          <Section id="incident-response" title="Incident response" icon="🚨">
            <P>In the event of a security incident affecting your data:</P>
            <UL items={[
              "We will notify affected users within 72 hours of confirming a breach, in compliance with applicable data protection laws.",
              "Notifications will clearly describe what data was affected, what we know about how it happened, and the steps we have taken or are taking to address it.",
              "We maintain an incident response plan that includes containment, forensics, notification, and remediation phases.",
              "Post-incident, we conduct a root cause analysis and publish a summary for affected users where appropriate.",
            ]} />
          </Section>

          <Section id="disclosure" title="Responsible disclosure" icon="🔍">
            <P>We welcome security researchers and the broader community to help us keep Andes.IA secure. If you discover a potential vulnerability:</P>
            <UL items={[
              "Email us at felipeddeidan@gmail.com with subject line: [Security] Vulnerability Report",
              "Describe the issue clearly: what you found, how you found it, and what you believe the impact to be.",
              "Do not publicly disclose the issue until we have confirmed and addressed it — we commit to responding within 48 hours and resolving confirmed vulnerabilities within 30 days.",
              "We will not pursue legal action against good-faith security research conducted in accordance with this policy.",
            ]} />
            <P>We do not currently offer a formal bug bounty program, but we do recognize and thank researchers who report valid vulnerabilities.</P>
          </Section>

          <Section id="contact" title="Contact" icon="✉️">
            <P>Security questions, concerns, or reports:</P>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "24px 28px", marginTop: 8 }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: INK, marginBottom: 16 }}>Andes.IA Security</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>Email: </span>
                  <a href="mailto:felipeddeidan@gmail.com" style={{ fontFamily: BODY, fontSize: 15, color: AEGEAN, textDecoration: "none" }}>felipeddeidan@gmail.com</a>
                </div>
                <div>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>Response SLA: </span>
                  <span style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT }}>48 hours for security reports, 2 business days for general questions</span>
                </div>
                <div>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>Subject line: </span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: INK_SOFT }}>[Security] Vulnerability Report</span>
                </div>
              </div>
            </div>
          </Section>
        </article>
      </div>
    </MarketingShell>
  );
}
