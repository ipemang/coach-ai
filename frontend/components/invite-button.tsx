"use client";

import { useState } from "react";

export function InviteButton() {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateInvite() {
    setLoading(true);
    setError(null);
    setInviteUrl(null);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate link");
      setInviteUrl(data.invite_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={generateInvite}
        disabled={loading}
        className="rounded-full bg-indigo-500/20 px-4 py-1.5 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/30 disabled:opacity-40"
      >
        {loading ? "Generating..." : "+ Invite Athlete"}
      </button>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {inviteUrl && (
        <div className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2">
          <p className="flex-1 truncate text-xs text-indigo-200">{inviteUrl}</p>
          <button
            onClick={copyLink}
            className="shrink-0 rounded-lg bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
