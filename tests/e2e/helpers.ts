/**
 * Shared helpers for Coach.AI E2E tests.
 *
 * Two browser contexts run in parallel throughout the suite:
 *   coachPage  — the coach's session (/dashboard)
 *   athletePage — the new athlete's session (/athlete/*)
 *
 * Supabase helpers use the service role key (from .env) to query the DB
 * directly, so we can extract invite tokens without manual URL copy-paste.
 */

import { Page, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ── Supabase admin client ─────────────────────────────────────────────────────

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env to use DB helpers."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Query the athlete_connect_tokens table for the most recent token
 * matching the given email address. Retries for up to maxWaitMs because
 * the backend processes the invite asynchronously.
 */
export async function getInviteToken(
  athleteEmail: string,
  maxWaitMs = 10_000
): Promise<string> {
  const sb = supabaseAdmin();
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const { data, error } = await sb
      .from("athlete_invite_tokens")
      .select("token, created_at")
      .eq("email", athleteEmail.toLowerCase().trim())
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!error && data?.token) return data.token;
    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(
    `Timed out waiting for invite token for ${athleteEmail}. ` +
      "Check Railway backend logs for send-invite errors."
  );
}

/**
 * Query the athletes table to confirm an athlete row exists and is linked.
 */
export async function getAthleteRow(athleteEmail: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("athletes")
    .select("id, full_name, email, auth_user_id, onboarding_complete")
    .eq("email", athleteEmail.toLowerCase().trim())
    .single();
  return data;
}

// ── Page helpers ──────────────────────────────────────────────────────────────

/**
 * Log in as coach at /login and wait for the dashboard to load.
 */
export async function loginAsCoach(page: Page) {
  const email = process.env.COACH_EMAIL!;
  const password = process.env.COACH_PASSWORD!;

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Fill whichever input is for email — try common selectors
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

/**
 * Extract a query parameter from the current page URL.
 */
export function extractParam(url: string, param: string): string | null {
  try {
    return new URL(url).searchParams.get(param);
  } catch {
    return null;
  }
}

/**
 * Print a prominent manual-step banner to the console.
 * Used for email steps that can't be automated.
 */
export function printManualStep(message: string) {
  const border = "─".repeat(70);
  console.log(`\n\x1b[33m${border}\x1b[0m`);
  console.log(`\x1b[33m  ⚡ MANUAL STEP REQUIRED\x1b[0m`);
  console.log(`\x1b[33m${border}\x1b[0m`);
  console.log(`\n  ${message}\n`);
  console.log(`  Then click the \x1b[36mResume\x1b[0m button in the Playwright inspector\n`);
  console.log(`\x1b[33m${border}\x1b[0m\n`);
}

/**
 * Assert that a Supabase table row exists matching the given filter.
 * Used to verify backend state without going through the UI.
 */
export async function assertDbRow(
  table: string,
  filter: Record<string, string | null | boolean>,
  errorMessage: string
) {
  const sb = supabaseAdmin();
  let query = sb.from(table).select("id");
  for (const [col, val] of Object.entries(filter)) {
    if (val === null) {
      query = query.is(col, null) as typeof query;
    } else {
      query = query.eq(col, val as string) as typeof query;
    }
  }
  const { data } = await query.limit(1).single();
  if (!data) throw new Error(`DB assertion failed: ${errorMessage}`);
}

// ── Test data ─────────────────────────────────────────────────────────────────

// Strip trailing slashes so ${URL}/path never produces double-slash URLs
function stripSlash(s: string | undefined): string {
  return (s ?? "").replace(/\/+$/, "");
}

export const TEST_ATHLETE_EMAIL = process.env.TEST_ATHLETE_EMAIL ?? "";
export const TEST_ATHLETE_NAME = process.env.TEST_ATHLETE_NAME ?? "Test Athlete";
export const TEST_ATHLETE_PASSWORD =
  process.env.TEST_ATHLETE_PASSWORD ?? "TestAthlete123!";
export const BACKEND_URL = stripSlash(process.env.BACKEND_URL);
