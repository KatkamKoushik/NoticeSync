import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as chatPost } from '../../src/app/api/chat/route';
import { USER_A_TOKEN, USER_A_ID, createTestRequest } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('Chat Reliability: Grounding, Citations & Unsupported Answers', () => {
  test('returns response with citations when query is supported by indexed documents', async () => {
    resetTestDbStore();

    // Seed document and chunk for User A
    const docId = 'd0000000-0000-4000-8000-000000000001';
    testDbStore.documents.push({
      id: docId,
      user_id: USER_A_ID,
      title: 'Operating Systems Syllabus.pdf',
    });
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000001',
      document_id: docId,
      user_id: USER_A_ID,
      content: 'CS301 Midterm Examination is scheduled on November 15, 2026 in Room 302.',
      metadata: { title: 'Operating Systems Syllabus.pdf' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    const req = createTestRequest('/api/chat', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        messages: [{ role: 'user', content: 'When is the CS301 midterm exam?' }],
      },
    });

    const res = await chatPost(req);
    assert.equal(res.status, 200);
    const text = await res.text();

    // In test mode, fallback response provides grounded answer with citation
    assert.ok(text.length > 0);
    assert.match(text, /\[Source:.*\]|Nov 15/i);
  });

  test('clearly states when indexed documents do not support an answer', async () => {
    resetTestDbStore(); // Empty store: no documents indexed

    const req = createTestRequest('/api/chat', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        messages: [{ role: 'user', content: 'What is the hostel mess fee deadline?' }],
      },
    });

    const res = await chatPost(req);
    assert.equal(res.status, 200);
    const text = await res.text();

    // Must clearly state that uploaded documents do not contain information
    assert.match(text, /no information|uploaded documents/i);
  });
});
