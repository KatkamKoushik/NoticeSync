import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as jobsPost } from '../../src/app/api/jobs/route';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { computeContentHash, computeEventDedupHash } from '../../src/lib/ingestion/hash';
import { storeChunk } from '../../src/lib/rag/storage';
import { USER_A_ID, USER_B_ID, USER_A_TOKEN, createTestRequest } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore, createMockTestClient } from '../../src/lib/auth/server';

describe('Ingestion Reliability: Idempotency & Deduplication', () => {
  test('POST /api/jobs returns identical jobId on repeated idempotency key submissions', async () => {
    resetTestDbStore();
    const idempotencyKey = 'req-key-abc-123';

    // First submission
    const req1 = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: { idempotencyKey },
    });
    const res1 = await jobsPost(req1);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.ok(data1.jobId);
    assert.equal(data1.replayed, undefined);

    // Second submission with same idempotency key
    const req2 = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: { idempotencyKey },
    });
    const res2 = await jobsPost(req2);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.jobId, data1.jobId, 'Must return the same jobId');
    assert.equal(data2.replayed, true, 'Must indicate replayed result');

    // Verify exactly 1 job was created in DB
    const jobsForUser = testDbStore.processing_jobs.filter((j) => j.user_id === USER_A_ID);
    assert.equal(jobsForUser.length, 1, 'Should not create duplicate job rows');
  });

  test('computeContentHash generates deterministic hashes scoped to user and source type', () => {
    const text = 'Computer Science 101 Syllabus Fall 2026';
    const hash1 = computeContentHash(USER_A_ID, 'text', text);
    const hash2 = computeContentHash(USER_A_ID, 'text', text);
    assert.equal(hash1, hash2, 'Identical content must produce identical hash');

    // Scoped to user: User B with same text produces different hash
    const hashUserB = computeContentHash(USER_B_ID, 'text', text);
    assert.notEqual(hash1, hashUserB, 'Content hash must be user-isolated');

    // Scoped to source type
    const hashPdf = computeContentHash(USER_A_ID, 'pdf', text);
    assert.notEqual(hash1, hashPdf, 'Content hash must be source-type isolated');
  });

  test('computeEventDedupHash normalizes case, whitespace, and null dates', () => {
    const hash1 = computeEventDedupHash('Final Examination', '2026-12-15', 'Exam');
    const hash2 = computeEventDedupHash('  final  examination  ', '2026-12-15', 'exam');
    assert.equal(hash1, hash2, 'Event dedup hash must normalize casing and whitespace');

    const hashNullDate1 = computeEventDedupHash('TBA Quiz', null, 'Exam');
    const hashNullDate2 = computeEventDedupHash('TBA Quiz', undefined, 'Exam');
    assert.equal(hashNullDate1, hashNullDate2, 'Event dedup hash handles nullish dates consistently');
  });

  test('storeChunk is idempotent and does not create duplicate chunks on retry', async () => {
    resetTestDbStore();
    const mockClient = createMockTestClient(USER_A_ID);
    const documentId = 'c0000000-0000-4000-8000-000000000001';

    // Seed document in store
    testDbStore.documents.push({
      id: documentId,
      user_id: USER_A_ID,
      title: 'CS101 Syllabus',
    });

    // 1. Initial chunk store
    await storeChunk({
      userId: USER_A_ID,
      documentId,
      content: 'Chapter 1: Algorithms',
      chunkIndex: 0,
      client: mockClient,
    });

    assert.equal(testDbStore.document_chunks.length, 1);

    // 2. Retry chunk store with same chunkIndex
    await storeChunk({
      userId: USER_A_ID,
      documentId,
      content: 'Chapter 1: Algorithms (updated)',
      chunkIndex: 0,
      client: mockClient,
    });

    // Should still have exactly 1 chunk row, updated in-place via upsert
    assert.equal(testDbStore.document_chunks.length, 1, 'Chunk count must remain 1');
    assert.equal(testDbStore.document_chunks[0].content, 'Chapter 1: Algorithms (updated)');
  });

  test('POST /api/parse reuses document record via content_hash on duplicate text upload', async () => {
    resetTestDbStore();

    const sampleNotice =
      'Midterm exam will be held on November 15, 2026 in Hall A. Attendance is mandatory.';

    // First parse submission
    const form1 = new FormData();
    form1.append('text', sampleNotice);

    const req1 = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData: form1,
    });

    const res1 = await parsePost(req1);
    assert.equal(res1.status, 200);

    const initialDocsCount = testDbStore.documents.length;
    assert.equal(initialDocsCount, 1);

    // Second parse submission with identical text
    const form2 = new FormData();
    form2.append('text', sampleNotice);

    const req2 = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData: form2,
    });

    const res2 = await parsePost(req2);
    assert.equal(res2.status, 200);

    // Document record count must still be 1 (reused via content_hash)
    assert.equal(
      testDbStore.documents.length,
      1,
      'Duplicate text upload must not create duplicate document records'
    );
  });
});
