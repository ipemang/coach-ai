/**
 * Canonical backend URL for all Next.js API route handlers.
 *
 * Falls back to the Railway production URL so the app degrades gracefully
 * if BACKEND_URL is not explicitly set. A missing var is logged at startup
 * (server-side only) so it shows up in Railway logs.
 */
const RAILWAY_FALLBACK = "https://coach-ai-production-a5aa.up.railway.app";

if (!process.env.BACKEND_URL && typeof window === "undefined") {
  console.warn(
    "[config] BACKEND_URL env var is not set — falling back to %s. " +
    "Set BACKEND_URL in Railway to avoid this warning.",
    RAILWAY_FALLBACK,
  );
}

export const BACKEND = (
  process.env.BACKEND_URL || RAILWAY_FALLBACK
).replace(/\/+$/, "");
