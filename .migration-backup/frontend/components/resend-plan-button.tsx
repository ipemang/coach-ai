"use client";

import { useState } from "react";

export function ResendPlanButton({ athleteId }: { athleteId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);

  async function handleResend() {
    setState("loading");
    setDetail(null);
    try {
      const res = await fetch(`/api/athletes/${athleteId}/resend-plan-link`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("sent");
      } else {
        setDetail((body?.detail as string | undefined) ?? "Failed to resend.");
        setState("error");
      }
    } catch {
      setDetail("Network error — please try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <span
        className="ca-chip ca-chip-olive"
        style={{ gap: 5 }}
      >
        ✓ Plan link sent
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {state === "error" && detail && (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--terracotta-deep)",
          }}
        >
          {detail}
        </span>
      )}
      <button
        onClick={handleResend}
        disabled={state === "loading"}
        className="ca-btn"
        style={{ padding: "4px 12px", fontSize: 12, borderRadius: 2 }}
      >
        {state === "loading" ? "Sending…" : "↻ Resend plan link"}
      </button>
    </div>
  );
}
