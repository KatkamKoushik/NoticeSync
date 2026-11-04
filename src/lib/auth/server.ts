import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { isValidUuid } from '../validation/security';
import { enforceCsrf } from '../security/csrf';
import { v4 as uuidv4 } from 'uuid';

export class AuthError extends Error {
  public readonly status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export type AuthType = 'bearer' | 'cookie';

export interface AuthenticatedSession {
  user: {
    id: string;
    email?: string;
  };
  token: string;
  authType: AuthType;
  userClient: SupabaseClient;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface ExtractedAuth {
  token: string;
  authType: AuthType;
}

/**
 * Extracts authentication token and transport type from Authorization header or cookies.
 */
export function extractAuthToken(req: Request): ExtractedAuth | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return { token, authType: 'bearer' };
  }

  // Check cookies for Supabase auth tokens
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );

    // Look for sb-access-token or sb-<project>-auth-token
    for (const [name, val] of Object.entries(cookies)) {
      if (name.endsWith('-auth-token') || name === 'sb-access-token') {
        try {
          if (val.startsWith('[') || val.startsWith('{')) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
              return { token: parsed[0], authType: 'cookie' };
            }
            if (parsed && typeof parsed.access_token === 'string') {
              return { token: parsed.access_token, authType: 'cookie' };
            }
          }
        } catch {
          // Not JSON
        }
        if (val && typeof val === 'string' && val.length > 5) {
          return { token: val, authType: 'cookie' };
        }
      }
    }
  }

  return null;
}

/**
 * Extracts the bearer token from the Authorization header or cookies.
 * Maintained for backward compatibility.
 */
export function extractBearerToken(req: Request): string | null {
  const auth = extractAuthToken(req);
  return auth ? auth.token : null;
}

/**
 * Known deterministic mock sessions for automated tests (active only in test environments).
 */
export const TEST_SESSIONS: Record<string, { id: string; email: string }> = {
  'test-token-user-a': { id: 'a0000000-0000-4000-8000-000000000001', email: 'user-a@example.com' },
  'test-token-user-b': { id: 'b0000000-0000-4000-8000-000000000002', email: 'user-b@example.com' },
};

// In-memory test store for standalone security and reliability testing
export const testDbStore: Record<string, Array<Record<string, unknown>>> = {
  processing_jobs: [],
  documents: [],
  document_chunks: [],
  academic_events: [],
};

export function resetTestDbStore() {
  testDbStore.processing_jobs = [];
  testDbStore.documents = [];
  testDbStore.document_chunks = [];
  testDbStore.academic_events = [];
}

/**
 * Creates an in-memory mock client that strictly simulates PostgreSQL Row Level Security (RLS).
 * All queries and mutations are isolated to the specified userId.
 */
