import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createMockTestClient } from '../auth/server';

/**
 * Server-side Supabase client initialized with the Service Role Key.
 * 
 * SECURITY DIRECTIVE & LEAST-PRIVILEGE CONTRACT:
 * - This client bypasses PostgreSQL Row Level Security (RLS).
 * - Keep this module server-only (never import in client components).
 * - User-facing HTTP route handlers MUST use session-scoped clients
 *   (`session.userClient` from `@/lib/auth/server`) to enforce tenant isolation.
 * - Under NO CIRCUMSTANCES should this client be used as a fallback for user queries.
 * - This client is reserved strictly for administrative tasks and schema migrations.
 */

let cachedServerClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV === 'test' || process.env.NOTICE_SYNC_TEST_MODE === 'true') {
      // In tests, return a mock client bound to a system id
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

// Proxy wrapper for administrative scripts only. User-facing routes must not use this.
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
