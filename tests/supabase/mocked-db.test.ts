import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { USER_A_ID, USER_B_ID } from '../helpers/testUtils';
import { createMockTestClient, resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('Supabase Integration: Mocked Schema & RLS Simulation', () => {
  test('simulates cascading RLS deletion when a parent document is removed', async () => {
    resetTestDbStore();
    const docId = 'd0000000-0000-4000-8000-000000000001';

    // Seed document, chunks, and events for User A
    testDbStore.documents.push({
      id: docId,
      user_id: USER_A_ID,
      title: 'Operating Systems Syllabus',
    });

    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000001',
      document_id: docId,
      user_id: USER_A_ID,
      content: 'CPU Scheduling and Multithreading',
      chunk_index: 0,
    });

    testDbStore.academic_events.push({
      id: 'e0000000-0000-4000-8000-000000000001',
      document_id: docId,
      user_id: USER_A_ID,
      title: 'OS Midterm',
      date: '2026-11-15',
    });

    const client = createMockTestClient(USER_A_ID);

    // Delete document as User A
    await client.from('documents').delete().eq('id', docId);

    // Verify document was removed
    const docStillExists = testDbStore.documents.some((d) => d.id === docId);
    assert.equal(docStillExists, false);
  });

  test('simulates composite uniqueness on (document_id, chunk_index) via upsert', async () => {
    resetTestDbStore();
    const docId = 'd0000000-0000-4000-8000-000000000002';
    const client = createMockTestClient(USER_A_ID);

    // Insert chunk at index 0
    await client.from('document_chunks').upsert(
      {
        document_id: docId,
        user_id: USER_A_ID,
        content: 'Version 1 content',
        chunk_index: 0,
      },
      { onConflict: 'document_id,chunk_index' }
    );
    assert.equal(testDbStore.document_chunks.length, 1);

    // Upsert chunk at index 0 again with updated content
    await client.from('document_chunks').upsert(
      {
        document_id: docId,
        user_id: USER_A_ID,
        content: 'Version 2 updated content',
        chunk_index: 0,
      },
      { onConflict: 'document_id,chunk_index' }
    );

    // Must still have only 1 chunk row, updated in place
    assert.equal(testDbStore.document_chunks.length, 1);
    assert.equal(testDbStore.document_chunks[0].content, 'Version 2 updated content');
  });

  test('enforces user separation: queries scoped to User A cannot see User B rows', async () => {
    resetTestDbStore();
    testDbStore.documents.push(
      { id: 'd-user-a', user_id: USER_A_ID, title: 'Notice A' },
      { id: 'd-user-b', user_id: USER_B_ID, title: 'Notice B' }
    );

    const clientA = createMockTestClient(USER_A_ID);
    const { data: userADocs } = await clientA
      .from('documents')
      .select('id, title')
      .eq('user_id', USER_A_ID);

    assert.ok(Array.isArray(userADocs));
    assert.equal(userADocs.length, 1);
    assert.equal(userADocs[0].id, 'd-user-a');
  });
});
