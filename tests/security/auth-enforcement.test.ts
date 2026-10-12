import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as jobsPost, GET as jobsGet } from '../../src/app/api/jobs/route';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { POST as chatPost } from '../../src/app/api/chat/route';
import { POST as briefPost } from '../../src/app/api/brief/route';
import { GET as memoryGet, DELETE as memoryDelete } from '../../src/app/api/memory/route';
import { createTestRequest } from '../helpers/testUtils';

describe('Security: Authentication Enforcement', () => {
  test('rejects unauthenticated POST /api/jobs with 401', async () => {
    const req = createTestRequest('/api/jobs', { method: 'POST', body: {} });
    const res = await jobsPost(req);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Authentication required/i);
  });

  test('rejects unauthenticated GET /api/jobs with 401', async () => {
    const req = createTestRequest('/api/jobs?jobId=a0000000-0000-4000-8000-000000000001', { method: 'GET' });
    const res = await jobsGet(req);
    assert.equal(res.status, 401);
  });

  test('rejects unauthenticated POST /api/parse with 401', async () => {
    const formData = new FormData();
    formData.append('text', 'Midterm exam scheduled for October 10');
    const req = createTestRequest('/api/parse', { method: 'POST', formData });
    const res = await parsePost(req);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Authentication required/i);
  });

  test('rejects unauthenticated POST /api/chat with 401', async () => {
    const req = createTestRequest('/api/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'When is my exam?' }] },
    });
    const res = await chatPost(req);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Authentication required/i);
  });

  test('rejects unauthenticated POST /api/brief with 401', async () => {
    const req = createTestRequest('/api/brief', {
      method: 'POST',
      body: { events: [{ title: 'Exam', date: '2026-10-10' }] },
    });
    const res = await briefPost(req);
    assert.equal(res.status, 401);
  });

  test('rejects unauthenticated GET /api/memory with 401', async () => {
    const req = createTestRequest('/api/memory', { method: 'GET' });
    const res = await memoryGet(req);
    assert.equal(res.status, 401);
  });

  test('rejects unauthenticated DELETE /api/memory with 401', async () => {
    const req = createTestRequest('/api/memory?id=a0000000-0000-4000-8000-000000000001', { method: 'DELETE' });
    const res = await memoryDelete(req);
    assert.equal(res.status, 401);
  });
});
