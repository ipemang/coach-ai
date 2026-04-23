/**
 * Coach.AI — API Smoke Tests (no browser required)
 *
 * Tests every backend endpoint in the athlete auth + onboarding flow
 * directly via HTTP. Run these first to confirm the backend is healthy
 * before running the full E2E suite.
 *
 * HOW TO RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *   npm run test:headed  (or just `npx playwright test api-smoke`)
 *
 * These tests DO NOT open a browser window.
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

async function getCoachToken(): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    throw new Error(`Could not get coach token: ${body.error_description ?? res.status}`);
  }
  const data = await res.json() as Record<string, string>;
  return data.access_token;
}

// ── Backend health ────────────────────────────────────────────────────────────

test("Backend health check — GET /healthz returns 200", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/healthz`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

// ── Invite validation endpoint ────────────────────────────────────────────────

test("validate-invite — valid token returns athlete + coach name", async ({ request }) => {
  // This test uses a token that was already seeded in the DB (from Test A or manually).
  // If running standalone, seed a token first.
  const token = await getInviteToken(TEST_ATHLETE_EMAIL).catch(() => null);

  if (!token) {
    test.skip(true, "No invite token found for TEST_ATHLETE_EMAIL — run Test A first.");
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

test("validate-invite — invalid token returns valid=false or 4xx", async ({ request }) => {
  const res = await request.get(
    `${BACKEND_URL}/api/v1/athlete/auth/validate-invite?token=invalid123`
  );

  // Either 200 with valid=false or a 400/404
  if (res.status() === 200) {
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toBeTruthy();
  } else {
    expect([400, 404]).toContain(res.status());
  }
});

// ── Send invite endpoint ──────────────────────────────────────────────────────

test("send-invite — requires authentication (401 without token)", async ({ request }) => {
  const res = await request.post(`${BACKEND_URL}/api/v1/athlete/auth/send-invite`, {
    data: { name: "Ghost", email: "ghost@example.com" },
  });
  expect([401, 403]).toContain(res.status());
});

test("send-invite — coach can send invite", async ({ request }) => {
  const token = await getCoachToken();

  const res = await request.post(`${BACKEND_URL}/api/v1/athlete/auth/send-invite`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: TEST_ATHLETE_NAME,
      email: TEST_ATHLETE_EMAIL,
    },
  });

  // 200 = new invite sent. 409 = athlete already invited (idempotent).
  expect([200, 409]).toContain(res.status());

  if (res.status() === 200) {
    const body = await res.json();
    expect(body.message ?? body.detail).toBeTruthy();
  }
});

// ── link-account endpoint ─────────────────────────────────────────────────────

test("link-account — requires authentication (401 without token)", async ({ request }) => {
  const res = await request.post(
    `${BACKEND_URL}/api/v1/athlete/auth/link-account?token=sometoken`
  );
  expect([401, 403]).toContain(res.status());
});

test("link-account — expired/invalid token returns 400 or 404", async ({ request }) => {
  const coachToken = await getCoachToken();
  // Coach JWT doesn't have athlete_id, but invalid token should fail before role check
  const res = await request.post(
    `${BACKEND_URL}/api/v1/athlete/auth/link-account?token=definitely-invalid-token`,
    { headers: { Authorization: `Bearer ${coachToken}` } }
  );
  expect([400, 404]).toContain(res.status());
});

// ── Onboarding status endpoint ────────────────────────────────────────────────

test("onboarding/status — requires athlete JWT (401 without token)", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/api/v1/athlete/onboarding/status`);
  expect([401, 403]).toContain(res.status());
});

test("onboarding/status — coach JWT is rejected (403 or 401)", async ({ request }) => {
  const coachToken = await getCoachToken();
  const res = await request.get(`${BACKEND_URL}/api/v1/athlete/onboarding/status`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  // Coach JWT lacks athlete_id — must be rejected
  expect([401, 403]).toContain(res.status());
});

// ── Coach onboarding status endpoint ─────────────────────────────────────────

test("coach/onboarding/status — returns 200 with coach JWT", async ({ request }) => {
  const coachToken = await getCoachToken();
  const res = await request.get(`${BACKEND_URL}/api/v1/coach/onboarding/status`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.onboarding_complete).toBe("boolean");
});

// ── Athlete files endpoint ────────────────────────────────────────────────────

test("athlete/files — requires athlete JWT (401 without token)", async ({ request }) => {
  const res = await request.get(`${BACKEND_URL}/api/v1/athlete/files`);
  expect([401, 403]).toContain(res.status());
});

// ── Resend plan link endpoint ─────────────────────────────────────────────────

test("resend-plan-link — requires coach JWT (401 without token)", async ({ request }) => {
  const res = await request.post(
    `${BACKEND_URL}/api/v1/athlete/auth/resend-plan-link?athlete_id=fake-id`
  );
  expect([401, 403]).toContain(res.status());
});
