import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndReadStream,
  validateExtractedTextBounds,
  detectEncryptedPdf,
  MimeSpoofingError,
  PayloadTooLargeError,
  EncryptedFileError,
  DecompressionBombError,
} from '../../src/lib/ingestion/streamValidation';
import { POST as parsePost } from '../../src/app/api/parse/route';
import { USER_A_TOKEN, createTestRequest } from '../helpers/testUtils';

describe('Document Ingestion: MIME Spoofing, Streaming Limits & Malicious Payloads', () => {
  test('rejects forbidden file extensions (.exe, .sh, .bat, etc.)', async () => {
    const maliciousFile = new File([Buffer.from('%PDF-1.4 fake content')], 'virus.exe', {
      type: 'application/pdf',
    });

    await assert.rejects(
      async () => {
        await validateAndReadStream(maliciousFile, 'pdf', 10 * 1024 * 1024);
      },
      (err: unknown) => {
        assert.ok(err instanceof MimeSpoofingError);
        assert.match((err as Error).message, /dangerous file extension/i);
        return true;
      }
    );
  });

  test('rejects MIME spoofing: .pdf extension with PNG image bytes', async () => {
    // PNG magic bytes: \x89PNG\r\n\x1a\n
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const spoofedFile = new File([pngHeader], 'syllabus.pdf', {
      type: 'application/pdf',
    });

    await assert.rejects(
      async () => {
        await validateAndReadStream(spoofedFile, 'pdf', 10 * 1024 * 1024);
      },
      (err: unknown) => {
        assert.ok(err instanceof MimeSpoofingError);
        assert.match((err as Error).message, /header signature|PDF/i);
        return true;
      }
    );
  });

  test('rejects MIME spoofing: .png extension with PDF bytes', async () => {
    const pdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj');
    const spoofedImage = new File([pdfHeader], 'notice.png', {
      type: 'image/png',
    });

    await assert.rejects(
      async () => {
        await validateAndReadStream(spoofedImage, 'image', 5 * 1024 * 1024);
      },
      (err: unknown) => {
        assert.ok(err instanceof MimeSpoofingError);
        assert.match((err as Error).message, /Image file format not recognized/i);
        return true;
      }
    );
  });

  test('detects and rejects encrypted or password-protected PDFs', async () => {
    const encryptedPdfBuffer = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      'trailer\n<< /Size 10 /Encrypt 5 0 R >>\n%%EOF'
    );

    assert.equal(detectEncryptedPdf(encryptedPdfBuffer), true);

    const encryptedFile = new File([encryptedPdfBuffer], 'confidential.pdf', {
      type: 'application/pdf',
    });

    await assert.rejects(
      async () => {
        await validateAndReadStream(encryptedFile, 'pdf', 10 * 1024 * 1024);
      },
      (err: unknown) => {
        assert.ok(err instanceof EncryptedFileError);
        assert.match((err as Error).message, /encrypted or password-protected/i);
        return true;
      }
    );
  });

  test('enforces streaming byte limits for oversized PDF payloads (413)', async () => {
    // Simulate oversized file (11MB > 10MB limit)
    const oversizedFile = new File([Buffer.alloc(11 * 1024 * 1024)], 'giant.pdf', {
      type: 'application/pdf',
    });

    await assert.rejects(
      async () => {
        await validateAndReadStream(oversizedFile, 'pdf', 10 * 1024 * 1024);
      },
      (err: unknown) => {
        assert.ok(err instanceof PayloadTooLargeError);
        assert.equal((err as PayloadTooLargeError).status, 413);
        return true;
      }
    );
  });

  test('detects and rejects decompression bombs with extreme expansion ratios', () => {
    const massiveText = 'A'.repeat(105000); // Exceeds 100,000 char cap
    assert.throws(
      () => {
        validateExtractedTextBounds(massiveText, 2048);
      },
      (err: unknown) => {
        assert.ok(err instanceof DecompressionBombError);
        assert.equal((err as DecompressionBombError).status, 422);
        return true;
      }
    );
  });

  test('POST /api/parse rejects spoofed PDF in HTTP request with 400', async () => {
    const formData = new FormData();
    const spoofedContent = Buffer.from('NOT_A_REAL_PDF_JUST_RANDOM_TEXT');
    const spoofedFile = new File([spoofedContent], 'fake.pdf', { type: 'application/pdf' });
    formData.append('pdf', spoofedFile);

    const req = createTestRequest('/api/parse', {
      method: 'POST',
      token: USER_A_TOKEN,
      formData,
    });

    const res = await parsePost(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /header signature|PDF header/i);
  });
});

