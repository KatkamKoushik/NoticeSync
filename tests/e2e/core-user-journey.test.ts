import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { POST as jobsPost, GET as jobsGet } from '../../src/app/api/jobs/route';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { GET as memoryGet, DELETE as memoryDelete } from '../../src/app/api/memory/route';
import { POST as chatPost } from '../../src/app/api/chat/route';
import {
  USER_A_TOKEN,
  USER_A_ID,
  createTestRequest,
} from '../helpers/testUtils';
import { resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('E2E Core User Journey: Notice Ingestion, Review, Persistence & Memory RAG', () => {
  test('executes end-to-end workflow: upload notice -> review extracted events -> save -> query memory -> clean up', async () => {
    // 0. Initialize fresh isolated test storage
    resetTestDbStore();

    // Load sample syllabus fixture
    const fixturePath = path.join(__dirname, '../fixtures/sample-syllabus.txt');
    const syllabusContent = fs.readFileSync(fixturePath, 'utf-8');
    assert.ok(syllabusContent.length > 50, 'Syllabus fixture content must be loaded');

    // =========================================================================
    // STEP 1: Client initiates an ingestion job with idempotency key
    // =========================================================================
    const idempotencyKey = 'e2e-job-key-' + Date.now();
    const createJobReq = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: { idempotencyKey },
    });

    const createJobRes = await jobsPost(createJobReq);
    assert.equal(createJobRes.status, 200, 'Job creation should succeed with 200');
    const { jobId } = await createJobRes.json();
    assert.ok(jobId, 'Should receive a valid jobId');

    // Verify initial job state in database
    const initialJob = testDbStore.processing_jobs.find((j) => j.id === jobId);
    assert.ok(initialJob, 'Job must exist in database store');
    assert.equal(initialJob.status, 'pending');
    assert.equal(initialJob.user_id, USER_A_ID);

    // =========================================================================
    // STEP 2: Client uploads notice text linked to the active job
    // =========================================================================
    const formData = new FormData();
    formData.append('jobId', jobId);
    formData.append('text', syllabusContent);

    const parseReq = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });

    const parseRes = await parsePost(parseReq);
    assert.equal(parseRes.status, 200, 'Parsing should succeed with 200 OK');
    const parseData = await parseRes.json();

    // Verify response structure
    assert.ok(Array.isArray(parseData.events), 'Response should contain extracted events');
    assert.ok(parseData.events.length > 0, 'Extracted events must not be empty');
    assert.ok(parseData.documentId, 'Response must include created documentId');
    assert.ok(parseData.metrics, 'Response must include pipeline metrics');
    assert.equal(parseData.metrics.chunksStored, parseData.metrics.chunksTotal, 'All chunks should be stored successfully');
    assert.equal(parseData.metrics.eventsStored, parseData.metrics.eventsTotal, 'All events should be stored successfully');

    const createdDocId = parseData.documentId;

    // =========================================================================
    // STEP 3: User reviews extracted events & verifies job completion
    // =========================================================================
    // 3a. Poll job status
    const pollReq = createTestRequest(`/api/jobs?jobId=${jobId}`, {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const pollRes = await jobsGet(pollReq);
    assert.equal(pollRes.status, 200);
    const { job: polledJob } = await pollRes.json();
    assert.equal(polledJob.status, 'completed', 'Job should reach completed state');
    assert.equal(polledJob.progress, 100, 'Progress should be 100%');

    // 3b. Verify extracted event properties
    const firstEvent = parseData.events[0];
    assert.ok(firstEvent.title, 'Event must have a title');
    assert.ok(firstEvent.date, 'Event must have a validated date');
    assert.ok(firstEvent.confidence > 0, 'Event must have confidence score');
    assert.equal(firstEvent.documentId, createdDocId, 'Event must link to document');

    // 3c. Verify persistence in DB store
    const dbEvents = testDbStore.academic_events.filter((e) => e.user_id === USER_A_ID);
    assert.ok(dbEvents.length >= 1, 'Academic events must be persisted in database store');
    assert.equal(dbEvents[0].document_id, createdDocId);

    // 3d. Verify document is listed in academic memory
    const memoryReq = createTestRequest('/api/memory', {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const memoryRes = await memoryGet(memoryReq);
    assert.equal(memoryRes.status, 200);
    const memoryData = await memoryRes.json();
    assert.ok(Array.isArray(memoryData.documents));
    const matchingDoc = memoryData.documents.find((d: { id: string }) => d.id === createdDocId);
    assert.ok(matchingDoc, 'Uploaded notice document must appear in user memory');

    // =========================================================================
    // STEP 4: Query the user's academic memory via AI Copilot chat
    // =========================================================================
    const chatReq = createTestRequest('/api/chat', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        messages: [{ role: 'user', content: 'What is the date for my midterm exam in CS101?' }],
      },
    });

    const chatRes = await chatPost(chatReq);
    assert.equal(chatRes.status, 200, 'Chat query should succeed with 200 OK');
    const chatResponseText = await chatRes.text();
    assert.ok(chatResponseText.length > 0, 'Chat should produce a non-empty answer');
    // In test mode with indexed chunks, chat produces grounded citation
    assert.match(chatResponseText, /\[Source:.*\]|Nov 15/i, 'Chat answer must be grounded with citation or date');

    // =========================================================================
    // STEP 5: Clean up document and verify cascading cleanup
    // =========================================================================
    const deleteReq = createTestRequest(`/api/memory?id=${createdDocId}`, {
      method: 'DELETE',
      token: USER_A_TOKEN,
    });
    const deleteRes = await memoryDelete(deleteReq);
    assert.equal(deleteRes.status, 200, 'Document deletion should succeed');

    // Verify document was removed
    const docInDb = testDbStore.documents.find((d) => d.id === createdDocId);
    assert.equal(docInDb, undefined, 'Document must be removed from DB');

    // Verify chunks and events were cascaded
    const chunksInDb = testDbStore.document_chunks.filter((c) => c.document_id === createdDocId);
    assert.equal(chunksInDb.length, 0, 'Document chunks must be cascaded and deleted');

    const eventsInDb = testDbStore.academic_events.filter((e) => e.document_id === createdDocId);
    assert.equal(eventsInDb.length, 0, 'Academic events must be cascaded and deleted');

    // Verify subsequent memory query returns empty
    const memoryAfterDeleteReq = createTestRequest('/api/memory', {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const memoryAfterDeleteRes = await memoryGet(memoryAfterDeleteReq);
    const memoryAfterData = await memoryAfterDeleteRes.json();
    assert.equal(
      memoryAfterData.documents.some((d: { id: string }) => d.id === createdDocId),
      false,
      'Deleted document must no longer appear in academic memory'
    );
  });

  test('handles corrupt upload failure: marks processing job as failed and returns 400', async () => {
    resetTestDbStore();

    // 1. Create processing job
    const createJobReq = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
    });
    const createJobRes = await jobsPost(createJobReq);
    assert.equal(createJobRes.status, 200);
    const { jobId } = await createJobRes.json();

    // 2. Read corrupt fixture
    const corruptPath = path.join(__dirname, '../fixtures/corrupted-file.bin');
    const corruptBuffer = fs.readFileSync(corruptPath);
    const corruptFile = new File([corruptBuffer], 'corrupted.pdf', { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('jobId', jobId);
    formData.append('pdf', corruptFile);

    // 3. Upload corrupt file
    const parseReq = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });
    const parseRes = await parsePost(parseReq);
    assert.equal(parseRes.status, 400, 'Corrupt file upload should fail with 400 Bad Request');

    // 4. Poll job and ensure state was properly transitioned to 'failed'
    const pollReq = createTestRequest(`/api/jobs?jobId=${jobId}`, {
      method: 'GET',
      token: USER_A_TOKEN,
    });
    const pollRes = await jobsGet(pollReq);
    assert.equal(pollRes.status, 200);
    const { job } = await pollRes.json();
    assert.equal(job.status, 'failed', 'Job status must transition to failed on corrupt input');
    assert.ok(job.errorMessage, 'Job must record diagnostic error message');
  });

  test('blocks unauthenticated access across the entire journey', async () => {
    // 1. Job creation without token
    const jobReq = createTestRequest('/api/jobs', { method: 'POST', token: null });
    assert.equal((await jobsPost(jobReq)).status, 401);

    // 2. Parse without token
    const parseReq = createTestRequest('/api/parse', { method: 'POST', token: null });
    assert.equal((await parsePost(parseReq)).status, 401);

    // 3. Chat without token
    const chatReq = createTestRequest('/api/chat', { method: 'POST', token: null });
    assert.equal((await chatPost(chatReq)).status, 401);

    // 4. Memory query without token
    const memoryReq = createTestRequest('/api/memory', { method: 'GET', token: null });
    assert.equal((await memoryGet(memoryReq)).status, 401);
  });
});
