import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFileHeader,
  withTimeout,
  ExtractionTimeoutError,
  CorruptFileError,
  extractPdfText,
  extractImageText,
} from '../../src/lib/ingestion/extractors';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { USER_A_TOKEN, USER_A_ID, createTestRequest } from '../helpers/testUtils';
import { resetTestDbStore, testDbStore } from '../../src/lib/auth/server';

describe('Ingestion Reliability: Malformed Uploads, Timeouts & Corrupt Files', () => {
  test('validateFileHeader rejects 0-byte empty files', () => {
    const empty = Buffer.alloc(0);
    const pdfCheck = validateFileHeader(empty, 'pdf');
    assert.equal(pdfCheck.valid, false);
    assert.match(pdfCheck.reason!, /empty \(0 bytes\)/i);

    const imgCheck = validateFileHeader(empty, 'image');
    assert.equal(imgCheck.valid, false);
    assert.match(imgCheck.reason!, /empty \(0 bytes\)/i);
  });

  test('validateFileHeader validates PDF magic bytes (%PDF)', () => {
    // Fake PDF with valid header
    const validPdfBuffer = Buffer.from('%PDF-1.7\n%some binary data');
    const validResult = validateFileHeader(validPdfBuffer, 'pdf');
    assert.equal(validResult.valid, true);

    // Corrupt / spoofed PDF (e.g. plain text or executable renamed to .pdf)
    const spoofedPdfBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00This is an exe file');
    const corruptResult = validateFileHeader(spoofedPdfBuffer, 'pdf');
    assert.equal(corruptResult.valid, false);
    assert.match(corruptResult.reason!, /valid PDF header/i);
  });

  test('validateFileHeader validates PNG, JPEG, and WebP image magic bytes', () => {
    // Valid PNG header (89 50 4E 47 ...)
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(validateFileHeader(pngHeader, 'image').valid, true);

    // Valid JPEG header (FF D8 FF ...)
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    assert.equal(validateFileHeader(jpegHeader, 'image').valid, true);

    // Valid WebP header (RIFF....WEBP)
    const webpHeader = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
    ]);
    assert.equal(validateFileHeader(webpHeader, 'image').valid, true);

    // Spoofed / text file disguised as PNG
    const spoofedImage = Buffer.from('<html><body>Hello</body></html>');
    const imageResult = validateFileHeader(spoofedImage, 'image');
    assert.equal(imageResult.valid, false);
    assert.match(imageResult.reason!, /format not recognized/i);
  });

  test('extractPdfText rejects invalid header early with CorruptFileError', async () => {
    const corruptBuffer = Buffer.from('Not a real PDF document');
    await assert.rejects(
      async () => {
        await extractPdfText(corruptBuffer);
      },
      (err: any) => {
        assert.ok(err instanceof CorruptFileError);
        assert.match(err.message, /valid PDF header/i);
        return true;
      }
    );
  });

  test('extractImageText rejects invalid image header early with CorruptFileError', async () => {
    const corruptBuffer = Buffer.from('random corrupted image data');
    await assert.rejects(
      async () => {
        await extractImageText(corruptBuffer);
      },
      (err: any) => {
        assert.ok(err instanceof CorruptFileError);
        assert.match(err.message, /Image file format not recognized/i);
        return true;
      }
    );
  });

  test('withTimeout aborts hanging operations and raises ExtractionTimeoutError', async () => {
    const hangingOperation = new Promise<string>((resolve) => {
      // Intentionally hangs for 5 seconds
      setTimeout(() => resolve('finished'), 5000);
    });

    await assert.rejects(
      async () => {
        await withTimeout(hangingOperation, 50, 'Operation timed out after 50ms');
      },
      (err: any) => {
        assert.ok(err instanceof ExtractionTimeoutError);
        assert.match(err.message, /timed out after 50ms/i);
        return true;
      }
    );
  });

  test('POST /api/parse rejects empty or insufficient extracted text with 400', async () => {
    resetTestDbStore();
    const jobId = '33333333-4444-4000-8000-555555555555';

    testDbStore.processing_jobs.push({
      id: jobId,
      user_id: USER_A_ID,
      status: 'pending',
      progress: 0,
      current_step: 'Initializing...',
    });

    const formData = new FormData();
    formData.append('jobId', jobId);
    formData.append('text', 'Hi'); // Only 2 characters!

    const req = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });

    const res = await parsePost(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Not enough readable text/i);

    // Job in DB must be updated to failed with clear reason
    const jobInDb = testDbStore.processing_jobs.find((j) => j.id === jobId);
    assert.equal(jobInDb?.status, 'failed');
    assert.match(jobInDb?.error_message || '', /Not enough readable text/i);
  });

  test('POST /api/parse rejects corrupt PDF upload and marks job as failed', async () => {
    resetTestDbStore();
    const jobId = '44444444-5555-4000-8000-666666666666';

    testDbStore.processing_jobs.push({
      id: jobId,
      user_id: USER_A_ID,
      status: 'pending',
      progress: 0,
      current_step: 'Initializing...',
    });

    // Create a mock corrupt PDF file
    const corruptBlob = new Blob(['Not a valid PDF file content'], { type: 'application/pdf' });
    const corruptFile = new File([corruptBlob], 'syllabus.pdf', { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('jobId', jobId);
    formData.append('pdf', corruptFile);

    const req = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });

    const res = await parsePost(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /PDF header/i);

    // Verify job in DB is marked failed
    const jobInDb = testDbStore.processing_jobs.find((j) => j.id === jobId);
    assert.equal(jobInDb?.status, 'failed');
    assert.match(jobInDb?.error_message || '', /PDF header/i);
  });
});
