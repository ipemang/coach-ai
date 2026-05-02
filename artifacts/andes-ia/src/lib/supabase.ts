import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string ?? "";

export function createBrowserSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Supabase env vars not set — auth features disabled.");
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "implicit" },
  });
}

export const supabase = (() => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null as unknown as ReturnType<typeof createBrowserClient>;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "implicit" } });
})();
