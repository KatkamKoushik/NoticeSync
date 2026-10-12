/**
 * Extractor utilities for NoticeSync
 * Includes magic byte validation, timeout bounds, and safe error handling.
 */

export class ExtractionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionTimeoutError';
  }
}

export class CorruptFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptFileError';
  }
}

/**
 * Validates the file magic bytes to detect corrupt or spoofed payloads before parsing.
 */
export function validateFileHeader(
  buffer: Buffer,
  expectedType: 'pdf' | 'image'
): { valid: boolean; reason?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'Uploaded file is empty (0 bytes).' };
  }

  if (expectedType === 'pdf') {
    if (buffer.length < 4) {
      return { valid: false, reason: 'File is too short to be a valid PDF.' };
    }
    // PDF magic byte check: %PDF
    const header = buffer.subarray(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      return { valid: false, reason: 'File does not have a valid PDF header (%PDF).' };
    }
    return { valid: true };
  }

  if (expectedType === 'image') {
    if (buffer.length < 8) {
      return { valid: false, reason: 'File is too short to be a valid image.' };
    }
    // PNG: 89 50 4E 47
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    // JPEG: FF D8 FF
    const isJpeg =
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    // WebP: RIFF .... WEBP
    const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
    const isWebp =
      isRiff &&
      buffer.length >= 12 &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isPng && !isJpeg && !isWebp) {
      return {
        valid: false,
        reason: 'Image file format not recognized. Supported formats: PNG, JPEG, WebP.',
      };
    }
    return { valid: true };
  }

  return { valid: false, reason: 'Unsupported file type.' };
}

/**
 * Wraps any promise with a strict timeout limit.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ExtractionTimeoutError(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export function normalizeText(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export interface PageProvenance {
  pageNumber: number;
  text: string;
}

export interface ExtractedDocumentResult {
  text: string;
  pages: PageProvenance[];
  pageCount: number;
  isScanned?: boolean;
}

/**
 * Extracts text and per-page provenance from a PDF document with execution timeout.
 */
export async function extractPdfWithProvenance(
  buffer: Buffer,
  timeoutMs: number = 15000
): Promise<ExtractedDocumentResult> {
  const validation = validateFileHeader(buffer, 'pdf');
  if (!validation.valid) {
    throw new CorruptFileError(validation.reason || 'Corrupt or invalid PDF file.');
  }

  return withTimeout(
    (async () => {
      try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText();
        const pages: PageProvenance[] = [];

        if (textResult.pages && Array.isArray(textResult.pages)) {
          for (const p of textResult.pages) {
            const pageText = normalizeText(p.text || '');
            pages.push({
              pageNumber: p.num,
              text: pageText,
            });
          }
        }

        const rawText = textResult.text || '';
        const normalized = normalizeText(rawText);
        await parser.destroy();

        return {
          text: normalized,
          pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: normalized }],
          pageCount: textResult.total || (pages.length > 0 ? pages.length : 1),
          isScanned: normalized.length < 20,
        };
      } catch (err: unknown) {
        if (err instanceof ExtractionTimeoutError || err instanceof CorruptFileError) {
          throw err;
        }
        throw new CorruptFileError('Failed to parse PDF document. File may be corrupted or encrypted.');
      }
    })(),
    timeoutMs,
    'PDF text extraction timed out after 15 seconds.'
  );
}

/**
 * Extracts text from a PDF document with magic-byte validation and execution timeout.
 */
export async function extractPdfText(buffer: Buffer, timeoutMs: number = 15000): Promise<string> {
  const result = await extractPdfWithProvenance(buffer, timeoutMs);
  return result.text;
}

/**
 * Extracts text from an image with magic-byte validation and execution timeout.
 */
export async function extractImageText(buffer: Buffer, timeoutMs: number = 25000): Promise<string> {
  const validation = validateFileHeader(buffer, 'image');
  if (!validation.valid) {
    throw new CorruptFileError(validation.reason || 'Corrupt or invalid image file.');
  }

  return withTimeout(
    (async () => {
      try {
        const Tesseract = await import('tesseract.js');
        const { data } = await Tesseract.recognize(buffer, 'eng');
        return normalizeText(data.text || '');
      } catch (err: unknown) {
        if (err instanceof ExtractionTimeoutError || err instanceof CorruptFileError) {
          throw err;
        }
        throw new CorruptFileError('OCR processing failed to read image.');
      }
    })(),
    timeoutMs,
    'Image OCR extraction timed out after 25 seconds.'
  );
}
