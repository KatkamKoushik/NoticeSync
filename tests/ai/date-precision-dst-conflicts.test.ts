import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateCalendarDate, validateEvent } from '../../src/lib/validation';
import { getTimezoneOffsetDetails, formatEventDate } from '../../src/lib/dates';
import { augmentEventWithMemory } from '../../src/lib/ai/reasoning';
import { USER_A_ID } from '../helpers/testUtils';

describe('Schedule Integrity: Ambiguous Dates, DST Transitions & Conflicting Notices', () => {
  test('flags ambiguous numeric date formats (e.g. 05/06/2026) for human review', () => {
    // 05/06/2026 could be May 6 or June 5
    const result1 = validateCalendarDate('05/06/2026');
    assert.equal(result1.status, 'ambiguous');
    assert.equal(result1.date, null);
    assert.match(result1.reason || '', /ambiguous numeric date format/i);

    // 03-04-2026 could be March 4 or April 3
    const result2 = validateCalendarDate('03-04-2026');
    assert.equal(result2.status, 'ambiguous');
    assert.equal(result2.date, null);
  });

  test('correctly handles ISO date-time precision with explicit hours and minutes', () => {
    const result = validateCalendarDate('2026-11-15T14:30:00Z');
    assert.equal(result.status, 'valid');
    assert.equal(result.date, '2026-11-15');
    assert.equal(result.time, '14:30');
    assert.equal(result.precision, 'date_time');
  });

  test('calculates timezone offsets and verifies DST consistency without silent date alteration', () => {
    // Winter (standard time) in New York
    const winter = getTimezoneOffsetDetails('2026-01-15', 'America/New_York');
    assert.equal(winter.offsetMinutes, -300); // UTC-5

    // Summer (daylight saving time) in New York
    const summer = getTimezoneOffsetDetails('2026-07-15', 'America/New_York');
    assert.equal(summer.offsetMinutes, -240); // UTC-4

    // Formatting with explicit precision
    const formattedDateTime = formatEventDate('2026-11-15T14:30:00Z', 'UTC', 'date_time');
    assert.match(formattedDateTime, /Nov 15, 2026,? 14:30/i);

    const formattedDateOnly = formatEventDate('2026-11-15', 'UTC', 'date_only');
    assert.match(formattedDateOnly, /Nov 15, 2026/i);
  });

  test('detects conflicting dates from historical memory and mandates human review', async () => {
    const mockClient: any = {
      rpc: async (func: string) => {
        if (func === 'match_document_chunks') {
          return {
            data: [
              {
                id: 'c1',
                document_id: 'd1',
                content: 'Original Syllabus: Midterm Exam is fixed on 2026-10-15 in Hall B',
                similarity: 0.9,
                metadata: { title: 'Syllabus Archive' },
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
    };

    const newConflictingEvent = {
      id: 'e1',
      title: 'Midterm Exam',
      date: '2026-10-25', // Conflicting date!
      type: 'Exam' as const,
      description: 'Exam in Hall B',
      confidence: 90,
      importance: 'high' as const,
      actionRequired: true,
      strictDeadline: true,
      deadlineChange: 'rescheduled' as const,
      additionalInformationPending: false,
      sourceText: 'Rescheduled Midterm Exam on 2026-10-25',
      course: 'CS101',
      sourceType: 'text' as const,
      needsReview: false,
    };

    const augmented = await augmentEventWithMemory(newConflictingEvent, USER_A_ID, mockClient);

    // Conflict MUST set needsReview to true and add conflict details
    assert.equal(augmented.needsReview, true);
    assert.match(augmented.reviewReason || '', /Conflict/i);
    assert.match(augmented.description, /CONFLICT DETECTED/i);
  });

  test('requires human confirmation for deadline cancellations without overwriting schedules', () => {
    const rawCancelledEvent = {
      title: 'Laboratory Session 4',
      date: '2026-11-18',
      type: 'Notice',
      description: 'Lab 4 has been cancelled due to maintenance',
      confidence: 95,
      importance: 'medium',
      deadlineChange: 'cancelled',
      sourceText: 'Lab 4 is cancelled',
    };

    const validated = validateEvent(rawCancelledEvent, 'text');
    assert.ok(validated);
    assert.equal(validated.needsReview, true);
    assert.equal(validated.status, 'pending_review');
    assert.match(validated.reviewReason || '', /Deadline modification detected \(cancelled\)/i);
  });
});

