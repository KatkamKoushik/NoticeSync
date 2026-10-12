import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// Client for browser-side public operations and Supabase Auth
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Helper to retrieve Authorization headers for the currently logged-in user.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Session retrieval failed or running offline
  }
  return {};
}

/**
 * Authenticated fetch helper for NoticeSync API routes.
 * Automatically injects the Supabase user's Bearer token.
 */
export async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const headers = new Headers(init.headers || {});

  for (const [key, val] of Object.entries(authHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, val);
    }
  }

  return fetch(url, {
    ...init,
    headers,
  });
}
