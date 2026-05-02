import { createBrowserSupabase } from "./supabase";

export const BACKEND = import.meta.env.VITE_BACKEND_URL as string || "https://coach-ai-production-a5aa.up.railway.app";

export async function getAuthToken(): Promise<string | null> {
  const sb = createBrowserSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token ?? null;
}

export function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "==".slice((b64.length % 4) || 4);
    return JSON.parse(window.atob(pad));
  } catch {
    return {};
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BACKEND}${path}`, { ...options, headers });
}

export type UserRole = "coach" | "athlete" | "unknown";

/**
 * Determine where a freshly-authenticated user should go.
 * Strategy:
 *  1. Check JWT claims for a quick guess (no network).
 *  2. Confirm with the backend and get onboarding status.
 *  3. Fall back gracefully if the backend is unreachable.
 */
export async function resolvePostLoginRoute(token: string): Promise<string> {
  const claims = parseJwtClaims(token);

  const isAthleteByJwt =
    claims.role === "athlete" ||
    claims.athlete_id != null ||
    (claims.app_metadata as Record<string, unknown> | null)?.role === "athlete" ||
    (claims.user_metadata as Record<string, unknown> | null)?.role === "athlete";

  if (isAthleteByJwt) {
    try {
      const res = await fetch(`${BACKEND}/api/v1/athlete/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.onboarding_complete ? "/athlete/dashboard" : "/athlete/onboarding";
      }
    } catch { /* network issue — fall through */ }
    return "/athlete/onboarding";
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/coach/onboarding/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.onboarding_complete ? "/dashboard" : "/onboarding";
    }
  } catch { /* network issue — fall through */ }

  return "/dashboard";
}
