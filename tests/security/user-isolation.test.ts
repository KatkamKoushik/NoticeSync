import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { storeChunk, retrieveRelevantChunks } from '../../src/lib/rag/storage';
import { USER_A_ID, USER_B_ID, USER_A_TOKEN, USER_B_TOKEN, createTestRequest } from '../helpers/testUtils';
import { GET as jobsGet } from '../../src/app/api/jobs/route';

describe('Security: User Isolation & Ownership Enforcement', () => {
  test('storeChunk rejects associating a chunk with another user document', async () => {
    // Mock Supabase client where document belongs to USER_B, but chunk insertion is attempted by USER_A
    const mockClient: any = {
      from: (table: string) => ({
        select: () => ({
          eq: (col1: string, val1: string) => ({
            eq: (col2: string, val2: string) => ({
              single: async () => {
                // If table is documents, pretend document exists under USER_B only
                if (table === 'documents') {
                  if (val1 === 'd0000000-0000-4000-8000-000000000002' && val2 === USER_A_ID) {
                    // Document does NOT belong to User A!
                    return { data: null, error: { message: 'Row not found' } };
                  }
                }
                return { data: { id: val1, user_id: USER_B_ID }, error: null };
              },
            }),
          }),
        }),
      }),
    };

    await assert.rejects(
      async () => {
        await storeChunk({
          userId: USER_A_ID,
          documentId: 'd0000000-0000-4000-8000-000000000002', // Belongs to User B!
          content: 'Compromised chunk content',
          chunkIndex: 0,
          client: mockClient,
        });
      },
      (err: any) => {
        assert.equal(err.status, 403);
        assert.match(err.message, /ownership mismatch|cannot associate/i);
        return true;
      }
    );
  });

  test('User A cannot poll or view User B processing job', async () => {
    // User A authenticates with USER_A_TOKEN, but requests a jobId that belongs to User B
    const userBJobId = '99999999-9999-4999-8999-999999999999';
    const req = createTestRequest(`/api/jobs?jobId=${userBJobId}`, {
      method: 'GET',
      token: USER_A_TOKEN,
    });

    const res = await jobsGet(req);
    // Since job does not exist for User A, must return 404
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.match(data.error, /Job not found or access denied/i);
  });

  test('vector retrieval path requires valid UUID and passes explicit user_id filter', async () => {
    let capturedUserId: string | null = null;
    const mockClient: any = {
      rpc: async (func: string, params: any) => {
        if (func === 'match_document_chunks') {
          capturedUserId = params.p_user_id;
          return { data: [], error: null };
        }
        return { data: null, error: null };
      },
    };

    // Retrieve chunks with User A's ID
    const chunks = await retrieveRelevantChunks({
      query: 'Computer Science Syllabus',
      userId: USER_A_ID,
      client: mockClient,
    });

    assert.ok(Array.isArray(chunks));
    assert.equal(capturedUserId, USER_A_ID, 'Vector RPC must strictly bind to caller user_id');
  });

  test('vector retrieval path rejects invalid or malformed user IDs', async () => {
    await assert.rejects(
      async () => {
        await retrieveRelevantChunks({
          query: 'Malicious retrieval',
          userId: 'not-a-valid-uuid',
        });
      },
      (err: any) => {
        assert.equal(err.status, 400);
        return true;
      }
    );
  });
});
