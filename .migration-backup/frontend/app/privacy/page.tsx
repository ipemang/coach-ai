import Link from "next/link";
import { MarketingShell } from "../_components/MarketingShell";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const LINEN     = "oklch(0.925 0.025 78)";
const LINEN_DEEP= "oklch(0.885 0.028 75)";
const RULE      = "oklch(0.80 0.025 70)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 56, paddingBottom: 56, borderBottom: `1px solid ${RULE}` }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: INK, margin: "0 0 20px" }}>{title}</h2>
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
  ["Introduction", "#introduction"],
  ["What data we collect", "#data-collected"],
  ["How we use your data", "#data-use"],
  ["How we share your data", "#data-sharing"],
  ["Voice cloning & AI", "#voice-ai"],
  ["Cookies & tracking", "#cookies"],
  ["Data retention", "#retention"],
  ["Your rights", "#rights"],
  ["International transfers", "#international"],
  ["Children's data", "#children"],
  ["Third-party services", "#third-party"],
  ["Changes to this notice", "#changes"],
  ["Contact us", "#contact"],
];

export default function PrivacyPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <div style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "56px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Legal</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 16px", color: INK }}>Privacy Notice</h1>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, margin: 0 }}>Last updated: May 2026</p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 32px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 64, alignItems: "start" }}>
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
          <Section id="introduction" title="Introduction">
            <P>Andes.IA is committed to transparency and responsible data stewardship. The privacy of coaches and athletes who entrust their data to us is fundamental to our mission — and in return, that trust is what allows us to build tools that genuinely improve coaching practice.</P>
            <P>This Privacy Notice describes how Andes.IA collects, uses, shares, and protects Personal Data when you use our platform and services. It applies to coaches, athletes, and anyone who visits our website.</P>
            <P><strong>Trust.</strong> We respect the privacy of those who visit our website, sign up for our platform, or interact with our services. We are committed to protecting your Personal Data.</P>
            <P><strong>Transparency.</strong> We want every user to understand what Personal Data we collect, how it may be used, and why it is important to how Andes.IA works.</P>
            <P><strong>Control.</strong> You own your data. We give you tools to access, correct, export, and delete it. Your coaching voice, your athletes' check-ins, your plans — they are yours.</P>
          </Section>

          <Section id="data-collected" title="What data we collect">
            <P><strong>Coaches</strong> — when you create a coach account and use Andes.IA, we collect:</P>
            <UL items={[
              "Contact information: name, email address, phone number.",
              "Account credentials: username and password (stored hashed).",
              "Past WhatsApp messages you paste during voice calibration — used solely to train your personal voice model. These are not shared with other coaches or used to train global models.",
              "Training plans you upload or create within the platform.",
              "Your usage patterns within the platform: which features you use, approval/edit rates on drafts, office hours settings.",
              "Billing information processed by our payment provider (we do not store card numbers directly).",
              "Communications you send to our support team.",
            ]} />
            <P><strong>Athletes</strong> — when a coach adds athletes to Andes.IA, we process:</P>
            <UL items={[
              "Name, WhatsApp number, and email address (provided by the coach).",
              "Check-in messages athletes send via WhatsApp — transcribed, tagged, and surfaced to their coach.",
              "Training plan data associated with the athlete's profile.",
              "Wearable data you choose to connect (Garmin, WHOOP, Oura, Strava, etc.) — only when you authorize the connection.",
              "Sentiment and flag tags generated by our AI based on your messages — visible only to your coach.",
            ]} />
            <P><strong>Website visitors</strong> — when you visit andesai.com, we collect standard web analytics data (page views, referral source, browser type) through cookies. See the <a href="#cookies" style={{ color: AEGEAN }}>Cookies section</a> for details.</P>
          </Section>

          <Section id="data-use" title="How we use your data">
            <P>We use your Personal Data to:</P>
            <UL items={[
              "Provide and operate the Andes.IA platform and services.",
              "Generate AI-drafted replies in your coaching voice — based solely on your own past messages.",
              "Surface athlete check-ins, flags, and sentiment to you as their coach.",
              "Connect and sync wearable data you have authorized.",
              "Send you service communications (account activity, security alerts, product updates).",
              "Improve our platform's accuracy and performance using aggregated, anonymized usage patterns — we do not use individual voice models to train shared AI models.",
              "Process billing and subscription management.",
              "Respond to support inquiries.",
              "Comply with applicable laws.",
            ]} />
            <P>We do not use your Personal Data to serve third-party advertising. We do not sell Personal Data.</P>
          </Section>

          <Section id="data-sharing" title="How we share your data">
            <P>Andes.IA does not rent, lease, or sell your Personal Data. We may share it in the following limited circumstances:</P>
            <UL items={[
              "Service providers: companies that help us operate the platform (cloud hosting, payment processing, email delivery, customer support tooling). These providers process data only on our behalf, under contract, and are prohibited from using it for their own purposes.",
              "Between coach and athlete: athlete check-ins and coach replies are shared between the coach and their athlete — that is the core function of the product.",
              "Wearable integrations: data from connected devices is shared between the device platform and Andes.IA only when you have authorized the connection.",
              "Legal compliance: if required by applicable law, court order, or government authority.",
              "Business transfers: in the event of a merger, acquisition, or sale of assets, Personal Data may transfer to the successor entity. You will be notified as required by law.",
              "With your explicit consent: for any other purpose not listed here.",
            ]} />
          </Section>

          <Section id="voice-ai" title="Voice cloning & AI">
            <P>The voice cloning feature is central to Andes.IA. When you paste past WhatsApp replies during setup, those messages are used to build a personal voice model tied exclusively to your account.</P>
            <UL items={[
              "Your voice model is private — it is never shared with other coaches or used to train shared AI models.",
              "Draft replies are generated using your personal voice model plus context from the athlete's plan and check-in history.",
              "Every draft requires your explicit approval before it is sent. Nothing sends automatically.",
              "If you delete your account, your voice model and all associated training data are deleted.",
              "You can request deletion of your voice model at any time without deleting your account — contact us at the address in the Contact section.",
            ]} />
            <P>Athlete check-in messages processed by our AI are used to generate draft replies and surface flags to coaches. They are not used to train external models or shared with any third party beyond the coach-athlete relationship.</P>
          </Section>

          <Section id="cookies" title="Cookies & tracking">
            <P>Our website uses cookies and similar technologies to understand how visitors use the site and to improve performance. We use:</P>
            <UL items={[
              "Strictly necessary cookies: required for the platform to function (authentication sessions, security tokens).",
              "Analytics cookies: aggregated, anonymized data about page visits and feature usage. We use this to improve the product.",
              "No advertising cookies: we do not use cookies to serve targeted advertising.",
            ]} />
            <P>You can manage cookie preferences through your browser settings. Disabling strictly necessary cookies will prevent you from logging in.</P>
          </Section>

          <Section id="retention" title="Data retention">
            <P>We retain your Personal Data for as long as your account is active and for a reasonable period afterward to fulfill legal obligations, resolve disputes, and enforce agreements.</P>
            <UL items={[
              "Coach accounts: data is retained while the account is active. After deletion, data is purged within 90 days.",
              "Athlete records: retained while the coaching relationship is active. Coaches may delete athlete profiles at any time.",
              "Voice training data: retained as long as the coach account is active. Deleted within 30 days of account deletion.",
              "Billing records: retained for 7 years as required by financial regulations.",
              "Server logs: retained for 90 days for security and debugging purposes.",
            ]} />
          </Section>

          <Section id="rights" title="Your rights">
            <P>Depending on your location, you may have the following rights with respect to your Personal Data:</P>
            <UL items={[
              "Access: request a copy of the Personal Data we hold about you.",
              "Correction: request that inaccurate or incomplete data be corrected.",
              "Deletion: request that your Personal Data be deleted, subject to legal obligations.",
              "Portability: receive your data in a machine-readable format.",
              "Objection: object to certain types of processing.",
              "Restriction: request that we restrict processing of your data in certain circumstances.",
            ]} />
            <P>To exercise any of these rights, contact us at <a href="mailto:felipeddeidan@gmail.com" style={{ color: AEGEAN }}>felipeddeidan@gmail.com</a>. We will respond within 30 days and may ask you to verify your identity before processing the request.</P>
            <P>You may unsubscribe from marketing emails at any time using the unsubscribe link in any email we send.</P>
          </Section>

          <Section id="international" title="International transfers">
            <P>Andes.IA operates globally. Your Personal Data may be processed in countries other than your country of residence, including the United States. These countries may have different data protection laws than your own.</P>
            <P>Where we transfer Personal Data internationally, we take steps to ensure appropriate safeguards are in place, including contractual protections with service providers. If you have questions about cross-border transfers of your data, contact us at the address below.</P>
          </Section>

          <Section id="children" title="Children's data">
            <P>Andes.IA is intended for coaches and athletes who are 16 years of age or older. We do not knowingly collect Personal Data from individuals under 16. If you believe a minor has provided us with Personal Data, contact us immediately and we will delete it.</P>
          </Section>

          <Section id="third-party" title="Third-party services">
            <P>Our platform integrates with third-party services (Garmin, Strava, WHOOP, Oura, WhatsApp, TrainingPeaks, and others). When you authorize a connection, your data flows between that platform and Andes.IA according to the data-sharing agreement you authorized.</P>
            <P>Each third-party integration is governed by its own privacy notice. We encourage you to review the privacy practices of any service you connect to Andes.IA. We are not responsible for the privacy practices of third parties.</P>
          </Section>

          <Section id="changes" title="Changes to this notice">
            <P>We may update this Privacy Notice from time to time. When we do, we will update the date at the top of this page. If the changes are material, we will notify you by email or through a prominent notice in the platform before the changes take effect.</P>
            <P>Continued use of Andes.IA after the effective date of a revised Privacy Notice constitutes your acceptance of the changes.</P>
          </Section>

          <Section id="contact" title="Contact us">
            <P>If you have any questions, concerns, or requests related to this Privacy Notice or the way we handle your Personal Data, please contact us:</P>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "24px 28px", marginTop: 8 }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: INK, marginBottom: 16 }}>Andes.IA</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>Email: </span><a href="mailto:felipeddeidan@gmail.com" style={{ fontFamily: BODY, fontSize: 15, color: AEGEAN, textDecoration: "none" }}>felipeddeidan@gmail.com</a></div>
                <div><span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE }}>Response time: </span><span style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT }}>Within 30 days for privacy requests, within 2 business days for general inquiries</span></div>
              </div>
            </div>
          </Section>
        </article>
      </div>
    </MarketingShell>
  );
}
