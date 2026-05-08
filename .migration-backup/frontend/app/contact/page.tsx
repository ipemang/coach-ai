"use client";
import { useState } from "react";
import { MarketingShell } from "../_components/MarketingShell";

const INK      = "oklch(0.28 0.022 55)";
const INK_SOFT = "oklch(0.42 0.022 60)";
const INK_MUTE = "oklch(0.58 0.018 65)";
const PARCHMENT= "oklch(0.965 0.018 85)";
const LINEN    = "oklch(0.925 0.025 78)";
const LINEN_DEEP="oklch(0.885 0.028 75)";
const RULE     = "oklch(0.80 0.025 70)";
const RULE_SOFT= "oklch(0.86 0.022 75)";
const AEGEAN   = "oklch(0.42 0.080 200)";
const AEGEAN_WASH="oklch(0.92 0.030 190)";
const TERRA_DEEP="oklch(0.52 0.130 38)";
const TERRA_SOFT="oklch(0.86 0.055 45)";
const SERIF    = "'Cormorant Garamond', Georgia, serif";
const BODY     = "'Work Sans', ui-sans-serif, system-ui, sans-serif";
const MONO     = "'JetBrains Mono', ui-monospace, monospace";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", role: "coach", message: "" });
  const [status, setStatus] = useState<Status>("idle");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    // Opens mailto — server-side email sending requires a backend endpoint
    const subject = encodeURIComponent(`Andes.IA inquiry from ${form.name}`);
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\nRole: ${form.role}\n\n${form.message}`);
    window.location.href = `mailto:felipeddeidan@gmail.com?subject=${subject}&body=${body}`;
    setStatus("sent");
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: PARCHMENT, border: `1px solid ${RULE}`, borderRadius: 2,
    fontFamily: BODY, fontSize: 14, color: INK, outline: "none",
    boxSizing: "border-box",
  };

  return (
    <MarketingShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>

        {/* Left — copy */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 16 }}>Contact</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px", color: INK, lineHeight: 1.05 }}>
            Let&apos;s talk about<br />your coaching practice.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.6, color: INK_SOFT, margin: "0 0 48px" }}>
            Whether you&apos;re a solo triathlon coach managing 12 athletes or a club director thinking about scaling — we want to hear what you&apos;re working on.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {[
              { label: "Email us directly", value: "felipeddeidan@gmail.com", href: "mailto:felipeddeidan@gmail.com" },
              { label: "Response time", value: "We reply within 24 hours on weekdays" },
              { label: "Best for", value: "Trial questions, onboarding help, partnership inquiries, feedback" },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: INK_MUTE, marginBottom: 6 }}>{item.label}</div>
                {item.href ? (
                  <a href={item.href} style={{ fontFamily: SERIF, fontSize: 20, color: AEGEAN, textDecoration: "none" }}>{item.value}</a>
                ) : (
                  <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: 0 }}>{item.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right — form */}
        <div style={{ background: LINEN, border: `1px solid ${RULE}`, borderRadius: 4, padding: "40px" }}>
          {status === "sent" ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontFamily: SERIF, fontSize: 48, color: AEGEAN, marginBottom: 16 }}>✓</div>
              <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, color: INK, margin: "0 0 12px" }}>Opening your email app…</h2>
              <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: INK_SOFT, margin: 0 }}>
                Your message is pre-filled and ready to send. We typically reply within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TERRA_DEEP, marginBottom: 4 }}>Send us a message</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, display: "block", marginBottom: 6 }}>Your name</label>
                  <input name="name" required value={form.name} onChange={handleChange} placeholder="Sara Lima" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, display: "block", marginBottom: 6 }}>Email</label>
                  <input name="email" type="email" required value={form.email} onChange={handleChange} placeholder="sara@example.com" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, display: "block", marginBottom: 6 }}>I am a…</label>
                <select name="role" value={form.role} onChange={handleChange} style={inputStyle}>
                  <option value="coach">Coach</option>
                  <option value="club">Club / federation</option>
                  <option value="athlete">Athlete</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: INK_MUTE, display: "block", marginBottom: 6 }}>Message</label>
                <textarea name="message" required rows={5} value={form.message} onChange={handleChange}
                  placeholder="Tell us about your coaching practice, what you're looking for, or any questions you have…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              <button type="submit" disabled={status === "sending"} style={{
                padding: "12px 24px", background: AEGEAN, color: "oklch(0.97 0.02 190)",
                border: "none", borderRadius: 2, fontFamily: BODY, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}>
                {status === "sending" ? "Opening email…" : "Send message →"}
              </button>

              <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: INK_MUTE, margin: 0, textAlign: "center" }}>
                Or email us directly at felipeddeidan@gmail.com
              </p>
            </form>
          )}
        </div>
      </div>
    </MarketingShell>
  );
}
