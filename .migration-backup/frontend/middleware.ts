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
  // F-C1: Tightened from "onboard" (matched any path starting with /onboard,
  // including /athlete/onboarding) to "onboarding" (coach post-signup wizard only).
  // Athlete routes /athlete/onboarding, /athlete/dashboard, /athlete/profile-update
  // are explicitly protected by the if-blocks above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|my-plan|connect|onboarding).*)",
  ],
};
