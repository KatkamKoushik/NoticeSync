import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { storeChunk, retrieveRelevantChunks } from '../../src/lib/rag/storage';
import { updateJobState } from '../../src/lib/jobs/stateMachine';
import { USER_A_ID } from '../helpers/testUtils';

describe('Security: Privileged Service Role Guard & Least-Privilege Architecture', () => {
  test('storeChunk rejects operations if client is missing outside test mode', async () => {
    const originalEnv = process.env.NOTICE_SYNC_TEST_MODE;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      // Temporarily simulate production environment
      process.env.NOTICE_SYNC_TEST_MODE = 'false';
      process.env.NODE_ENV = 'production';

      await assert.rejects(
        async () => {
          await storeChunk({
            userId: USER_A_ID,
            documentId: 'd0000000-0000-4000-8000-000000000001',
            content: 'Test content',
            chunkIndex: 0,
            client: undefined, // Missing client!
          });
        },
        (err: any) => {
          assert.equal(err.status, 403);
          assert.match(err.message, /User-scoped Supabase client is required/i);
          return true;
        }
      );
    } finally {
      process.env.NOTICE_SYNC_TEST_MODE = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('retrieveRelevantChunks rejects operations if client is missing outside test mode', async () => {
    const originalEnv = process.env.NOTICE_SYNC_TEST_MODE;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NOTICE_SYNC_TEST_MODE = 'false';
      process.env.NODE_ENV = 'production';

      await assert.rejects(
        async () => {
          await retrieveRelevantChunks({
            query: 'Test query',
            userId: USER_A_ID,
            client: undefined,
          });
        },
        (err: any) => {
          assert.equal(err.status, 403);
          assert.match(err.message, /User-scoped Supabase client is required/i);
          return true;
        }
      );
    } finally {
      process.env.NOTICE_SYNC_TEST_MODE = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('updateJobState rejects operations if client is missing outside test mode', async () => {
    const originalEnv = process.env.NOTICE_SYNC_TEST_MODE;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NOTICE_SYNC_TEST_MODE = 'false';
      process.env.NODE_ENV = 'production';

      const success = await updateJobState({
        jobId: 'j0000000-0000-4000-8000-000000000001',
        userId: USER_A_ID,
        step: 'Test',
        progress: 50,
        status: 'processing',
        client: undefined,
      });

      assert.equal(success, false, 'Must fail when user-scoped client is missing');
    } finally {
      process.env.NOTICE_SYNC_TEST_MODE = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('no user-facing API route contains fallback to supabaseServer or SUPABASE_SERVICE_ROLE_KEY', () => {
    const routesDir = path.resolve(process.cwd(), 'src/app/api');
    const routeFiles: string[] = [];

    function findRoutes(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findRoutes(fullPath);
        } else if (entry.name === 'route.ts') {
          routeFiles.push(fullPath);
        }
      }
    }

    findRoutes(routesDir);
    assert.ok(routeFiles.length >= 6, 'Must check all API routes');

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      assert.doesNotMatch(
        content,
        /supabaseServer/i,
        `Route ${file} must not reference or fall back to supabaseServer`
      );
      assert.doesNotMatch(
        content,
        /SUPABASE_SERVICE_ROLE_KEY/i,
        `Route ${file} must not reference SUPABASE_SERVICE_ROLE_KEY`
      );
      assert.doesNotMatch(
        content,
        /userClient\s*\|\|/i,
        `Route ${file} must not contain fallback pattern 'userClient || ...'`
      );
    }
  });
});

