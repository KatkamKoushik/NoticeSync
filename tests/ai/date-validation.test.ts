import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateCalendarDate, validateEvent } from '../../src/lib/validation';

describe('AI/ML Reliability: Calendar Date Validation & Review Gating', () => {
  test('validates valid ISO Gregorian calendar dates', () => {
    const validDates = ['2026-11-15', '2026-02-28', '2024-02-29', '2026-12-31', '2026-01-01'];
    for (const d of validDates) {
      const result = validateCalendarDate(d);
      assert.equal(result.status, 'valid', `Expected ${d} to be valid`);
      assert.equal(result.date, d);
    }
  });

  test('detects and flags impossible calendar dates (e.g. Feb 31, leap year errors)', () => {
    const impossibleDates = [
      '2026-02-31', // Feb 31 does not exist
      '2025-02-29', // 2025 is not a leap year
      '2026-04-31', // April has 30 days
      '2026-06-31', // June has 30 days
      '2026-09-31', // September has 30 days
      '2026-11-31', // November has 30 days
      '2026-13-15', // Month 13 does not exist
      '2026-00-10', // Month 0 does not exist
      '2026-05-00', // Day 0 does not exist
      '2026-05-32', // Day 32 does not exist
    ];

    for (const d of impossibleDates) {
      const result = validateCalendarDate(d);
      assert.equal(result.status, 'impossible', `Expected ${d} to be flagged as impossible`);
      assert.equal(result.date, null, 'Impossible dates must never return a valid date string');
      assert.match(result.reason!, /impossible|does not exist/i);
    }
  });

  test('correctly classifies ambiguous natural language dates and flags them for review', () => {
    const ambiguousDates = [
      'next Friday',
      'tentative mid-November',
      'after Diwali holidays',
      'last week of semester',
      '2026/11/15', // Non-standard separator
      '15-11-2026', // DD-MM-YYYY format
      'Nov 15, 2026',
    ];

    for (const d of ambiguousDates) {
      const result = validateCalendarDate(d);
      assert.equal(result.status, 'ambiguous', `Expected "${d}" to be flagged as ambiguous`);
      assert.equal(result.date, null);
    }
  });

  test('correctly handles null, pending, and TBD dates', () => {
    const pendingInputs = [null, undefined, '', '   ', 'null', 'TBD', 'TBA', 'pending'];
    for (const d of pendingInputs) {
      const result = validateCalendarDate(d);
      assert.equal(result.status, 'null_or_pending');
      assert.equal(result.date, null);
    }
  });

  test('validateEvent routes impossible and ambiguous dates to review instead of confirming them', () => {
    // 1. Impossible date input
    const impossibleEventRaw = {
      title: 'Chemistry Lab Exam',
      date: '2026-02-31', // Impossible!
      type: 'Exam',
      description: 'Room 302',
      confidence: 90,
      importance: 'high',
      sourceText: 'Lab exam on Feb 31, 2026',
    };

    const validatedImpossible = validateEvent(impossibleEventRaw, 'text');
    assert.ok(validatedImpossible);
    assert.equal(validatedImpossible.date, null, 'Impossible date must be sanitized to null');
    assert.equal(validatedImpossible.needsReview, true, 'Impossible date must require manual review');
    assert.equal(validatedImpossible.additionalInformationPending, true);
    assert.match(validatedImpossible.reviewReason || '', /impossible/i);

    // 2. Ambiguous date input
    const ambiguousEventRaw = {
      title: 'Guest Lecture',
      date: 'next Friday afternoon',
      type: 'Notice',
      description: 'Main Auditorium',
      confidence: 85,
      importance: 'medium',
      sourceText: 'Guest lecture next Friday afternoon',
    };

    const validatedAmbiguous = validateEvent(ambiguousEventRaw, 'text');
    assert.ok(validatedAmbiguous);
    assert.equal(validatedAmbiguous.date, null);
    assert.equal(validatedAmbiguous.needsReview, true);
    assert.match(validatedAmbiguous.reviewReason || '', /ambiguous/i);

    // 3. Valid date with high confidence
    const validEventRaw = {
      title: 'Operating Systems Midterm',
      date: '2026-11-15',
      type: 'Exam',
      description: 'Covers CPU scheduling and memory management',
      confidence: 95,
      importance: 'high',
      sourceText: 'OS Midterm scheduled for Nov 15, 2026',
      course: 'CS301',
    };

    const validatedValid = validateEvent(validEventRaw, 'text');
    assert.ok(validatedValid);
    assert.equal(validatedValid.date, '2026-11-15');
    assert.equal(validatedValid.needsReview, false);
    assert.equal(validatedValid.reviewReason, null);
  });
});
