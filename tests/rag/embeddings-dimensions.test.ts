import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEmbedding } from '../../src/lib/rag/embeddings';
import { storeChunk } from '../../src/lib/rag/storage';
import { USER_A_ID } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore, createMockTestClient } from '../../src/lib/auth/server';

describe('RAG Reliability: Embedding Model Compatibility & Dimensions', () => {
  test('getEmbedding produces vectors matching PostgreSQL schema definition of exactly 768 dimensions', async () => {
    const text = 'NoticeSync academic syllabus for Data Structures and Algorithms Fall 2026';
    const embedding = await getEmbedding(text);

    assert.ok(Array.isArray(embedding), 'Embedding must be an array');
    assert.equal(
      embedding.length,
      768,
      'Embedding dimension must be exactly 768 to match vector(768) in schema.sql'
    );

    // Validate float numeric bounds
    for (let i = 0; i < embedding.length; i++) {
      assert.equal(typeof embedding[i], 'number');
      assert.equal(Number.isNaN(embedding[i]), false);
      assert.equal(Number.isFinite(embedding[i]), true);
    }
  });

  test('storeChunk validates 768 dimensions and accepts compliant vectors', async () => {
    resetTestDbStore();
    const mockClient = createMockTestClient(USER_A_ID);
    const documentId = 'd0000000-0000-4000-8000-000000000001';

    testDbStore.documents.push({
      id: documentId,
      user_id: USER_A_ID,
      title: 'Valid Document',
    });

    const chunkResult = await storeChunk({
      userId: USER_A_ID,
      documentId,
      content: 'Binary Search Trees and AVL Trees',
      chunkIndex: 0,
      client: mockClient,
    });

    assert.ok(chunkResult);
    assert.equal(testDbStore.document_chunks.length, 1);
    const storedChunk = testDbStore.document_chunks[0];
    const embedding = storedChunk.embedding as number[];
    assert.equal(embedding.length, 768);
  });
});
