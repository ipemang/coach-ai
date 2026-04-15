import { createClient } from "@supabase/supabase-js";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

/** Browser client — for client components (login form, etc.) */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/** Server client — for server components that need session awareness */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server component — cookies set by middleware, ignore here
        }
      },
    },
  });
}

/** Service-role client — bypasses RLS for server-side data fetching */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/** Legacy browser client — kept for backwards compat in client components */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
