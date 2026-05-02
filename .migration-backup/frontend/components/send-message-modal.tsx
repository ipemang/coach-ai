"use client";

/**
 * COA-121: Coach-initiated WhatsApp message modal.
 * Used on the athlete detail page to let the coach send a message directly
 * to an athlete, bypassing the "waiting for athlete to text first" constraint.
 */

import { useState, useRef, useEffect } from "react";

interface Props {
  athleteId: string;
  athleteName: string;
}

export function SendMessageModal({ athleteId, athleteName }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [aiPolish, setAiPolish] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textRef.current?.focus(), 60);
    }
  }, [open]);

  function close() {
    setOpen(false);
    setMessage("");
    setResult(null);
    setAiPolish(false);
  }

  async function handleSend() {
    if (!message.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), ai_polish: aiPolish }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        setResult({ ok: true, text: `Sent to ${data.athlete_name}: "${(data.message || "").slice(0, 80)}${(data.message || "").length > 80 ? "…" : ""}"` });
        setMessage("");
        // Auto-close after 2s
        setTimeout(close, 2000);
      } else {
        setResult({ ok: false, text: data.detail || data.error || "Failed to send" });
      }
    } catch {
      setResult({ ok: false, text: "Network error — please retry" });
    } finally {
      setSending(false);
    }
  }

  const STYLES = `
    .smm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;}
    .smm-card{background:#faf9f7;border:1px solid #d9d5cc;border-radius:4px;width:100%;max-width:480px;padding:1.75rem;box-shadow:0 8px 32px -8px rgba(0,0,0,0.18);}
    .smm-title{font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:400;letter-spacing:-0.02em;color:#1a1814;margin:0 0 0.25rem;}
    .smm-sub{font-size:12px;font-family:'JetBrains Mono',monospace;color:#888;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 1.25rem;}
    .smm-label{font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:0.1em;text-transform:uppercase;color:#666;margin-bottom:6px;display:block;}
    .smm-textarea{width:100%;min-height:100px;padding:10px 12px;font-family:'Inter',-apple-system,sans-serif;font-size:13px;line-height:1.55;border:1px solid #d0ccc4;background:#fff;border-radius:2px;resize:vertical;outline:none;color:#1a1814;box-sizing:border-box;}
    .smm-textarea:focus{border-color:#1a1814;}
    .smm-polish{display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;user-select:none;}
    .smm-polish input{cursor:pointer;}
    .smm-polish-label{font-size:12px;color:#555;}
    .smm-polish-note{font-size:11px;color:#aaa;font-family:'JetBrains Mono',monospace;}
    .smm-actions{display:flex;gap:8px;margin-top:1.25rem;justify-content:flex-end;}
    .smm-btn{padding:8px 16px;font-size:13px;font-weight:500;border-radius:2px;border:1px solid;cursor:pointer;font-family:'Inter',-apple-system,sans-serif;transition:all 120ms;}
    .smm-btn-ghost{background:transparent;border-color:transparent;color:#666;}
    .smm-btn-ghost:hover{background:#f0ede8;color:#1a1814;}
    .smm-btn-primary{background:#1a1814;border-color:#1a1814;color:#faf9f7;}
    .smm-btn-primary:hover:not(:disabled){background:#2d2a24;}
    .smm-btn-primary:disabled{opacity:0.5;cursor:not-allowed;}
    .smm-result-ok{margin-top:10px;padding:8px 12px;background:#f0f7f0;border:1px solid #b8d8b8;border-radius:2px;font-size:12px;color:#2d6a2d;}
    .smm-result-err{margin-top:10px;padding:8px 12px;background:#fdf0f0;border:1px solid #e8b8b8;border-radius:2px;font-size:12px;color:#8b2020;}
    .smm-char{font-size:11px;color:#aaa;text-align:right;margin-top:4px;font-family:'JetBrains Mono',monospace;}
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          fontSize: 12,
          fontFamily: "var(--mono, 'JetBrains Mono', monospace)",
          letterSpacing: "0.07em",
          fontWeight: 500,
          textTransform: "uppercase",
          background: "transparent",
          border: "1px solid var(--aegean-deep, #2a6496)",
          color: "var(--aegean-deep, #2a6496)",
          borderRadius: 2,
          cursor: "pointer",
          transition: "all 140ms",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--aegean-wash, #eaf4fb)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        💬 Send message
      </button>

      {/* Modal */}
      {open && (
        <div className="smm-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="smm-card">
            <p className="smm-title">Message {athleteName}</p>
            <p className="smm-sub">Via WhatsApp · Direct</p>

            <label className="smm-label" htmlFor="smm-msg">Your message</label>
            <textarea
              id="smm-msg"
              ref={textRef}
              className="smm-textarea"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={`Write something for ${athleteName}…`}
              maxLength={1000}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
                if (e.key === "Escape") close();
              }}
            />
            <p className="smm-char">{message.length}/1000</p>

            <label className="smm-polish">
              <input
                type="checkbox"
                checked={aiPolish}
                onChange={e => setAiPolish(e.target.checked)}
              />
              <span className="smm-polish-label">✨ AI polish</span>
              <span className="smm-polish-note">— rephrase for tone &amp; clarity</span>
            </label>

            {result && (
              <div className={result.ok ? "smm-result-ok" : "smm-result-err"}>
                {result.ok ? "✓ " : "✗ "}{result.text}
              </div>
            )}

            <div className="smm-actions">
              <button className="smm-btn smm-btn-ghost" onClick={close}>Cancel</button>
              <button
                className="smm-btn smm-btn-primary"
                onClick={handleSend}
                disabled={!message.trim() || sending}
              >
                {sending ? "Sending…" : "Send via WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
