import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Decode a Supabase JWT and return true if the payload has athlete claims. */
function jwtIsAthlete(accessToken: string): boolean {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return !!payload.athlete_id || payload.role === "athlete";
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify session server-side (must come before any auth checks)
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Protect coach dashboard ──────────────────────────────────────────────
  if (pathname.startsWith("/dashboard") && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // ── Protect coach onboarding ─────────────────────────────────────────────
  // B-NEW-22: /onboarding is the coach post-signup wizard — must be protected.
  // /athlete/onboarding uses a different auth flow and remains excluded from the matcher.
  if (pathname.startsWith("/onboarding") && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // ── Protect athlete routes ───────────────────────────────────────────────
  if (
    (pathname.startsWith("/athlete/dashboard") ||
      pathname.startsWith("/athlete/onboarding") ||
      pathname.startsWith("/athlete/profile-update")) &&
    !user
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // ── Redirect already-logged-in users away from /login ───────────────────
  if (pathname === "/login" && user) {
    const { data: { session } } = await supabase.auth.getSession();
    const athlete = session ? jwtIsAthlete(session.access_token) : false;
    const dest = request.nextUrl.clone();
    dest.pathname = athlete ? "/athlete/dashboard" : "/dashboard";
    return NextResponse.redirect(dest);
  }

  return supabaseResponse;
}

export const config = {
  // B-NEW-22: Removed "onboarding" from the exclusion list so /onboarding (coach
  // post-signup wizard) is now protected by the middleware. The auth check above
  // redirects unauthenticated coaches to /login.
  // /athlete/onboarding is excluded via "athlete/onboarding" — athletes use a
  // separate token-based auth flow before they have a session cookie.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|my-plan|connect|athlete/onboarding).*)",
  ],
};
