import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../../src/lib/validation';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { USER_A_TOKEN, USER_A_ID, createTestRequest } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('Structured Extraction: Location & Persistent Provenance', () => {
  test('validateEvent preserves location and page provenance metadata', () => {
    const rawAiOutput = {
      title: 'Database Systems Midterm',
      date: '2026-10-25',
      type: 'Exam',
      description: 'Covers SQL, normalization and transactions in Hall 301',
      confidence: 95,
      importance: 'high',
      actionRequired: true,
      strictDeadline: true,
      deadlineChange: 'none',
      additionalInformationPending: false,
      sourceText: 'Midterm will be held on Oct 25 in Hall 301.',
      course: 'CS301',
      location: 'Hall 301',
    };

    const event = validateEvent(rawAiOutput, 'pdf', {
      documentId: 'd0000000-0000-4000-8000-000000000001',
      documentTitle: 'CS301 Syllabus.pdf',
      chunkIndex: 2,
      pageNumber: 3,
    });

    assert.ok(event);
    assert.equal(event.title, 'Database Systems Midterm');
    assert.equal(event.location, 'Hall 301');
    assert.equal(event.course, 'CS301');
    assert.equal(event.pageNumber, 3);
    assert.equal(event.chunkIndex, 2);
    assert.equal(event.documentId, 'd0000000-0000-4000-8000-000000000001');
  });

  test('POST /api/parse persists location and provenance fields to database store', async () => {
    resetTestDbStore();
    const jobId = '77777777-8888-4000-8000-999999999999';

    testDbStore.processing_jobs.push({
      id: jobId,
      user_id: USER_A_ID,
      status: 'pending',
      progress: 0,
      current_step: 'Initializing...',
    });

    const formData = new FormData();
    formData.append('jobId', jobId);
    formData.append(
      'text',
      'Midterm exam will take place on Nov 15 in Hall 101. Attendance is mandatory.'
    );

    const req = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });

    const res = await parsePost(req);
    assert.equal(res.status, 200);

    const savedEvents = testDbStore.academic_events.filter((e) => e.user_id === USER_A_ID);
    assert.ok(savedEvents.length > 0);
    const savedEvent = savedEvents[0];
    assert.equal(savedEvent.title, 'Midterm Examination');
    assert.equal(savedEvent.location, 'Hall 101');
    assert.equal(savedEvent.chunk_index, 0);
  });
});
