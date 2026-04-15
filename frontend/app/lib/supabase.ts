import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// Browser client — safe to use in client components
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Admin client — server-side only, never expose to browser
// Called as a function to avoid module-level instantiation during build
export function createAdminSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Legacy export — browser-safe
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