export function createMockTestClient(userId: string): SupabaseClient {
  return {
    from: (table: string) => {
      const filters: Array<{ col: string; val: unknown; op?: 'eq' | 'neq' }> = [];

      interface MockQueryBuilder {
        select: (cols?: string) => MockQueryBuilder;
        insert: (record: Record<string, unknown> | Array<Record<string, unknown>>) => {
          select: (cols?: string) => {
            single: () => Promise<{ data: Record<string, unknown>; error: null }>;
            then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
          };
          single: () => Promise<{ data: Record<string, unknown>; error: null }>;
          then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
        };
        upsert: (
          record: Record<string, unknown> | Array<Record<string, unknown>>,
          options?: { onConflict?: string }
        ) => {
          select: (cols?: string) => {
            single: () => Promise<{ data: Record<string, unknown>; error: null }>;
            then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
          };
          single: () => Promise<{ data: Record<string, unknown>; error: null }>;
          then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
        };
        update: (updates: Record<string, unknown>) => {
          eq: (col1: string, val1: unknown) => {
            eq: (col2: string, val2: unknown) => Promise<{ data: null; error: null }>;
            then: (resolve: (val: { data: null; error: null }) => unknown) => Promise<unknown>;
          };
        };
        delete: () => {
          eq: (col1: string, val1: unknown) => {
            eq: (col2: string, val2: unknown) => Promise<{ data: null; error: null }>;
            then: (resolve: (val: { data: null; error: null }) => unknown) => Promise<unknown>;
          };
        };
        eq: (col: string, val: unknown) => MockQueryBuilder;
        neq: (col: string, val: unknown) => MockQueryBuilder;
        order: () => MockQueryBuilder;
        limit: (n: number) => MockQueryBuilder;
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
      }

      let limitCount: number | null = null;

      const matchFilters = (item: Record<string, unknown>) => {
        // Enforce RLS simulation: user can only see their own records
        if (item.user_id && item.user_id !== userId) {
          return false;
        }
        return filters.every((f) => {
          if (f.op === 'neq') return item[f.col] !== f.val;
          return item[f.col] === f.val;
        });
      };

      const builder: MockQueryBuilder = {
        select: () => builder,
        insert: (record: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const rows = Array.isArray(record) ? record : [record];
          const created: Array<Record<string, unknown>> = [];
          if (!testDbStore[table]) testDbStore[table] = [];
          for (const row of rows) {
            // RLS check on insert: cannot insert records for other users
            if (row.user_id && row.user_id !== userId) {
              throw new Error('RLS check violation: cannot insert row belonging to another user.');
            }
            const newRow = { ...row, id: row.id || uuidv4(), user_id: userId };
            testDbStore[table].push(newRow);
            created.push(newRow);
          }
          return {
            select: () => ({
              single: async () => ({ data: created[0], error: null }),
              then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
                Promise.resolve({ data: created, error: null }).then(resolve),
            }),
            single: async () => ({ data: created[0], error: null }),
            then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
              Promise.resolve({ data: created, error: null }).then(resolve),
          };
        },
        upsert: (
          record: Record<string, unknown> | Array<Record<string, unknown>>,
          options?: { onConflict?: string }
        ) => {
          const rows = Array.isArray(record) ? record : [record];
          const conflictCols = options?.onConflict
            ? options.onConflict.split(',').map((s) => s.trim())
            : ['id'];
          const upserted: Array<Record<string, unknown>> = [];
          if (!testDbStore[table]) testDbStore[table] = [];
          const list = testDbStore[table];

          for (const row of rows) {
            if (row.user_id && row.user_id !== userId) {
              throw new Error('RLS check violation: cannot upsert row belonging to another user.');
            }
            const existingIdx = list.findIndex(
              (item) =>
                item.user_id === userId &&
                conflictCols.every((col) => item[col] === row[col])
            );
            if (existingIdx >= 0) {
              list[existingIdx] = {
                ...list[existingIdx],
                ...row,
                user_id: userId,
              };
              upserted.push(list[existingIdx]);
            } else {
              const newRow = { ...row, id: row.id || uuidv4(), user_id: userId };
              list.push(newRow);
              upserted.push(newRow);
            }
          }

          return {
            select: () => ({
              single: async () => ({ data: upserted[0], error: null }),
              then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
                Promise.resolve({ data: upserted, error: null }).then(resolve),
            }),
            single: async () => ({ data: upserted[0], error: null }),
            then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
              Promise.resolve({ data: upserted, error: null }).then(resolve),
          };
        },
        update: (updates: Record<string, unknown>) => {
          return {
            eq: (col1: string, val1: unknown) => {
              const applyUpdate = (extraCol?: string, extraVal?: unknown) => {
                const list = testDbStore[table] || [];
                for (const item of list) {
                  // RLS simulation: only update records owned by this user
                  if (item.user_id !== userId) continue;
                  const match1 = item[col1] === val1;
                  const match2 = extraCol ? item[extraCol] === extraVal : true;
                  if (match1 && match2) {
                    Object.assign(item, updates);
                  }
                }
                return Promise.resolve({ data: null, error: null });
              };

              return {
                eq: (col2: string, val2: unknown) => applyUpdate(col2, val2),
                then: (resolve: (val: { data: null; error: null }) => unknown) =>
                  applyUpdate().then(resolve),
              };
            },
          };
        },
        delete: () => ({
          eq: (col1: string, val1: unknown) => {
            const applyDelete = (extraCol?: string, extraVal?: unknown) => {
              if (testDbStore[table]) {
                const toDelete = testDbStore[table].filter((item) => {
                  // RLS simulation: only delete records owned by this user
                  if (item.user_id !== userId) return false;
                  const match1 = item[col1] === val1;
                  const match2 = extraCol ? item[extraCol] === extraVal : true;
                  return match1 && match2;
                });

                testDbStore[table] = testDbStore[table].filter((item) => !toDelete.includes(item));

                // Cascade deletion for documents
                if (table === 'documents') {
                  for (const deletedDoc of toDelete) {
                    const docId = deletedDoc.id;
                    if (testDbStore.document_chunks) {
                      testDbStore.document_chunks = testDbStore.document_chunks.filter(
                        (c) => c.document_id !== docId
                      );
                    }
                    if (testDbStore.academic_events) {
                      testDbStore.academic_events = testDbStore.academic_events.filter(
                        (e) => e.document_id !== docId
                      );
                    }
                  }
                }
              }
              return Promise.resolve({ data: null, error: null });
            };

            return {
              eq: (col2: string, val2: unknown) => applyDelete(col2, val2),
              then: (resolve: (val: { data: null; error: null }) => unknown) =>
                applyDelete().then(resolve),
            };
          },
        }),
        eq: (col: string, val: unknown) => {
          filters.push({ col, val, op: 'eq' });
          return builder;
        },
        neq: (col: string, val: unknown) => {
          filters.push({ col, val, op: 'neq' });
          return builder;
        },
        order: () => builder,
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        single: async () => {
          const list = testDbStore[table] || [];
          const found = list.find(matchFilters);
          if (!found) {
            return { data: null, error: { message: 'Row not found' } };
          }
          return { data: found, error: null };
        },
        then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
          let list = (testDbStore[table] || []).filter(matchFilters);
          if (limitCount !== null) {
            list = list.slice(0, limitCount);
          }
          return Promise.resolve(resolve({ data: list, error: null }));
        },
      };
      return builder;
    },
    rpc: async (func: string, params: Record<string, unknown>) => {
      if (func === 'match_document_chunks') {
        const targetUserId = params.p_user_id;
        // RLS check: cannot request chunks for another user
        if (targetUserId !== userId) {
          return { data: [], error: { message: 'Access denied: user isolation violation' } };
        }
        const chunks = (testDbStore.document_chunks || []).filter(
          (c) => c.user_id === userId
        );
        return { data: chunks, error: null };
      }
      return { data: [], error: null };
    },
  } as unknown as SupabaseClient;
}

