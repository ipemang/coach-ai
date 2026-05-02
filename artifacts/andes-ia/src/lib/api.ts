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
 * Detect whether a JWT belongs to an athlete.
 * Checks: top-level role claim, athlete_id presence,
 * app_metadata.role, and user_metadata.role.
 */
function detectAthleteFromJwt(claims: Record<string, unknown>): boolean {
  return (
    claims.role === "athlete" ||
    claims.athlete_id != null ||
    (claims.app_metadata as Record<string, unknown> | null)?.role === "athlete" ||
    (claims.user_metadata as Record<string, unknown> | null)?.role === "athlete"
  );
}

/**
 * Probe a single onboarding-status endpoint.
 * Returns the parsed JSON body if the response is 200 OK, otherwise null.
 */
async function fetchOnboardingStatus(
  url: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return await res.json() as Record<string, unknown>;
  } catch { /* network error — treat as unreachable */ }
  return null;
}

/**
 * Determine the user's role and where they should go after login.
 *
 * Strategy:
 *  1. Check JWT claims for a fast, zero-network role guess.
 *  2. For confirmed athlete JWT → check athlete onboarding status.
 *  3. For ambiguous JWT → probe BOTH endpoints in parallel:
 *       - If athlete endpoint returns 200 → athlete (handles new athletes
 *         whose JWT claims haven't been refreshed yet, including 200 with
 *         onboarding_complete: false).
 *       - If coach endpoint returns 200 → coach.
 *       - If neither responds → log a warning and default to /dashboard.
 *  4. Falls back gracefully when the backend is unreachable.
 *
 * Routes returned:
 *  - Coach, onboarding done    → /dashboard
 *  - Coach, onboarding missing → /onboarding
 *  - Athlete, onboarding done  → /athlete/dashboard
 *  - Athlete, onboarding missing → /athlete/onboarding
 */
export async function getRoleAndRedirect(token: string): Promise<{
  role: UserRole;
  route: string;
}> {
  const claims = parseJwtClaims(token);
  const isAthleteByJwt = detectAthleteFromJwt(claims);

  // Fast path: JWT explicitly identifies an athlete.
  if (isAthleteByJwt) {
    const data = await fetchOnboardingStatus(
      `${BACKEND}/api/v1/athlete/onboarding/status`,
      token,
    );
    if (data !== null) {
      return {
        role: "athlete",
        route: data.onboarding_complete ? "/athlete/dashboard" : "/athlete/onboarding",
      };
    }
    return { role: "athlete", route: "/athlete/onboarding" };
  }

  // Ambiguous JWT: probe both endpoints in parallel.
  // This catches athletes whose JWT claims haven't been refreshed yet,
  // as well as brand-new athletes with no onboarding record (404 from
  // the athlete endpoint would be misread as "not an athlete" if we
  // only probed sequentially).
  const [athleteData, coachData] = await Promise.all([
    fetchOnboardingStatus(`${BACKEND}/api/v1/athlete/onboarding/status`, token),
    fetchOnboardingStatus(`${BACKEND}/api/v1/coach/onboarding/status`, token),
  ]);

  if (athleteData !== null) {
    return {
      role: "athlete",
      route: athleteData.onboarding_complete ? "/athlete/dashboard" : "/athlete/onboarding",
    };
  }

  if (coachData !== null) {
    return {
      role: "coach",
      route: coachData.onboarding_complete ? "/dashboard" : "/onboarding",
    };
  }

  // Neither endpoint responded — log so this can be monitored in production.
  console.warn("[andes] getRoleAndRedirect: could not determine role from backend; defaulting to /dashboard");
  return { role: "unknown", route: "/dashboard" };
}

/**
 * Convenience wrapper — returns just the route string.
 * Kept for backwards-compatibility with existing call sites.
 */
export async function resolvePostLoginRoute(token: string): Promise<string> {
  const { route } = await getRoleAndRedirect(token);
  return route;
}
