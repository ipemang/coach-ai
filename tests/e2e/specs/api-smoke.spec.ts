/**
 * Coach.AI — API Smoke Tests (no browser required)
 *
 * Tests every backend endpoint in the athlete auth + onboarding flow
 * directly via HTTP. Run these first to confirm the backend is healthy
 * before running the full E2E suite.
 *
 * HOW TO RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *   npx playwright test api-smoke --headed
 *
 * These tests DO NOT open a browser window.
 *
 * PREREQUISITE: BACKEND_URL in .env must point to the FastAPI backend
 * service on Railway — NOT the Next.js frontend URL. They are two separate
 * Railway services with different URLs.
 */

import { test, expect } from "@playwright/test";
import {
  getInviteToken,
  TEST_ATHLETE_EMAIL,
  TEST_ATHLETE_NAME,
  BACKEND_URL,
} from "../helpers";

// ── Coach JWT helper ──────────────────────────────────────────────────────────
// Gets a coach access token by calling Supabase auth directly.
// Requires SUPABASE_ANON_KEY (the public key, NOT the service_role key).

async function getCoachToken(): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;  // must be the anon/public key

  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must both be set in .env.\n" +
      "  SUPABASE_ANON_KEY is the 'anon public' key in Supabase Dashboard → Settings → API.\n" +
      "  Do NOT use the service_role key here — it will cause a 400 error."
    );
  }

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({
      email: process.env.COACH_EMAIL,
      password: process.env.COACH_PASSWORD,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(
      `Could not get coach token (HTTP ${res.status}): ` +
      `${body.error_description ?? body.error ?? "check COACH_EMAIL and COACH_PASSWORD"}`
    );
  }
  const data = await res.json() as Record<string, string>;
  return data.access_token;
}

// ── Backend health ────────────────────────────────────────────────────────────

test("Backend health — GET /health returns 200 { status: ok }", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/health`);
  expect(
    res.status(),
    `Expected 200 from ${BACKEND_URL}/health. ` +
    `Got ${res.status()}. Check that BACKEND_URL points to the FastAPI backend (not the Next.js frontend).`
  ).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

// ── Invite validation endpoint ────────────────────────────────────────────────

test("validate-invite — valid token returns athlete + coach name", async ({ request }) => {
  const token = await getInviteToken(TEST_ATHLETE_EMAIL).catch(() => null);

  if (!token) {
    test.skip(true, "No unused invite token in DB for TEST_ATHLETE_EMAIL — run send-invite test or Test A first.");
    return;
  }

  const res = await request.get(
    `${BACKEND_URL}/api/v1/athlete/auth/validate-invite?token=${encodeURIComponent(token)}`
  );
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body.valid).toBe(true);
  expect(body.email).toBe(TEST_ATHLETE_EMAIL.toLowerCase().trim());
  expect(body.athlete_name).toBeTruthy();
  expect(body.coach_name).toBeTruthy();
  expect(body.expires_at).toBeTruthy();
});

test("validate-invite — invalid token returns valid=false", async ({ request }) => {
  const res = await request.get(
    `${BACKEND_URL}/api/v1/athlete/auth/validate-invite?token=invalid123`
  );
  // Backend returns 200 with valid=false for unknown tokens
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.valid).toBe(false);
  expect(body.error).toBeTruthy();
});

// ── Send invite endpoint ──────────────────────────────────────────────────────

test("send-invite — unauthenticated returns 401 or 403", async ({ request }) => {
  const res = await request.post(`${BACKEND_URL}/api/v1/athlete/auth/send-invite`, {
    data: { full_name: "Ghost", email: "ghost@example.com" },
  });
  expect(
    [401, 403],
    `send-invite without token: expected 401/403, got ${res.status()}. ` +
    `If you got 404, BACKEND_URL is probably pointing to the frontend.`
  ).toContain(res.status());
});

test("send-invite — coach creates invite for test athlete", async ({ request }) => {
  const token = await getCoachToken();

  const res = await request.post(`${BACKEND_URL}/api/v1/athlete/auth/send-invite`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      full_name: TEST_ATHLETE_NAME,
      email: TEST_ATHLETE_EMAIL,
    },
  });

  // 200 = created. No 409 — endpoint is idempotent (re-invite creates a new token).
  expect(res.status()).toBe(200);
  const body = await res.json() as Record<string, string>;
  expect(body.message).toMatch(/invite sent/i);
  expect(body.athlete_id).toBeTruthy();
  expect(body.invite_url).toContain("/athlete/join?token=");
});

// ── link-account endpoint ─────────────────────────────────────────────────────

test("link-account — unauthenticated returns 401 or 403", async ({ request }) => {
  const res = await request.post(
    `${BACKEND_URL}/api/v1/athlete/auth/link-account?token=sometoken`
  );
  expect([401, 403]).toContain(res.status());
});

test("link-account — invalid token with coach JWT returns 400 or 404", async ({ request }) => {
  const coachToken = await getCoachToken();
  const res = await request.post(
    `${BACKEND_URL}/api/v1/athlete/auth/link-account?token=definitely-invalid-token`,
    { headers: { Authorization: `Bearer ${coachToken}` } }
  );
  // Coach JWT has role="coach", not "athlete" — so either 400 (wrong role) or 404 (token not found)
  expect([400, 403, 404]).toContain(res.status());
});

// ── Onboarding status endpoint ────────────────────────────────────────────────

test("onboarding/status — unauthenticated returns 401 or 403", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/api/v1/athlete/onboarding/status`);
  expect([401, 403]).toContain(res.status());
});

test("onboarding/status — coach JWT is rejected (no athlete_id claim)", async ({ request }) => {
  const coachToken = await getCoachToken();
  const res = await request.get(`${BACKEND_URL}/api/v1/athlete/onboarding/status`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect([401, 403]).toContain(res.status());
});

// ── Coach onboarding status endpoint ─────────────────────────────────────────

test("coach/onboarding/status — returns 200 with valid coach JWT", async ({ request }) => {
  const coachToken = await getCoachToken();
  const res = await request.get(`${BACKEND_URL}/api/v1/coach/onboarding/status`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.onboarding_complete).toBe("boolean");
});

// ── Athlete files endpoint ────────────────────────────────────────────────────

test("athlete/files — unauthenticated returns 401 or 403", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/api/v1/athlete/files`);
  expect([401, 403]).toContain(res.status());
});

// ── Resend plan link endpoint ─────────────────────────────────────────────────
// Actual path: POST /api/v1/coach/athletes/{athlete_id}/resend-plan-link

test("resend-plan-link — unauthenticated returns 401 or 403", async ({ request }) => {
  // Use a fake athlete_id — the auth check fires before the DB lookup
  const res = await request.post(
    `${BACKEND_URL}/api/v1/coach/athletes/00000000-0000-0000-0000-000000000000/resend-plan-link`
  );
  expect([401, 403]).toContain(res.status());
});
