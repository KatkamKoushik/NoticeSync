import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { isValidUuid } from '../validation/security';
import { v4 as uuidv4 } from 'uuid';

export class AuthError extends Error {
  public readonly status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export interface AuthenticatedSession {
  user: {
    id: string;
    email?: string;
  };
  token: string;
  userClient: SupabaseClient;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Extracts the bearer token from the Authorization header or cookies.
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return token;
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
              return parsed[0];
            }
            if (parsed && typeof parsed.access_token === 'string') {
              return parsed.access_token;
            }
          }
        } catch {
          // Not JSON
        }
        if (val && typeof val === 'string' && val.length > 20) {
          return val;
        }
      }
    }
  }

  return null;
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

export function createMockTestClient(userId: string): SupabaseClient {
  return {
    from: (table: string) => {
      const filters: Array<{ col: string; val: unknown; op?: 'eq' | 'neq' }> = [];

      interface MockQueryBuilder {
        select: (cols?: string) => MockQueryBuilder;
        insert: (record: Record<string, unknown> | Array<Record<string, unknown>>) => {
          select: (cols?: string) => { single: () => Promise<{ data: Record<string, unknown>; error: null }> };
          single: () => Promise<{ data: Record<string, unknown>; error: null }>;
        };
        upsert: (
          record: Record<string, unknown> | Array<Record<string, unknown>>,
          options?: { onConflict?: string }
        ) => {
          select: (cols?: string) => { single: () => Promise<{ data: Record<string, unknown>; error: null }> };
          single: () => Promise<{ data: Record<string, unknown>; error: null }>;
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
          };
        };
        eq: (col: string, val: unknown) => MockQueryBuilder;
        neq: (col: string, val: unknown) => MockQueryBuilder;
        order: () => MockQueryBuilder;
        limit: () => MockQueryBuilder;
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
      }

      const matchFilters = (item: Record<string, unknown>) => {
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
            const newRow = { id: row.id || uuidv4(), ...row, user_id: row.user_id || userId };
            testDbStore[table].push(newRow);
            created.push(newRow);
          }
          return {
            select: () => ({
              single: async () => ({ data: created[0], error: null }),
            }),
            single: async () => ({ data: created[0], error: null }),
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
            const existingIdx = list.findIndex((item) =>
              conflictCols.every((col) => item[col] === row[col])
            );
            if (existingIdx >= 0) {
              list[existingIdx] = {
                ...list[existingIdx],
                ...row,
                user_id: row.user_id || list[existingIdx].user_id || userId,
              };
              upserted.push(list[existingIdx]);
            } else {
              const newRow = { id: row.id || uuidv4(), ...row, user_id: row.user_id || userId };
              list.push(newRow);
              upserted.push(newRow);
            }
          }

          return {
            select: () => ({
              single: async () => ({ data: upserted[0], error: null }),
            }),
            single: async () => ({ data: upserted[0], error: null }),
          };
        },
        update: (updates: Record<string, unknown>) => {
          return {
            eq: (col1: string, val1: unknown) => {
              const applyUpdate = (extraCol?: string, extraVal?: unknown) => {
                const list = testDbStore[table] || [];
                for (const item of list) {
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
        limit: () => builder,
        single: async () => {
          const list = testDbStore[table] || [];
          const found = list.find(matchFilters);
          if (!found) {
            return { data: null, error: { message: 'Row not found' } };
          }
          return { data: found, error: null };
        },
        then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => unknown) => {
          const list = (testDbStore[table] || []).filter(matchFilters);
          return Promise.resolve(resolve({ data: list, error: null }));
        },
      };
      return builder;
    },
    rpc: async (func: string, params: Record<string, unknown>) => {
      if (func === 'match_document_chunks') {
        const targetUserId = params.p_user_id;
        const chunks = (testDbStore.document_chunks || []).filter(
          (c) => c.user_id === targetUserId
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
 * 
 * Rejects unauthenticated requests and client-supplied user IDs.
 */
export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedSession> {
  const token = extractBearerToken(req);

  if (!token) {
    throw new AuthError('Authentication required. Missing Bearer token.', 401);
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
    userClient,
  };
}

/**
 * Returns the privileged Service Role client for trusted background operations.
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
