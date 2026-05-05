import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// F-C7: SUPABASE_SERVICE_ROLE_KEY removed from module level.
// It was evaluated at import time, meaning any bundler failure that included
// this file in a client bundle would leak the service role key.
// The key is now read inside createAdminSupabase() only, which is server-only.

// Browser client — safe to use in client components.
// Uses implicit flow (not PKCE) to avoid Gmail link-scanner consuming the
// one-time PKCE code before the user clicks. Tokens are returned in the
// URL hash, which email scanners don't follow.
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "implicit" },
  });
}

// Admin client — server-side only, never expose to browser.
// Reads SUPABASE_SERVICE_ROLE_KEY lazily (inside function) so the secret
// is never evaluated at module import time.
export function createAdminSupabase() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Legacy export — browser-safe
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: "implicit" },
});
