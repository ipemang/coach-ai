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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300">
        ✓ Plan link sent
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {state === "error" && detail && (
        <span className="text-xs text-red-400">{detail}</span>
      )}
      <button
        onClick={handleResend}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1.5 text-sm text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
      >
        {state === "loading" ? "Sending…" : "↻ Resend plan link"}
      </button>
    </div>
  );
}