/**
 * Creates a Supabase client scoped to a user's authenticated JWT session.
 * All queries executed through this client run with PostgreSQL RLS (auth.uid() = user.id).
 */
export function createUserScopedClient(token: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new AuthError('Supabase configuration missing on server', 500);
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * Verifies the caller's server-side session and returns the verified user identity.
 * Rejects unauthenticated requests, invalid sessions, and CSRF violations.
 */
export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedSession> {
  const authInfo = extractAuthToken(req);

  if (!authInfo || !authInfo.token) {
    throw new AuthError('Authentication required. Missing Bearer token or session cookie.', 401);
  }

  const { token, authType } = authInfo;

  // Enforce CSRF protection for cookie-authenticated state-changing requests
  if (authType === 'cookie') {
    const csrfResponse = enforceCsrf(req, authType);
    if (csrfResponse) {
      throw new AuthError('Cross-site request blocked by CSRF / Fetch Metadata policy.', 403);
    }
  }

  // Handle deterministic test sessions in test or mock environments
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NOTICE_SYNC_TEST_MODE === 'true';
  if (isTestEnv && TEST_SESSIONS[token]) {
    const testUser = TEST_SESSIONS[token];
    const userClient = (SUPABASE_URL && SUPABASE_ANON_KEY)
      ? createUserScopedClient(token)
      : createMockTestClient(testUser.id);

    return {
      user: testUser,
      token,
      authType,
      userClient,
    };
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new AuthError('Server authentication service unavailable.', 500);
  }

  // Verify the JWT cryptographically via Supabase Auth server
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await anonClient.auth.getUser(token);

  if (error || !data?.user) {
    throw new AuthError('Invalid or expired authentication session.', 401);
  }

  const user: User = data.user;
  if (!isValidUuid(user.id)) {
    throw new AuthError('Invalid user identity format.', 401);
  }

  const userClient = createUserScopedClient(token);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token,
    authType,
    userClient,
  };
}

/**
 * Returns the privileged Service Role client for trusted background operations.
 *
 * SECURITY DIRECTIVE:
 * - This client bypasses PostgreSQL Row Level Security (RLS).
 * - Keep this client restricted to administrative tasks and system scripts.
 * - Under NO CIRCUMSTANCES should this client be used in user-facing endpoints
 *   or as a fallback when user sessions fail.
 */
export function getServiceRoleClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
