import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAndValidateExtraction,
  MalformedModelOutputError,
} from '../../src/lib/ai';

describe('AI/ML Reliability: Malformed Output & Schema Rejection', () => {
  test('parses and validates well-formed JSON array conforming to extraction schema', () => {
    const validJson = JSON.stringify([
      {
        title: 'Midterm Examination',
        date: '2026-11-15',
        type: 'Exam',
        description: 'Room 201',
        confidence: 95,
        importance: 'high',
        actionRequired: true,
        strictDeadline: true,
        deadlineChange: 'none',
        additionalInformationPending: false,
        sourceText: 'Midterm exam is on Nov 15 in Room 201.',
        course: 'CS101',
        location: 'Room 201',
      },
    ]);

    const result = parseAndValidateExtraction(validJson);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Midterm Examination');
    assert.equal(result[0].course, 'CS101');
    assert.equal(result[0].location, 'Room 201');
  });

  test('throws MalformedModelOutputError on malformed JSON syntax instead of returning []', () => {
    const malformedSyntax = `[ { "title": "Midterm Exam", "date": "2026-11-15", ...TRUNCATED`;

    assert.throws(
      () => {
        parseAndValidateExtraction(malformedSyntax);
      },
      (err: any) => {
        assert.ok(err instanceof MalformedModelOutputError);
        assert.match(err.message, /not valid JSON syntax/i);
        return true;
      }
    );
  });

  test('throws MalformedModelOutputError when model returns a single object instead of an array', () => {
    const singleObjectJson = JSON.stringify({
      status: 'success',
      message: 'No events found in this circular',
    });

    assert.throws(
      () => {
        parseAndValidateExtraction(singleObjectJson);
      },
      (err: any) => {
        assert.ok(err instanceof MalformedModelOutputError);
        assert.match(err.message, /JSON array/i);
        return true;
      }
    );
  });

  test('throws MalformedModelOutputError when required event fields fail schema validation', () => {
    // Missing title or empty title
    const invalidSchemaJson = JSON.stringify([
      {
        title: '', // Empty title is invalid
        date: '2026-11-15',
        type: 'Exam',
      },
    ]);

    assert.throws(
      () => {
        parseAndValidateExtraction(invalidSchemaJson);
      },
      (err: any) => {
        assert.ok(err instanceof MalformedModelOutputError);
        assert.match(err.message, /schema/i);
        return true;
      }
    );
  });
});
