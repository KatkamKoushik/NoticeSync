/**
 * NoticeSync Stream Validation & Ingestion Hardening
 *
 * Enforces streaming byte limits, file extension matching, MIME type cross-validation,
 * magic byte signatures, encrypted PDF detection, and decompression-bomb defenses.
 */

import { validateFileHeader } from './extractors';

export class PayloadTooLargeError extends Error {
  public readonly status: number = 413;
  constructor(message: string) {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

export class MimeSpoofingError extends Error {
  public readonly status: number = 400;
  constructor(message: string) {
    super(message);
    this.name = 'MimeSpoofingError';
  }
}

export class EncryptedFileError extends Error {
  public readonly status: number = 400;
  constructor(message: string) {
    super(message);
    this.name = 'EncryptedFileError';
  }
}

export class DecompressionBombError extends Error {
  public readonly status: number = 422;
  constructor(message: string) {
    super(message);
    this.name = 'DecompressionBombError';
  }
}

const ALLOWED_PDF_EXTENSIONS = new Set(['.pdf']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.bin', '.js', '.ts', '.mjs', '.py',
  '.html', '.htm', '.svg', '.xml', '.jar', '.vbs', '.ps1', '.php'
]);

/**
 * Extracts the file extension in lowercase.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot).toLowerCase();
}

/**
 * Validates file extension, declared MIME, and reads buffer up to a strict byte limit.
 * If streamed size exceeds maxBytes, immediately throws PayloadTooLargeError.
 */
export async function validateAndReadStream(
  file: File,
  expectedType: 'pdf' | 'image',
  maxBytes: number
): Promise<Buffer> {
  const filename = file.name || 'unnamed';
  const ext = getFileExtension(filename);

  // 1. Reject forbidden/executable extensions
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new MimeSpoofingError(`Rejected dangerous file extension: ${ext}`);
  }

  // 2. Validate file extension against expected type
  if (expectedType === 'pdf') {
    if (!ALLOWED_PDF_EXTENSIONS.has(ext)) {
      throw new MimeSpoofingError(`Invalid file extension for PDF: expected .pdf, got ${ext || 'none'}`);
    }
  } else if (expectedType === 'image') {
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new MimeSpoofingError(`Invalid file extension for image: expected .png, .jpg, or .webp, got ${ext || 'none'}`);
    }
  }

  // 3. Check declared Content-Length / File size metadata
  if (file.size > maxBytes) {
    throw new PayloadTooLargeError(`File size (${file.size} bytes) exceeds limit of ${maxBytes} bytes.`);
  }

  // 4. Enforce streaming byte limits when reading content
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new PayloadTooLargeError(`Streamed content (${arrayBuffer.byteLength} bytes) exceeds limit of ${maxBytes} bytes.`);
  }

  const buffer = Buffer.from(arrayBuffer);

  // 5. Magic Byte Validation
  const headerValidation = validateFileHeader(buffer, expectedType);
  if (!headerValidation.valid) {
    throw new MimeSpoofingError(
      headerValidation.reason || `File header signature does not match expected ${expectedType} format.`
    );
  }

  // 6. Encrypted PDF Detection
  if (expectedType === 'pdf') {
    const isEncrypted = detectEncryptedPdf(buffer);
    if (isEncrypted) {
      throw new EncryptedFileError('PDF is encrypted or password-protected and cannot be parsed.');
    }
  }

  return buffer;
}

/**
 * Detects whether a PDF file contains encryption dictionaries (/Encrypt).
 */
export function detectEncryptedPdf(buffer: Buffer): boolean {
  // Check trailer or xref dictionaries for /Encrypt
  const snippet = buffer.subarray(0, Math.min(buffer.length, 32768)).toString('binary');
  const tail = buffer.subarray(Math.max(0, buffer.length - 8192)).toString('binary');
  
  const encryptRegex = /\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</;
  return encryptRegex.test(snippet) || encryptRegex.test(tail);
}

/**
 * Defends against decompression bombs or excessive uncompressed text expansion.
 */
export function validateExtractedTextBounds(extractedText: string, inputBufferSize: number): void {
  const MAX_TEXT_CHARS = 100000;
  if (extractedText.length > MAX_TEXT_CHARS) {
    throw new DecompressionBombError(
      `Extracted text length (${extractedText.length} chars) exceeds safety threshold of ${MAX_TEXT_CHARS} chars.`
    );
  }

  // If buffer is very small (e.g. < 5KB) but extracted text is > 50,000 chars, flag compression bomb
  if (inputBufferSize < 5000 && extractedText.length > 50000) {
    throw new DecompressionBombError('Suspicious decompression ratio detected (potential decompression bomb).');
  }
}

