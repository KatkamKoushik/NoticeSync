import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as jobsPost, GET as jobsGet } from '../../src/app/api/jobs/route';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { GET as memoryGet, DELETE as memoryDelete } from '../../src/app/api/memory/route';
import { POST as briefPost } from '../../src/app/api/brief/route';
import { GET as eventsGet } from '../../src/app/api/events/route';
import {
  USER_A_TOKEN,
  USER_B_TOKEN,
  USER_A_ID,
  USER_B_ID,
  createTestRequest,
} from '../helpers/testUtils';
import { resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('API Routes: Authentication, Ownership, Polling & Error Responses', () => {
  test('POST /api/jobs initializes a new job and GET /api/jobs polls its status', async () => {
    resetTestDbStore();

    // 1. Create job
    const createReq = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {},
    });
    const createRes = await jobsPost(createReq);
    assert.equal(createRes.status, 200);
    const { jobId } = await createRes.json();
    assert.ok(jobId);

    // 2. Poll job
    const pollReq = createTestRequest(`/api/jobs?jobId=${jobId}`, {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const pollRes = await jobsGet(pollReq);
    assert.equal(pollRes.status, 200);
    const pollData = await pollRes.json();
    assert.equal(pollData.job.id, jobId);
    assert.equal(pollData.job.status, 'pending');
    assert.equal(pollData.job.progress, 0);
  });

  test('GET /api/jobs rejects invalid UUIDs and unauthorized cross-user polling', async () => {
    resetTestDbStore();

    // Malformed UUID
    const invalidUuidReq = createTestRequest('/api/jobs?jobId=not-a-uuid', {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const invalidRes = await jobsGet(invalidUuidReq);
    assert.equal(invalidRes.status, 400);

    // Seed job belonging to User B
    const userBJobId = 'b0000000-0000-4000-8000-000000000099';
    testDbStore.processing_jobs.push({
      id: userBJobId,
      user_id: USER_B_ID,
      status: 'completed',
      progress: 100,
    });

    // User A attempts to poll User B's job
    const crossPollReq = createTestRequest(`/api/jobs?jobId=${userBJobId}`, {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const crossRes = await jobsGet(crossPollReq);
    assert.equal(crossRes.status, 404, 'Must return 404 when polling another user job');
  });

  test('POST /api/parse validates inputs and handles missing or corrupt data', async () => {
    resetTestDbStore();

    // 1. Missing inputs (empty form data)
    const emptyForm = new FormData();
    const emptyReq = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData: emptyForm,
    });
    const emptyRes = await parsePost(emptyReq);
    assert.equal(emptyRes.status, 400);
    const emptyData = await emptyRes.json();
    assert.match(emptyData.error, /Please provide a PDF, image, or text input/i);

    // 2. Text input under 10 characters
    const shortForm = new FormData();
    shortForm.append('text', 'Too short');
    const shortReq = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData: shortForm,
    });
    const shortRes = await parsePost(shortReq);
    assert.equal(shortRes.status, 400);
    const shortData = await shortRes.json();
    assert.match(shortData.error, /Not enough readable text/i);
  });

  test('GET and DELETE /api/memory enforce user ownership boundaries', async () => {
    resetTestDbStore();
    const docA = 'd0000000-0000-4000-8000-000000000001';
    const docB = 'd0000000-0000-4000-8000-000000000002';

    testDbStore.documents.push(
      { id: docA, user_id: USER_A_ID, title: 'User A Notice', source_type: 'text' },
      { id: docB, user_id: USER_B_ID, title: 'User B Confidential', source_type: 'pdf' }
    );

    // 1. User A lists memory: must see docA only
    const listReq = createTestRequest('/api/memory', {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const listRes = await memoryGet(listReq);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.documents.length, 1);
    assert.equal(listData.documents[0].id, docA);

    // 2. User A attempts to delete User B document: must not delete docB
    const deleteCrossReq = createTestRequest(`/api/memory?id=${docB}`, {
      method: 'DELETE',
      token: USER_A_TOKEN,
    });
    const deleteCrossRes = await memoryDelete(deleteCrossReq);
    assert.equal(deleteCrossRes.status, 200); // Idempotent delete attempt
    // Verify docB is still in the database for User B!
    const docBStillExists = testDbStore.documents.some((d) => d.id === docB);
    assert.equal(docBStillExists, true, 'User A must not be able to delete User B document');

    // 3. User A deletes own document: docA removed
    const deleteOwnReq = createTestRequest(`/api/memory?id=${docA}`, {
      method: 'DELETE',
      token: USER_A_TOKEN,
    });
    const deleteOwnRes = await memoryDelete(deleteOwnReq);
    assert.equal(deleteOwnRes.status, 200);
    const docAExists = testDbStore.documents.some((d) => d.id === docA);
    assert.equal(docAExists, false, 'User A document must be deleted');
  });

  test('POST /api/brief generates summary from validated events payload', async () => {
    const req = createTestRequest('/api/brief', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        events: [
          {
            title: 'Midterm Exam',
            date: '2026-11-15',
            type: 'Exam',
            importance: 'high',
            strictDeadline: true,
          },
        ],
      },
    });

    const res = await briefPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.brief);
    assert.ok(data.brief.length > 0);
  });

  test('GET /api/events retrieves confirmed and pending events with strict user scoping', async () => {
    resetTestDbStore();

    // Seed events for User A and User B
    testDbStore.academic_events.push(
      {
        id: 'e0000000-0000-4000-8000-000000000001',
        user_id: USER_A_ID,
        title: 'User A Midterm Exam',
        date: '2026-11-15',
        type: 'Exam',
        priority: 'Critical',
        status: 'confirmed',
        strict_deadline: true,
      },
      {
        id: 'e0000000-0000-4000-8000-000000000002',
        user_id: USER_A_ID,
        title: 'User A Removed Event',
        date: '2026-11-16',
        type: 'Notice',
        status: 'removed',
      },
      {
        id: 'e0000000-0000-4000-8000-000000000003',
        user_id: USER_B_ID,
        title: 'User B Confidential Seminar',
        date: '2026-11-20',
        type: 'Notice',
        status: 'confirmed',
      }
    );

    // 1. User A retrieves events
    const req = createTestRequest('/api/events', {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const res = await eventsGet(req);
    assert.equal(res.status, 200);
    const data = await res.json();

    // Must return User A's confirmed event, but NOT the removed event and NOT User B's event
    assert.equal(Array.isArray(data.events), true);
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].id, 'e0000000-0000-4000-8000-000000000001');
    assert.equal(data.events[0].title, 'User A Midterm Exam');
    assert.equal(data.events[0].importance, 'high');
    assert.equal(data.events[0].strictDeadline, true);

    // 2. User B retrieves events
    const reqB = createTestRequest('/api/events', {
      method: 'GET',
      token: USER_B_TOKEN,
    });
    const resB = await eventsGet(reqB);
    assert.equal(resB.status, 200);
    const dataB = await resB.json();
    assert.equal(dataB.events.length, 1);
    assert.equal(dataB.events[0].id, 'e0000000-0000-4000-8000-000000000003');
    assert.equal(dataB.events[0].title, 'User B Confidential Seminar');
  });
});
