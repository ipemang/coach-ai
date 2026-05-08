import Link from "next/link";
import { MarketingShell } from "../_components/MarketingShell";

const INK       = "oklch(0.28 0.022 55)";
const INK_SOFT  = "oklch(0.42 0.022 60)";
const INK_MUTE  = "oklch(0.58 0.018 65)";
const PARCHMENT = "oklch(0.965 0.018 85)";
const PARCHMENT2= "oklch(0.945 0.022 82)";
const LINEN     = "oklch(0.925 0.025 78)";
const LINEN_DEEP= "oklch(0.885 0.028 75)";
const RULE      = "oklch(0.80 0.025 70)";
const RULE_SOFT = "oklch(0.86 0.022 75)";
const AEGEAN    = "oklch(0.42 0.080 200)";
const TERRA_DEEP= "oklch(0.52 0.130 38)";
const TERRA_SOFT= "oklch(0.86 0.055 45)";
const OCHRE     = "oklch(0.75 0.090 78)";
const SERIF     = "'Cormorant Garamond', Georgia, serif";
const BODY      = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO      = "'JetBrains Mono', ui-monospace, monospace";

const BEFORE = [
  { label: "Athlete", msg: "My legs were really heavy today. Should I skip Thursday's intervals?" },
];
const AFTER_GENERIC = "Based on your training data, I recommend completing the scheduled interval session at reduced intensity. Please monitor your perceived exertion and adjust accordingly.";
const AFTER_VOICE = "Heavy legs after a long run at pace is actually a great sign — your body's adapting. Take Wednesday easy, see how you feel Thursday morning. If it's still there we skip the intervals, no stress.";

export default function VoiceCloningPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section style={{ background: LINEN_DEEP, borderBottom: `1px solid ${RULE}`, padding: "72px 32px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Voice cloning</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 54, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            The AI replies like you.<br /><em style={{ fontStyle: "italic", color: TERRA_DEEP }}>Not like a chatbot.</em>
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>
            Voice cloning is the foundation of Andes.IA. It&apos;s what makes the difference between a draft you&apos;d actually send and one you&apos;d immediately rewrite.
          </p>
        </div>
      </section>

      {/* Before / after */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: AEGEAN, marginBottom: 12 }}>The difference</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, color: INK, margin: 0 }}>Same question. Very different replies.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Without voice */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 12 }}>Generic AI reply (no voice cloning)</div>
            <div style={{ background: "#ECE5DD", borderRadius: 8, padding: "20px", fontFamily: BODY, fontSize: 14 }}>
              <div style={{ background: "#fff", borderRadius: "2px 12px 12px 12px", padding: "10px 14px", marginBottom: 10, maxWidth: "80%", color: INK, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                {BEFORE[0].msg}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: "#d0f0c0", borderRadius: "12px 2px 12px 12px", padding: "10px 14px", maxWidth: "80%", color: "#2d4a2d", lineHeight: 1.55, fontSize: 13.5, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                  {AFTER_GENERIC}
                </div>
              </div>
              <div style={{ textAlign: "right", marginTop: 6, fontFamily: MONO, fontSize: 9, color: "#667781", letterSpacing: "0.06em" }}>✓ Sent</div>
            </div>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: INK_MUTE, margin: "12px 0 0" }}>Technically correct. Sounds like a medical disclaimer.</p>
          </div>
          {/* With voice */}
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: AEGEAN, marginBottom: 12 }}>Andes.IA reply (in your voice)</div>
            <div style={{ background: "#ECE5DD", borderRadius: 8, padding: "20px", fontFamily: BODY, fontSize: 14 }}>
              <div style={{ background: "#fff", borderRadius: "2px 12px 12px 12px", padding: "10px 14px", marginBottom: 10, maxWidth: "80%", color: INK, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                {BEFORE[0].msg}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: "#d0f0c0", borderRadius: "12px 2px 12px 12px", padding: "10px 14px", maxWidth: "80%", color: "#2d4a2d", lineHeight: 1.55, fontSize: 13.5, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                  {AFTER_VOICE}
                </div>
              </div>
              <div style={{ textAlign: "right", marginTop: 6, fontFamily: MONO, fontSize: 9, color: "#667781", letterSpacing: "0.06em" }}>✓✓ Read</div>
            </div>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: INK_SOFT, margin: "12px 0 0" }}>Sounds like you. Because it learned from you.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, color: INK, margin: 0 }}>Three inputs. One voice model. Always yours.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { num: "01", title: "Paste your past replies", desc: "30–50 WhatsApp messages you've sent to athletes. These are the training set. Pull from different moods and contexts — encouraging, corrective, brief, detailed.", tip: "More examples = better match. 100+ replies puts you in a league of your own." },
              { num: "02", title: "Andes learns your patterns", desc: "The model analyzes: your phrasing, casing (do you go lowercase?), emoji use, how you open, how you close, how you handle bad news vs. good news.", tip: "This takes under 60 seconds. You'll see a voice preview before moving on." },
              { num: "03", title: "Every approval teaches it more", desc: "Every time you approve a draft as-is, or edit one, Andes updates your voice model. It improves continuously — quietly, in the background.", tip: "Coaches who use Andes for 4+ weeks consistently say drafts are 90%+ send-ready." },
            ].map(step => (
              <div key={step.num} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "28px" }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: AEGEAN, marginBottom: 14 }}>{step.num}</div>
                <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, margin: "0 0 12px", color: INK }}>{step.title}</h3>
                <p style={{ fontFamily: BODY, fontSize: 14, color: INK_SOFT, lineHeight: 1.65, margin: "0 0 16px" }}>{step.desc}</p>
                <div style={{ background: PARCHMENT2, border: `1px solid ${RULE_SOFT}`, borderRadius: 2, padding: "10px 14px" }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: AEGEAN }}>Tip: </span>
                  <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: INK_SOFT }}>{step.tip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it learns */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: AEGEAN, marginBottom: 12 }}>What the model captures</div>
          <h2 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 500, color: INK, margin: 0 }}>More than words. Your coaching personality.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[
            { label: "Phrasing & vocabulary", desc: "The specific words and phrases you reach for. \"heavy legs\" vs. \"fatigue\", \"no stress\" vs. \"don't worry about it\"." },
            { label: "Tone calibration", desc: "How you balance authority and warmth. Where you push, where you soften, how you handle self-doubt." },
            { label: "Message structure", desc: "Do you lead with validation then advice? Do you ask a question before giving direction? Andes replicates your pattern." },
            { label: "Casing & style", desc: "Lowercase only? Sentence case? Emoji or no emoji? Periods at the end? All of it is captured and matched." },
          ].map(item => (
            <div key={item.label} style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "24px" }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 10 }}>{item.label}</div>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: INK_SOFT, lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: LINEN_DEEP, borderTop: `1px solid ${RULE}`, padding: "56px 32px", textAlign: "center" }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, margin: "0 auto 16px", color: INK, maxWidth: 480 }}>
          Ready to hear what you sound like?
        </h2>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28 }}>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: AEGEAN, color: "oklch(0.97 0.02 190)", borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14, fontWeight: 600 }}>
            Start voice calibration →
          </Link>
          <Link href="/onboarding-guide" style={{ display: "inline-flex", alignItems: "center", padding: "12px 24px", background: "transparent", border: `1px solid ${RULE}`, color: INK_SOFT, borderRadius: 2, textDecoration: "none", fontFamily: BODY, fontSize: 14 }}>
            Back to onboarding guide
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
