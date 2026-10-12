import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveRelevantChunks } from '../../src/lib/rag/storage';
import { USER_A_ID, USER_B_ID } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore, createMockTestClient } from '../../src/lib/auth/server';

describe('RAG Reliability: Retrieval Relevance & User Scoping', () => {
  test('retrieves relevant chunks scoped strictly to the authenticated user', async () => {
    resetTestDbStore();
    const mockClientUserA = createMockTestClient(USER_A_ID);

    // Seed User A's chunks (Computer Science)
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000001',
      document_id: 'd0000000-0000-4000-8000-000000000001',
      user_id: USER_A_ID,
      content: 'CS101 Final Exam will be held on December 15 in Main Auditorium.',
      metadata: { title: 'CS101 Syllabus' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    // Seed User B's chunks (Mathematics)
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000002',
      document_id: 'd0000000-0000-4000-8000-000000000002',
      user_id: USER_B_ID,
      content: 'MATH301 Midterm Examination on October 20.',
      metadata: { title: 'MATH301 Syllabus' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    // Query User A's repository
    const resultsUserA = await retrieveRelevantChunks({
      query: 'When is the CS101 final exam?',
      userId: USER_A_ID,
      client: mockClientUserA,
    });

    assert.ok(resultsUserA.length > 0);
    // Every returned chunk must belong to User A
    for (const chunk of resultsUserA) {
      assert.equal((chunk as any).user_id, USER_A_ID);
      assert.notEqual((chunk as any).user_id, USER_B_ID);
    }
  });

  test('does NOT return User B records when User A executes a query', async () => {
    resetTestDbStore();
    const mockClientUserA = createMockTestClient(USER_A_ID);

    // Seed only User B data
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000003',
      document_id: 'd0000000-0000-4000-8000-000000000003',
      user_id: USER_B_ID,
      content: 'Confidential faculty meeting minutes for Department B.',
      metadata: { title: 'Faculty Private Notice' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    // User A queries for "faculty meeting"
    const results = await retrieveRelevantChunks({
      query: 'Confidential faculty meeting minutes',
      userId: USER_A_ID,
      client: mockClientUserA,
    });

    // User A has no records matching, must return 0 results
    assert.equal(results.length, 0, 'Must never leak User B records to User A');
  });

  test('returns empty results when querying an irrelevant topic', async () => {
    resetTestDbStore();
    const mockClient = createMockTestClient(USER_A_ID);

    // Empty memory for User A
    const results = await retrieveRelevantChunks({
      query: 'Quantum spaceship rocketry and astrophysics',
      userId: USER_A_ID,
      client: mockClient,
    });

    assert.equal(results.length, 0);
  });
});
