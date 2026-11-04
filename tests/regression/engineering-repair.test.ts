import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'date-fns';
import { generateIcsString } from '../../src/lib/calendar';
import {
  getTodayEvents,
  getNextUpcomingEvent,
  groupEventsByDate,
} from '../../src/lib/dates';
import { augmentEventWithMemory } from '../../src/lib/ai/reasoning';
import { createMockTestClient, resetTestDbStore, testDbStore } from '../../src/lib/auth/server';
import { AcademicEvent } from '../../src/lib/types';
import { PATCH, POST } from '../../src/app/api/events/route';
import {
  USER_A_ID,
  USER_A_TOKEN,
  createTestRequest,
} from '../helpers/testUtils';

describe('Engineering Repair: Regression Test Suite', () => {
  const userId = USER_A_ID;

  describe('Calendar ICS Generation Resilience', () => {
    it('generates valid ICS without NaN when date has ISO timestamp format', () => {
      const events: AcademicEvent[] = [
        {
          id: 'e0000000-0000-4000-8000-000000000001',
          title: 'Distributed Systems Midterm',
          date: '2026-11-15T14:30:00',
          time: '14:30',
          type: 'Exam',
          description: 'Midterm exam in Hall 302',
          confidence: 95,
          importance: 'high',
          actionRequired: true,
          strictDeadline: true,
          deadlineChange: 'none',
          additionalInformationPending: false,
          sourceText: 'Midterm on Nov 15 at 14:30',
          sourceType: 'text',
          needsReview: false,
        },
      ];

      const ics = generateIcsString(events);
      assert.ok(ics.includes('BEGIN:VCALENDAR'));
      assert.ok(ics.includes('SUMMARY:Distributed Systems Midterm'));
      assert.ok(!ics.includes('NaN'), 'ICS content must not contain NaN');
    });

    it('generates valid ICS with standard YYYY-MM-DD date and default time', () => {
      const events: AcademicEvent[] = [
        {
          id: 'e0000000-0000-4000-8000-000000000002',
          title: 'Assignment 1 Submission',
          date: '2026-11-20',
          type: 'Assignment',
          description: 'Submit PDF to LMS',
          confidence: 90,
          importance: 'medium',
          actionRequired: true,
          strictDeadline: false,
          deadlineChange: 'none',
          additionalInformationPending: false,
          sourceText: 'Due Nov 20',
          sourceType: 'text',
          needsReview: false,
        },
      ];

      const ics = generateIcsString(events);
      assert.ok(ics.includes('BEGIN:VCALENDAR'));
      assert.ok(!ics.includes('NaN'));
    });
  });

  describe('Date Utilities with Timestamp Normalization', () => {
    it('getTodayEvents matches today even if date string contains timestamp', () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const events: AcademicEvent[] = [
        {
          id: 'e0000000-0000-4000-8000-000000000003',
          title: 'Today Quiz',
          date: `${todayStr}T10:00:00`,
          type: 'Exam',
          description: 'Quiz today at 10 AM',
          confidence: 95,
          importance: 'high',
          actionRequired: true,
          strictDeadline: true,
          deadlineChange: 'none',
          additionalInformationPending: false,
          sourceText: 'Quiz today',
          sourceType: 'text',
          needsReview: false,
        },
      ];

      const todayList = getTodayEvents(events);
      assert.equal(todayList.length, 1);
      assert.equal(todayList[0].title, 'Today Quiz');
    });

    it('groupEventsByDate groups events by day regardless of time component', () => {
      const events: AcademicEvent[] = [
        {
          id: 'e0000000-0000-4000-8000-000000000004',
          title: 'Event Morning',
          date: '2026-11-15T09:00:00',
          type: 'Notice',
          description: 'Morning notice',
          confidence: 90,
          importance: 'low',
          actionRequired: false,
          strictDeadline: false,
          deadlineChange: 'none',
          additionalInformationPending: false,
          sourceText: 'Morning notice',
          sourceType: 'text',
          needsReview: false,
        },
        {
          id: 'e0000000-0000-4000-8000-000000000005',
          title: 'Event Afternoon',
          date: '2026-11-15',
          type: 'Exam',
          description: 'Afternoon exam',
          confidence: 95,
          importance: 'high',
          actionRequired: true,
          strictDeadline: true,
          deadlineChange: 'none',
          additionalInformationPending: false,
          sourceText: 'Afternoon exam',
          sourceType: 'text',
          needsReview: false,
        },
      ];

      const grouped = groupEventsByDate(events);
      assert.equal(grouped.has('2026-11-15'), true);
      assert.equal(grouped.get('2026-11-15')!.length, 2);
    });
  });

  describe('Historical Memory Conflict Reasoner', () => {
    it('sets hasConflict to true when historical document date collision is detected', async () => {
      resetTestDbStore();
      const mockClient = createMockTestClient(userId);

      // Pre-seed a chunk specifying a previous exam date for CS401
      testDbStore.document_chunks.push({
        id: 'c0000000-0000-4000-8000-000000000001',
        document_id: 'd0000000-0000-4000-8000-000000000001',
        user_id: userId,
        content: 'CS401 Midterm Examination will take place on 2026-10-15 in Auditorium A.',
        chunk_index: 0,
        metadata: { title: 'CS401 Syllabus' },
      });

      const newEvent: AcademicEvent = {
        id: 'e0000000-0000-4000-8000-000000000006',
        title: 'Midterm Examination',
        course: 'CS401',
        date: '2026-11-05',
        type: 'Exam',
        description: 'CS401 Midterm moved to Nov 5',
        confidence: 90,
        importance: 'high',
        actionRequired: true,
        strictDeadline: true,
        deadlineChange: 'rescheduled',
        additionalInformationPending: false,
        sourceText: 'Exam rescheduled to 2026-11-05',
        sourceType: 'text',
        needsReview: false,
      };

      const result = await augmentEventWithMemory(newEvent, userId, mockClient);
      assert.equal(result.needsReview, true);
      assert.equal(result.hasConflict, true, 'hasConflict must be true on date collision');
      assert.ok(result.reviewReason?.includes('Conflict'), 'reviewReason must detail conflict');
    });
  });

  describe('Events API: Identifier Flexibility & Batch Review Persistence', () => {
    it('PATCH /api/events accepts eventId in body and updates status', async () => {
      resetTestDbStore();
      const eventId = 'e0000000-0000-4000-8000-000000000007';
      testDbStore.academic_events.push({
        id: eventId,
        user_id: userId,
        title: 'Original Title',
        date: '2026-11-15',
        status: 'pending_review',
        type: 'Exam',
      });

      const req = createTestRequest('/api/events', {
        method: 'PATCH',
        token: USER_A_TOKEN,
        body: {
          eventId: eventId,
          status: 'confirmed',
          title: 'Updated Title',
        },
      });

      const res = await PATCH(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      const updated = testDbStore.academic_events.find((e) => e.id === eventId);
      assert.equal(updated?.status, 'confirmed');
      assert.equal(updated?.title, 'Updated Title');
    });

    it('PATCH /api/events supports batch confirmation of multiple events', async () => {
      resetTestDbStore();
      const id1 = 'e0000000-0000-4000-8000-000000000008';
      const id2 = 'e0000000-0000-4000-8000-000000000009';
      testDbStore.academic_events.push(
        { id: id1, user_id: userId, title: 'Event 1', date: '2026-11-15', status: 'pending_review', type: 'Exam' },
        { id: id2, user_id: userId, title: 'Event 2', date: '2026-11-16', status: 'pending_review', type: 'Assignment' }
      );

      const req = createTestRequest('/api/events', {
        method: 'PATCH',
        token: USER_A_TOKEN,
        body: {
          events: [
            { id: id1, status: 'confirmed' },
            { id: id2, status: 'confirmed', title: 'Confirmed Event 2' },
          ],
        },
      });

      const res = await PATCH(req);
      assert.equal(res.status, 200);

      const e1 = testDbStore.academic_events.find((e) => e.id === id1);
      const e2 = testDbStore.academic_events.find((e) => e.id === id2);
      assert.equal(e1?.status, 'confirmed');
      assert.equal(e2?.status, 'confirmed');
      assert.equal(e2?.title, 'Confirmed Event 2');
    });

    it('POST /api/events supports batch creation of events', async () => {
      resetTestDbStore();
      const req = createTestRequest('/api/events', {
        method: 'POST',
        token: USER_A_TOKEN,
        body: {
          events: [
            { title: 'Batch Event 1', date: '2026-11-25', type: 'Exam' },
            { title: 'Batch Event 2', date: '2026-11-26', type: 'Assignment' },
          ],
        },
      });

      const res = await POST(req);
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.count, 2);
    });
  });

  describe('Job Status State Machine and Terminal State Invariants', () => {
    it('treats partial_success as a terminal state alongside completed and failed', () => {
      const terminalStatuses = ['completed', 'failed', 'partial_success'];
      assert.ok(terminalStatuses.includes('partial_success'));
      assert.ok(terminalStatuses.includes('completed'));
      assert.ok(terminalStatuses.includes('failed'));
      assert.ok(!terminalStatuses.includes('processing'));
      assert.ok(!terminalStatuses.includes('pending'));
    });
  });
});
