import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { augmentEventWithMemory } from '../../src/lib/ai/reasoning';
import { AcademicEvent } from '../../src/lib/types';
import { USER_A_ID } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('AI/ML Reliability: Deadline Changes & Conflict Detection', () => {
  test('assigns deterministic priority and reviews when memory is empty', async () => {
    resetTestDbStore();

    const newEvent: AcademicEvent = {
      id: 'e0000000-0000-4000-8000-000000000001',
      title: 'Operating Systems Project',
      date: '2026-11-20',
      type: 'Assignment',
      description: 'Implement virtual memory manager',
      confidence: 90,
      importance: 'medium',
      actionRequired: true,
      strictDeadline: true, // Strict deadline!
      deadlineChange: 'none',
      additionalInformationPending: false,
      sourceText: 'Final submission strictly due on Nov 20, 2026 with no late passes.',
      course: 'CS301',
      sourceType: 'text',
      needsReview: false,
    };

    const augmented = await augmentEventWithMemory(newEvent, USER_A_ID);
    assert.equal(augmented.importance, 'high', 'Strict deadline must be upgraded to high importance');
    assert.equal(augmented.priority, 'High');
  });

  test('flags conflicting notices for review when conflicting dates exist in memory', async () => {
    resetTestDbStore();
    const documentId = 'd0000000-0000-4000-8000-000000000001';

    // Seed historical memory chunk for CS301 saying exam is on Nov 10
    testDbStore.documents.push({
      id: documentId,
      user_id: USER_A_ID,
      title: 'Original Syllabus',
    });
    testDbStore.document_chunks.push({
      id: 'c0000000-0000-4000-8000-000000000001',
      document_id: documentId,
      user_id: USER_A_ID,
      content: 'CS301 Operating Systems Midterm Examination will be held on 2026-11-10 in Room 101.',
      metadata: { title: 'Original Syllabus' },
      embedding: Array(768).fill(0.01),
      chunk_index: 0,
    });

    // New event extracted from an unconfirmed flyer saying exam is on Nov 12
    const conflictingEvent: AcademicEvent = {
      id: 'e0000000-0000-4000-8000-000000000002',
      title: 'Operating Systems Midterm',
      date: '2026-11-12', // Disagrees with Nov 10 in syllabus!
      type: 'Exam',
      description: 'Midterm venue Room 105',
      confidence: 80,
      importance: 'medium',
      actionRequired: true,
      strictDeadline: false,
      deadlineChange: 'none',
      additionalInformationPending: false,
      sourceText: 'OS Midterm scheduled for Nov 12',
      course: 'CS301',
      sourceType: 'text',
      needsReview: false,
    };

    const result = await augmentEventWithMemory(conflictingEvent, USER_A_ID);
    // Any conflict or review condition must force needsReview = true
    assert.equal(result.needsReview, true, 'Conflicting notices must trigger review requirement');
  });

  test('requires review when date is ambiguous or additional information is pending', async () => {
    resetTestDbStore();

    const pendingEvent: AcademicEvent = {
      id: 'e0000000-0000-4000-8000-000000000003',
      title: 'Campus Placement Registration',
      date: null,
      type: 'Notice',
      description: 'Registration window opening soon',
      confidence: 85,
      importance: 'medium',
      actionRequired: true,
      strictDeadline: false,
      deadlineChange: 'none',
      additionalInformationPending: true,
      sourceText: 'Registration dates will be announced next week.',
      course: null,
      sourceType: 'text',
      needsReview: false,
    };

    const result = await augmentEventWithMemory(pendingEvent, USER_A_ID);
    assert.equal(result.needsReview, true);
  });
});
