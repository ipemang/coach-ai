import { createBrowserSupabase } from "./supabase";

export const BACKEND = import.meta.env.VITE_BACKEND_URL as string || "https://coach-ai-production-a5aa.up.railway.app";

export async function getAuthToken(): Promise<string | null> {
  const sb = createBrowserSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token ?? null;
}

export function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "==".slice((b64.length % 4) || 4);
    return JSON.parse(window.atob(pad));
  } catch {
    return {};
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BACKEND}${path}`, { ...options, headers });
}
