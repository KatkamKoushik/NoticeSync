import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasRealDbCredentials = Boolean(
  SUPABASE_URL &&
  SERVICE_KEY &&
  !SUPABASE_URL.includes('placeholder') &&
  !SERVICE_KEY.includes('placeholder')
);

describe('Supabase Integration: Real Database Checks (Credentials Required)', () => {
  test('connects to real Supabase PostgreSQL instance if credentials are provided', async (t) => {
    if (!hasRealDbCredentials) {
      t.skip(
        'Skipping real database test: Real Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are not configured in this environment.'
      );
      return;
    }

    const client = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Query documents table schema verification
    const { data, error } = await client
      .from('documents')
      .select('id')
      .limit(1);

    assert.equal(error, null, `Database connection error: ${error?.message}`);
    assert.ok(Array.isArray(data));
  });

  test('verifies pgvector match_document_chunks RPC availability if live database is configured', async (t) => {
    if (!hasRealDbCredentials) {
      t.skip(
        'Skipping pgvector RPC test: Real Supabase credentials are not configured in this environment.'
      );
      return;
    }

    const client = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Test vector function with dummy 768-dim query
    const dummyEmbedding = Array(768).fill(0.01);
    const { error } = await client.rpc('match_document_chunks', {
      query_embedding: dummyEmbedding,
      match_threshold: 0.9,
      match_count: 1,
      p_user_id: '00000000-0000-4000-8000-000000000000',
    });

    // Function should execute without schema or function definition errors
    assert.equal(error, null, `match_document_chunks RPC error: ${error?.message}`);
  });
});
