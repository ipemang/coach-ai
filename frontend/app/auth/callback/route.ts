import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// ── Auth Callback ──────────────────────────────────────────────────────────────
//
// Handles three flows:
//   1. OAuth (Google / Apple): Supabase redirects here with ?code=...
//   2. Email confirmation (sign-up): Supabase redirects here with ?code=...
//   3. Password reset: Supabase redirects here with ?code=... and ?next=/auth/reset-password
//
// After exchanging the code for a session, we check whether this auth user
// already has a row in the coaches table (via coaches.auth_user_id).
//
// If NO coaches row exists → redirect to /onboarding (new coach, needs setup).
// If coaches row exists    → redirect to /dashboard (returning coach).
//
// This is what gates COA-63 (coach onboarding flow).
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? null;

  // No code — something went wrong upstream
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Exchange the one-time code for a persistent session
  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

  if (sessionError || !sessionData.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // If a specific next page was requested (e.g. password reset), honour it
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Check whether this auth user already has a coaches row
  // We query via the admin client so RLS doesn't interfere here
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: coachRow } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("auth_user_id", sessionData.user.id)
    .maybeSingle();

  if (!coachRow) {
    // New coach — no profile yet. Route to onboarding.
    // Pass the user's name/email as query params so onboarding can pre-fill.
    const onboardUrl = new URL(`${origin}/onboarding`);
    onboardUrl.searchParams.set("email", sessionData.user.email ?? "");
    const displayName =
      sessionData.user.user_metadata?.full_name ??
      sessionData.user.user_metadata?.name ??
      "";
    if (displayName) onboardUrl.searchParams.set("name", displayName);
    return NextResponse.redirect(onboardUrl.toString());
  }

  // Returning coach — go straight to the dashboard
  return NextResponse.redirect(`${origin}/dashboard`);
}
