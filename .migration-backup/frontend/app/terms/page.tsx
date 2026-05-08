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

function Section({ id, num, title, children }: { id: string; num?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 56, paddingBottom: 56, borderBottom: `1px solid ${RULE}` }}>
      {num && <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 8 }}>{num}</div>}
      <h2 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, color: INK, margin: "0 0 20px" }}>{title}</h2>
      <div style={{ fontFamily: BODY, fontSize: 15, color: INK_SOFT, lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 16px" }}>{children}</p>;
}
function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: "0 0 16px", paddingLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => <li key={i} style={{ lineHeight: 1.65 }}>{item}</li>)}
    </ul>
  );
}
function Caps({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 16px", fontFamily: BODY, fontSize: 13.5, lineHeight: 1.7, color: INK_SOFT, letterSpacing: "0.01em" }}>{children}</p>;
}

const TOC = [
  ["Agreement & eligibility", "#agreement"],
  ["The services", "#services"],
  ["Disclaimers", "#disclaimers"],
  ["1. General", "#general"],
  ["2. Andes.IA content", "#content"],
  ["3. Creating an account", "#account"],
  ["4. Subscription & fees", "#fees"],
  ["5. Your content & voice data", "#user-content"],
  ["6. Acceptable use", "#acceptable-use"],
  ["7. Coaches", "#coaches"],
  ["8. Athletes", "#athletes"],
  ["9. Copyright", "#copyright"],
  ["10. Disclaimers of warranty", "#warranty"],
  ["11. Limitation of liability", "#liability"],
  ["12. Disputes", "#disputes"],
  ["13. Indemnity", "#indemnity"],
  ["14. Modifications", "#modifications"],
  ["Contact", "#contact"],
];

export default function TermsPage() {
  return (
    <MarketingShell>
      {/* Header */}
      <div style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "56px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Legal</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 16px", color: INK }}>Terms of Use</h1>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, margin: 0 }}>Last updated: May 7, 2026</p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 32px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 64, alignItems: "start" }}>
        {/* Sticky TOC */}
        <nav style={{ position: "sticky", top: 80 }}>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 16 }}>Contents</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TOC.map(([label, href]) => (
              <a key={href} href={href} style={{ fontFamily: BODY, fontSize: 13, color: INK_SOFT, textDecoration: "none", lineHeight: 1.4 }}>{label}</a>
            ))}
          </div>
        </nav>

        <article>
          <Section id="agreement" title="Agreement & eligibility">
            <P>PLEASE READ THE FOLLOWING TERMS OF USE CAREFULLY BEFORE USING ANDES.IA. By visiting our website, creating an account, or using any of our services, you agree to be bound by these Terms of Use and our <Link href="/privacy" style={{ color: AEGEAN }}>Privacy Notice</Link>.</P>
            <P>You confirm that you are at least 16 years of age and are eligible to enter into a binding agreement. We do not knowingly collect information from individuals under 16. If you believe a minor has created an account, contact us at <a href="mailto:felipeddeidan@gmail.com" style={{ color: AEGEAN }}>felipeddeidan@gmail.com</a> and we will delete that information promptly.</P>
            <P>These Terms apply to coaches, athletes, and any other users of the Andes.IA platform and website (collectively, "Services").</P>
          </Section>

          <Section id="services" title="The services">
            <P>Andes.IA provides an AI-assisted coaching communication platform including: AI-drafted reply suggestions for WhatsApp messages, voice cloning from coach-provided examples, athlete check-in management, training plan tools, wearable data integration, and a coach dashboard (collectively, the "Services").</P>
            <P>These Terms do not apply to the websites or services of any third party, including WhatsApp, Garmin, Strava, WHOOP, Oura, TrainingPeaks, or any other integration partner. Links to third-party services are provided for convenience. We are not responsible for their content, privacy practices, or availability.</P>
          </Section>

          <Section id="disclaimers" title="Disclaimers">
            <P>Our Services are intended solely for healthy individuals age 16 and over. Andes.IA is not a medical organization. Nothing in our Services constitutes medical advice, medical treatment, or a medical diagnosis — whether delivered by our platform, AI drafts, or any coach using our platform.</P>
            <P>Services are provided as communication and coaching management tools. It is each user's responsibility to ensure they are in a state of health that allows them to safely engage in exercise. Please consult a medical professional before beginning any new exercise or nutrition program.</P>
          </Section>

          <Section id="general" num="1." title="General">
            <P>By using our Services, you agree to be legally bound by these Terms. We may, at any time at our sole discretion, terminate, modify, or alter any aspect of our Services or access to them without prior notice.</P>
            <P>We reserve the right, at our sole discretion and without notice, to terminate your account, refuse access to any part of the Services, or remove content that violates these Terms. Termination may occur without prior notice and we shall not be liable to you or any third party for such termination.</P>
            <P>These Terms remain in full force and effect while you use our Services or have an active account. Our failure to exercise or enforce any right or provision shall not operate as a waiver of that right or provision.</P>
          </Section>

          <Section id="content" num="2." title="Andes.IA content">
            <P>The Services contain information, software, graphics, text, training methodology documentation, AI-generated outputs, interface designs, and other materials owned or licensed by Andes.IA ("Andes.IA Content"), protected by copyright, trademark, trade secret, and other intellectual property rights.</P>
            <P>You may not copy, modify, publish, transmit, distribute, sell, create derivative works of, or exploit any Andes.IA Content without our prior written consent. Specifically, you agree not to:</P>
            <UL items={[
              "Decompile, reverse engineer, or disassemble any part of the Services or attempt to derive source code.",
              "Reproduce, distribute, or publicly display any Andes.IA Content without authorization.",
              "Create a substitute or competing service through use of or access to the Services.",
              "Resell, lease, sublicense, timeshare, or commercially exploit the Services.",
              "Use the Services for any purpose other than their intended use.",
            ]} />
          </Section>

          <Section id="account" num="3." title="Creating an account">
            <P>To access certain features you must create an account. By doing so, you represent that all information you submit is truthful and accurate and that you will maintain its accuracy.</P>
            <P>You are responsible for maintaining the confidentiality of your password and account credentials. You are solely responsible for all activities that occur under your account. Notify us immediately if you believe your account has been accessed without authorization.</P>
            <P>Andes.IA does not screen coaches or athletes, nor does it verify the accuracy of coaching plans, credentials, or qualifications represented on the platform. If you are an athlete, you are responsible for evaluating the quality and appropriateness of coaching you receive.</P>
          </Section>

          <Section id="fees" num="4." title="Subscription & fees">
            <P>Andes.IA offers a free Starter tier and paid subscription plans as described on our Pricing page. By subscribing, you authorize Andes.IA (through its payment processor) to charge your payment method at the designated frequency until you cancel.</P>
            <UL items={[
              "You may cancel your subscription at any time from your account settings or by contacting us at felipeddeidan@gmail.com.",
              "Cancellation stops future billing but does not result in a refund of amounts already charged, unless otherwise required by applicable law.",
              "We reserve the right to change pricing with reasonable notice. Continued use after a price change constitutes acceptance.",
              "We may terminate your account for breach of these Terms or failure to pay.",
              "There will be no retroactive terminations — cancellations take effect at the end of the current billing period.",
            ]} />
          </Section>

          <Section id="user-content" num="5." title="Your content & voice data">
            <P>When you upload or input content into Andes.IA — including past WhatsApp messages for voice calibration, training plans, athlete notes, or other materials (collectively "Your Content") — you grant Andes.IA a limited license to process and use that content solely for the purpose of providing the Services to you.</P>
            <P>Specifically regarding voice calibration data:</P>
            <UL items={[
              "WhatsApp messages you provide for voice cloning are used exclusively to build your personal voice model. They are not used to train shared AI models or shared with other coaches.",
              "Your voice model is private and tied to your account.",
              "Deleting your account results in deletion of your voice model and calibration data within 30 days.",
            ]} />
            <P>You retain all ownership of Your Content. By submitting it, you represent that you have the right to do so and that it does not infringe upon any third party's rights.</P>
            <P>We may use aggregated, anonymized usage data (not Your Content itself) to improve the platform's performance.</P>
          </Section>

          <Section id="acceptable-use" num="6." title="Acceptable use">
            <P>You agree not to use the Services to:</P>
            <UL items={[
              "Transmit content that is unlawful, abusive, defamatory, harassing, obscene, or otherwise objectionable.",
              "Send spam, bulk messages, or unsolicited communications to athletes or other users.",
              "Impersonate any person, entity, or Andes.IA itself.",
              "Upload software viruses or any code designed to disrupt, damage, or limit the functionality of the Services.",
              "Scrape, harvest, or collect data from the Services without authorization.",
              "Use the Services to provide coaching services through channels that circumvent the platform's fee structure.",
              "Violate any applicable local, state, national, or international law or regulation.",
              "Facilitate cheating, doping, or misrepresentation in athletic competition.",
            ]} />
            <P>We reserve the right to investigate suspected violations and take appropriate action, including removing content and terminating accounts, at our sole discretion.</P>
          </Section>

          <Section id="coaches" num="7." title="Coaches">
            <P>If you use Andes.IA as a coach to serve athlete clients, you acknowledge that:</P>
            <UL items={[
              "You are an independent professional and not an employee, agent, or representative of Andes.IA.",
              "You are solely responsible for the quality, accuracy, and appropriateness of coaching advice you provide to athletes, whether drafted by Andes.IA's AI or written by you directly.",
              "Every AI-drafted reply requires your explicit approval before it sends. You bear responsibility for messages sent from your account.",
              "You will maintain appropriate professional credentials, insurance, and standards of conduct as required by your jurisdiction.",
              "You will not use Andes.IA to provide services that you represent as medically supervised without the appropriate credentials and disclosures.",
            ]} />
          </Section>

          <Section id="athletes" num="8." title="Athletes">
            <P>If you use Andes.IA as an athlete (accessing the platform at a coach's invitation):</P>
            <UL items={[
              "Your primary relationship is with your coach, not with Andes.IA.",
              "Andes.IA facilitates communication and plan management but does not endorse, supervise, or verify the coaching you receive.",
              "You are responsible for evaluating whether training advice is appropriate for your health and fitness level.",
              "Always consult a medical professional before beginning or significantly changing a training program.",
            ]} />
          </Section>

          <Section id="copyright" num="9." title="Copyright">
            <P>You may not post, distribute, or reproduce any copyrighted material, trademarks, or proprietary information without prior written consent from the rights holder. We reserve the right to terminate accounts of users who infringe intellectual property rights.</P>
            <P>If you believe content on the Services infringes your copyright, please contact us at <a href="mailto:felipeddeidan@gmail.com" style={{ color: AEGEAN }}>felipeddeidan@gmail.com</a> with a description of the work, the infringing content, your contact information, and a good-faith statement that the use is not authorized.</P>
          </Section>

          <Section id="warranty" num="10." title="Disclaimers of warranty">
            <Caps>THE SERVICES ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR HARMFUL COMPONENTS.</Caps>
            <Caps>AI-GENERATED REPLY DRAFTS ARE SUGGESTIONS ONLY. ANDES.IA MAKES NO WARRANTY AS TO THE ACCURACY, APPROPRIATENESS, OR EFFECTIVENESS OF ANY AI-GENERATED CONTENT FOR ANY PARTICULAR ATHLETE OR SITUATION. COACHES ARE SOLELY RESPONSIBLE FOR REVIEWING AND APPROVING ALL MESSAGES BEFORE THEY ARE SENT.</Caps>
            <Caps>WE ARE NOT RESPONSIBLE FOR THE CONDUCT, ONLINE OR OFFLINE, OF ANY COACH, ATHLETE, OR OTHER USER OF THE SERVICES.</Caps>
          </Section>

          <Section id="liability" num="11." title="Limitation of liability">
            <Caps>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ANDES.IA AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, CONSEQUENTIAL, INCIDENTAL, SPECIAL, PUNITIVE, OR OTHER DAMAGES ARISING FROM (A) YOUR USE OF OR INABILITY TO USE THE SERVICES; (B) ANY AI-GENERATED CONTENT OR COACHING ADVICE; (C) CONDUCT OF ANY COACH, ATHLETE, OR THIRD PARTY; OR (D) ANY OTHER MATTER RELATING TO THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</Caps>
            <Caps>OUR MAXIMUM LIABILITY TO YOU FOR ANY CLAIM ARISING FROM YOUR USE OF THE SERVICES SHALL NOT EXCEED THE AMOUNTS PAID BY YOU TO ANDES.IA IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.</Caps>
            <P>Your sole remedy if you are dissatisfied with any portion of the Services or these Terms is to discontinue use and, where applicable, cancel your subscription.</P>
          </Section>

          <Section id="disputes" num="12." title="Disputes">
            <P>These Terms shall be governed by and construed in accordance with applicable law, without giving effect to any principles of conflicts of law. Any disputes arising from your use of the Services or these Terms shall be resolved through binding individual arbitration, not class action.</P>
            <P><strong>Waiver of class actions.</strong> You and Andes.IA each agree that claims may only be brought on an individual basis, not as a plaintiff or class member in any class or representative action or proceeding.</P>
            <P>If any provision of these Terms is found to be unlawful, void, or unenforceable, that provision shall be deemed severable and shall not affect the validity of the remaining provisions.</P>
          </Section>

          <Section id="indemnity" num="13." title="Indemnity">
            <P>You agree to indemnify, defend, and hold harmless Andes.IA and its affiliates, officers, employees, and partners from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising from:</P>
            <UL items={[
              "Your use of the Services in violation of these Terms.",
              "Your infringement of any intellectual property right of any person or entity.",
              "Any coaching advice or services you provide to athletes using our platform.",
              "Your violation of any applicable law or regulation.",
            ]} />
            <P>Your obligations under this section survive termination of your account.</P>
          </Section>

          <Section id="modifications" num="14." title="Modifications">
            <P>We reserve the right to modify these Terms at any time. Changes are effective upon posting. We will make reasonable efforts to notify you of material changes via email or a prominent notice in the platform. Continued use of the Services after the effective date constitutes acceptance of the revised Terms.</P>
          </Section>

          <Section id="contact" title="Contact">
            <P>Questions about these Terms should be directed to:</P>
            <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "24px 28px" }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: INK, marginBottom: 12 }}>Andes.IA</div>
              <a href="mailto:felipeddeidan@gmail.com" style={{ fontFamily: BODY, fontSize: 15, color: AEGEAN, textDecoration: "none" }}>felipeddeidan@gmail.com</a>
            </div>
          </Section>
        </article>
      </div>
    </MarketingShell>
  );
}
