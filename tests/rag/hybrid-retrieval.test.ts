import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeLexicalScore, retrieveRelevantChunks } from '../../src/lib/rag/storage';
import { USER_A_ID } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore, createMockTestClient } from '../../src/lib/auth/server';

describe('RAG Reliability: Hybrid Retrieval & Lexical Scoring', () => {
  test('computeLexicalScore calculates accurate token overlap ratio', () => {
    const chunk = 'The CS101 final examination will be held in Hall 4 on December 15.';
    const query = 'When is the CS101 final exam?';

    const score = computeLexicalScore(chunk, query);
    // Tokens extracted: cs101, final, exam (exam/examination may partially match)
    assert.ok(score > 0.5, `Expected score > 0.5, got ${score}`);

    // Irrelevant query
    const irrelevantQuery = 'biology lab dissection frog';
    const scoreIrrelevant = computeLexicalScore(chunk, irrelevantQuery);
    assert.equal(scoreIrrelevant, 0);

    // Empty inputs
    assert.equal(computeLexicalScore('', query), 0);
    assert.equal(computeLexicalScore(chunk, ''), 0);
  });

  test('retrieveRelevantChunks boosts chunks with exact keyword matches', async () => {
    resetTestDbStore();
    const mockClient = createMockTestClient(USER_A_ID);

    // Chunk 1: High lexical match for CS101
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000010',
      document_id: 'd0000000-0000-4000-8000-000000000010',
      user_id: USER_A_ID,
      content: 'CS101 Final Exam will be held on December 15 in Main Hall.',
      metadata: { title: 'CS101 Course Guide' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    // Chunk 2: Generic text with less keyword overlap
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000011',
      document_id: 'd0000000-0000-4000-8000-000000000011',
      user_id: USER_A_ID,
      content: 'General campus library hours and guidelines for reading week.',
      metadata: { title: 'Library Guide' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    const results = await retrieveRelevantChunks({
      query: 'CS101 Final Exam Schedule',
      userId: USER_A_ID,
      client: mockClient,
      matchCount: 2,
    });

    assert.ok(results.length > 0);
    // The top ranked chunk must be the CS101 exam chunk
    assert.equal(results[0].id, 'c0000000-0000-4000-8000-000000000010');
    assert.ok(results[0].similarity > results[1]?.similarity || 0);
  });
});
