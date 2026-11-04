import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET as eventsGet, PATCH as eventsPatch, DELETE as eventsDelete, POST as eventsPost } from '../../src/app/api/events/route';
import { GET as jobsGet, POST as jobsPost } from '../../src/app/api/jobs/route';
import { GET as memoryGet, DELETE as memoryDelete } from '../../src/app/api/memory/route';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { POST as chatPost } from '../../src/app/api/chat/route';
import { POST as briefPost } from '../../src/app/api/brief/route';
import {
  USER_A_ID,
  USER_B_ID,
  USER_A_TOKEN,
  USER_B_TOKEN,
  createTestRequest,
} from '../helpers/testUtils';
import { testDbStore, resetTestDbStore } from '../../src/lib/auth/server';

describe('Tenant Isolation: Comprehensive Negative Cross-Tenant Matrix', () => {
  beforeEach(() => {
    resetTestDbStore();
  });

  // --- ACADEMIC EVENTS (GET, PATCH, DELETE, POST) ---
  test('User A cannot view User B academic events via GET /api/events', async () => {
    // Seed User B event
    testDbStore.academic_events = [
      {
        id: 'e0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        title: 'Secret Defense Exam for User B',
        date: '2026-11-20',
        status: 'confirmed',
        priority: 'High',
      },
    ];

    // User A queries events
    const req = createTestRequest('/api/events', { method: 'GET', token: USER_A_TOKEN });
    const res = await eventsGet(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.events.length, 0, 'User A must not see User B events');
  });

  test('User A cannot modify or confirm User B event via PATCH /api/events', async () => {
    testDbStore.academic_events = [
      {
        id: 'e0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        title: 'User B Original Event',
        date: '2026-11-20',
        status: 'pending_review',
      },
    ];

    // User A attempts to overwrite User B's event
    const req = createTestRequest('/api/events', {
      method: 'PATCH',
      token: USER_A_TOKEN,
      body: {
        id: 'e0000000-0000-4000-8000-000000000002',
        title: 'Tampered Title by User A',
        confirm: true,
      },
    });

    const res = await eventsPatch(req);
    assert.equal(res.status, 404, 'Must return 404 access denied');

    // Ensure User B's event is untouched
    const event = testDbStore.academic_events.find((e) => e.id === 'e0000000-0000-4000-8000-000000000002');
    assert.equal(event?.title, 'User B Original Event');
    assert.equal(event?.status, 'pending_review');
  });

  test('User A cannot delete User B event via DELETE /api/events', async () => {
    testDbStore.academic_events = [
      {
        id: 'e0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        title: 'User B Event to Protect',
      },
    ];

    const req = createTestRequest('/api/events?id=e0000000-0000-4000-8000-000000000002', {
      method: 'DELETE',
      token: USER_A_TOKEN,
    });

    await eventsDelete(req);

    // Verify row still exists for User B
    const exists = testDbStore.academic_events.some(
      (e) => e.id === 'e0000000-0000-4000-8000-000000000002' && e.user_id === USER_B_ID
    );
    assert.equal(exists, true, 'User B event must not be deleted by User A');
  });

  test('POST /api/events strictly binds created record to session identity', async () => {
    const req = createTestRequest('/api/events', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        title: 'User A New Event',
        date: '2026-11-25',
        type: 'Assignment',
        userId: USER_B_ID, // Attempted spoofing in body
      },
    });

    const res = await eventsPost(req);
    assert.ok(res.status === 200 || res.status === 201, `Status must be 200 or 201, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.id);

    // Verify that the stored record is bound to USER_A_ID, NOT USER_B_ID
    const created = testDbStore.academic_events.find((e) => e.id === data.id);
    assert.equal(created?.user_id, USER_A_ID);
  });

  // --- PROCESSING JOBS (GET, POST) ---
  test('User A cannot poll User B job status via GET /api/jobs', async () => {
    testDbStore.processing_jobs = [
      {
        id: 'b0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        status: 'processing',
        current_step: 'Extracting text...',
      },
    ];

    const req = createTestRequest('/api/jobs?jobId=b0000000-0000-4000-8000-000000000002', {
      method: 'GET',
      token: USER_A_TOKEN,
    });

    const res = await jobsGet(req);
    assert.equal(res.status, 404);
  });

  test('User A cannot create a job claiming User B identity via POST /api/jobs', async () => {
    const req = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: { userId: USER_B_ID },
    });

    const res = await jobsPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    const createdJob = testDbStore.processing_jobs.find((j) => j.id === data.jobId);
    assert.equal(createdJob?.user_id, USER_A_ID);
  });

  // --- ACADEMIC MEMORY & DOCUMENTS (GET, DELETE) ---
  test('User A cannot view User B documents via GET /api/memory', async () => {
    testDbStore.documents = [
      {
        id: 'd0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        title: 'User B Thesis Draft.pdf',
        source_type: 'pdf',
      },
    ];

    const req = createTestRequest('/api/memory', { method: 'GET', token: USER_A_TOKEN });
    const res = await memoryGet(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.documents.length, 0);
  });

  test('User A cannot delete User B document via DELETE /api/memory', async () => {
    testDbStore.documents = [
      {
        id: 'd0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        title: 'Protected Document',
        source_type: 'pdf',
      },
    ];

    const req = createTestRequest('/api/memory?id=d0000000-0000-4000-8000-000000000002', {
      method: 'DELETE',
      token: USER_A_TOKEN,
    });

    await memoryDelete(req);

    // Verify User B document remains intact
    const docStillExists = testDbStore.documents.some(
      (d) => d.id === 'd0000000-0000-4000-8000-000000000002'
    );
    assert.equal(docStillExists, true);
  });

  // --- DOCUMENT PARSING & JOB MUTATION ---
  test('User A cannot attach parse output to User B job via POST /api/parse', async () => {
    testDbStore.processing_jobs = [
      {
        id: 'b0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        status: 'pending',
      },
    ];

    const formData = new FormData();
    formData.append('jobId', 'b0000000-0000-4000-8000-000000000002');
    formData.append('text', 'Midterm examination scheduled for November 15');

    const req = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });

    const res = await parsePost(req);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Job not found or access denied/i);
  });

  // --- CHAT & RAG CONTEXT ISOLATION ---
  test('POST /api/chat does not leak User B indexed document context to User A', async () => {
    // Seed private User B chunk
    testDbStore.document_chunks = [
      {
        id: 'c0000000-0000-4000-8000-000000000002',
        user_id: USER_B_ID,
        document_id: 'd0000000-0000-4000-8000-000000000002',
        content: 'Confidential grade report: student failed CS101 final exam',
        chunk_index: 0,
        metadata: { title: 'Private Grade Report' },
      },
    ];

    const req = createTestRequest('/api/chat', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        messages: [{ role: 'user', content: 'What grade did the student receive in CS101?' }],
      },
    });

    const res = await chatPost(req);
    assert.equal(res.status, 200);
    const text = await res.text();
    // In test mode, without supporting chunks scoped to User A, chat states no documents found
    assert.doesNotMatch(text, /Confidential grade report|student failed/i);
    assert.match(text, /no information available/i);
  });
});

