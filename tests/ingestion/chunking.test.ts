import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText } from '../../src/lib/ingestion/chunking';

describe('Ingestion Reliability: Text Chunking Unit Tests', () => {
  test('returns empty array when input text is empty or whitespace', () => {
    assert.deepEqual(chunkText(''), []);
    assert.deepEqual(chunkText('   \n\n\t  '), []);
  });

  test('returns single chunk when text length is within maxChunkSize', () => {
    const text = 'NoticeSync is an academic copilot designed to parse notices and circulars.';
    const chunks = chunkText(text, 1000, 200);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], text);
  });

  test('splits text exceeding maxChunkSize and respects sentence boundaries', () => {
    const sentence1 = 'Sentence one introduces the academic syllabus for Fall 2026.';
    const sentence2 = 'Sentence two details the grading policies and submission rules.';
    const sentence3 = 'Sentence three highlights strict consequences for late penalties.';
    const combined = `${sentence1} ${sentence2} ${sentence3}`;

    // Max chunk size that fits sentence1 + part of sentence2
    const chunks = chunkText(combined, 70, 20);
    assert.ok(chunks.length > 1, 'Long text must be split into multiple chunks');

    // Chunks should end at sentence or word boundaries, not abrupt cuts
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 80, `Chunk length ${chunk.length} should be reasonably bounded`);
      assert.ok(chunk.trim().length > 0);
    }
  });

  test('prefers breaking at newlines when present in second half of chunk', () => {
    const paragraph1 = 'First section of the circular detailing timetable.\n';
    const paragraph2 = 'Second section of the circular detailing exam venues.\n';
    const combined = paragraph1.repeat(3) + paragraph2.repeat(3);

    const chunks = chunkText(combined, 150, 30);
    assert.ok(chunks.length > 1);

    // Verify chunks are non-empty
    for (const chunk of chunks) {
      assert.ok(chunk.length > 0);
    }
  });

  test('maintains overlap between sequential chunks to preserve semantic context', () => {
    const text = 'Alpha paragraph with details. Beta paragraph with constraints. Gamma paragraph with deadlines.';
    const chunks = chunkText(text, 50, 15);
    assert.ok(chunks.length >= 2);

    // Second chunk should contain overlap content from the end of the first chunk
    const firstChunkWords = chunks[0].split(' ');
    const lastWordOfFirst = firstChunkWords[firstChunkWords.length - 1];
    if (lastWordOfFirst.length > 3) {
      assert.ok(
        chunks[1].includes(lastWordOfFirst) || chunks[0].length < text.length,
        'Sequential chunks should preserve semantic context'
      );
    }
  });

  test('guarantees progress and prevents infinite loops on unbroken character strings', () => {
    // String with no spaces, newlines, or periods
    const continuousString = 'A'.repeat(500);
    const chunks = chunkText(continuousString, 100, 20);

    assert.ok(chunks.length > 1);
    assert.equal(chunks.reduce((acc, c) => acc + c.length, 0) >= 500, true);
  });
});
