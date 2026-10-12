/**
 * NoticeSync Security Validation & Sanitization Utilities
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that an input is a valid UUID (v1-v5).
 */
export function isValidUuid(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return UUID_REGEX.test(val.trim());
}

/**
 * Ensures an ID is a valid UUID, throwing an error or returning null if invalid.
 */
export function requireValidUuid(val: unknown, paramName: string = 'id'): string {
  if (!isValidUuid(val)) {
    throw new SecurityValidationError(`Invalid ${paramName}: must be a valid UUID.`);
  }
  return val.trim();
}

export class SecurityValidationError extends Error {
  public readonly status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'SecurityValidationError';
    this.status = status;
  }
}

/**
 * Sanitizes strings by removing dangerous control characters and trimming.
 */
export function sanitizeString(val: unknown, maxLength: number = 1000): string {
  if (typeof val !== 'string') return '';
  // Remove null bytes and non-printable control characters except standard whitespace
  const sanitized = val.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '').trim();
  return sanitized.substring(0, maxLength);
}

/**
 * Sanitizes document titles or file names, stripping path traversals (../, etc.).
 */
export function sanitizeFileName(fileName: string | null | undefined, fallback: string = 'Untitled'): string {
  if (!fileName || typeof fileName !== 'string') return fallback;
  // Strip paths
  const baseName = fileName.replace(/.*[/\\]/, '');
  const clean = baseName.replace(/[^a-zA-Z0-9._\s()\-]/g, '').trim();
  return clean.substring(0, 150) || fallback;
}

/**
 * Safe error response builder that prevents leaking database internals,
 * secret tokens, stack traces, or raw exceptions to clients.
 */
export function safeErrorResponse(
  error: unknown,
  status: number = 500,
  defaultMessage: string = 'An error occurred while processing your request.'
): Response {
  let clientMessage = defaultMessage;
  let code = 'INTERNAL_ERROR';

  if (error instanceof SecurityValidationError) {
    status = error.status;
    clientMessage = error.message;
    code = 'VALIDATION_ERROR';
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.status === 'number') {
      status = errObj.status;
      if (status < 500 && typeof errObj.message === 'string') {
        clientMessage = errObj.message;
      }
    }
  }

  return new Response(
    JSON.stringify({
      error: clientMessage,
      code,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

const SENSITIVE_KEY_REGEX = /(api[-_]?key|secret|token|password|credential|bearer|authorization)/i;

/**
 * Recursively redacts sensitive keys and truncates long raw text for safe logging.
 */
export function sanitizeForLogging(data: unknown, depth: number = 0): unknown {
  if (depth > 5) return '[Max Depth]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    if (data.length > 500) {
      return `${data.substring(0, 100)}... [Truncated ${data.length} chars]`;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        sanitizedObj[key] = sanitizeForLogging(value, depth + 1);
      } else if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizeForLogging(value, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return data;
}

/**
 * Sanitizes untrusted document text before injecting into prompt context,
 * neutralizing prompt injection breakout delimiters.
 */
export function sanitizeUntrustedDocumentContext(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<\/document_context>/gi, '[document_context_end]')
    .replace(/<document_context[^>]*>/gi, '[document_context_start]')
    .replace(/<\/user_document>/gi, '[user_document_end]')
    .replace(/<user_document[^>]*>/gi, '[user_document_start]')
    .replace(/<\/retrieved_memory>/gi, '[retrieved_memory_end]')
    .replace(/<retrieved_memory[^>]*>/gi, '[retrieved_memory_start]');
}

