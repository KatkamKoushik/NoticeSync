import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createMockTestClient } from '../auth/server';

/**
 * Server-side Supabase client initialized with the Service Role Key.
 * 
 * SECURITY NOTICE:
 * - This client bypasses Row Level Security (RLS).
 * - Keep this module server-only (never import in client components).
 * - In request handlers, prefer user-scoped clients (from `@/lib/auth/server`)
 *   which enforce RLS based on the verified session JWT.
 * - Always explicitly authorize the caller and verify resource ownership
 *   before performing any privileged operation with this client.
 */

let cachedServerClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV === 'test' || process.env.NOTICE_SYNC_TEST_MODE === 'true') {
      // Return deterministic in-memory mock client for test environments
      return createMockTestClient('00000000-0000-4000-8000-000000000000');
    }
    throw new Error('Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
  }

  if (!cachedServerClient) {
    cachedServerClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedServerClient;
}

// Proxy wrapper for backward compatibility with existing server references
export const supabaseServer: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseServerClient();
    const val = Reflect.get(client, prop);
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
