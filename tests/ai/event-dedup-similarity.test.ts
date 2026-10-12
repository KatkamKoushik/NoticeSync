import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeEventDedupHash } from '../../src/lib/ingestion/hash';

describe('AI/ML Reliability: Deduplication vs Semantically Similar Events', () => {
  test('generates identical dedup_hash for exact duplicate notices and cosmetic variations', () => {
    const event1 = {
      title: 'Final Examination in Hall A',
      date: '2026-12-15',
      type: 'Exam',
      course: 'CS101',
    };

    // Cosmetic variation: extra whitespace, lowercase course, trailing punctuation
    const event2 = {
      title: '  final examination in hall a.  ',
      date: '2026-12-15',
      type: 'exam',
      course: 'cs101',
    };

    const hash1 = computeEventDedupHash(event1);
    const hash2 = computeEventDedupHash(event2);
    assert.equal(hash1, hash2, 'Exact duplicate notices with cosmetic differences must have identical hash');
  });

  test('does NOT merge distinct events with identical titles belonging to different courses', () => {
    const csAssignment = {
      title: 'Assignment 1',
      date: '2026-10-25',
      type: 'Assignment',
      course: 'CS101',
    };

    const mathAssignment = {
      title: 'Assignment 1',
      date: '2026-10-25',
      type: 'Assignment',
      course: 'MATH201',
    };

    const csHash = computeEventDedupHash(csAssignment);
    const mathHash = computeEventDedupHash(mathAssignment);
    assert.notEqual(
      csHash,
      mathHash,
      'Events with identical titles across different courses must NOT be merged'
    );
  });

  test('does NOT merge distinct events that differ by sequence or milestone (Quiz 1 vs Quiz 2)', () => {
    const quiz1 = {
      title: 'Quiz 1',
      date: '2026-11-05',
      type: 'Exam',
      course: 'CS204',
    };

    const quiz2 = {
      title: 'Quiz 2',
      date: '2026-11-05',
      type: 'Exam',
      course: 'CS204',
    };

    const hashQuiz1 = computeEventDedupHash(quiz1);
    const hashQuiz2 = computeEventDedupHash(quiz2);
    assert.notEqual(
      hashQuiz1,
      hashQuiz2,
      'Distinct milestones (Quiz 1 vs Quiz 2) must produce distinct hashes'
    );
  });

  test('does NOT merge distinct undated notices that share generic titles', () => {
    const libraryNotice = {
      title: 'Important Notice',
      date: null,
      type: 'Notice',
      sourceExcerpt: 'Library opening hours extended until 11pm during exam week.',
    };

    const feeNotice = {
      title: 'Important Notice',
      date: null,
      type: 'Notice',
      sourceExcerpt: 'Semester tuition fees must be cleared by the registrar office.',
    };

    const hashLibrary = computeEventDedupHash(libraryNotice);
    const hashFee = computeEventDedupHash(feeNotice);
    assert.notEqual(
      hashLibrary,
      hashFee,
      'Undated notices with generic titles must distinguish content excerpts and not collide'
    );
  });
});
