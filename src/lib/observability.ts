import * as Sentry from '@sentry/nextjs';
import { Langfuse } from 'langfuse';
import { sanitizeForLogging } from './validation/security';

const isLangfuseConfigured = Boolean(
  process.env.LANGFUSE_PUBLIC_KEY &&
  process.env.LANGFUSE_SECRET_KEY &&
  !process.env.LANGFUSE_PUBLIC_KEY.includes('placeholder')
);

export const langfuse = isLangfuseConfigured
  ? new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
    })
  : null;

/**
 * Log an error safely to Sentry and console without leaking secrets or tokens.
 */
export function logError(error: Error | unknown, context?: Record<string, unknown>) {
  const sanitizedContext = context ? (sanitizeForLogging(context) as Record<string, unknown>) : undefined;
  const message = error instanceof Error ? error.message : String(error);

  console.error('[NoticeSync Error]', message, sanitizedContext);
  Sentry.captureException(error, { extra: sanitizedContext });
}

/**
 * Trace an AI generation call using Langfuse (when configured).
 * Redacts sensitive credentials and truncates large payloads.
 */
export function traceAiCall(name: string, input: unknown, output: unknown, metadata?: Record<string, unknown>) {
  if (!langfuse) return;

  try {
    const sanitizedInput = sanitizeForLogging(input);
    const sanitizedOutput = sanitizeForLogging(output);
    const sanitizedMeta = metadata ? sanitizeForLogging(metadata) : undefined;

    const trace = langfuse.trace({
      name,
      metadata: sanitizedMeta as Record<string, unknown>,
    });

    trace.generation({
      name: `${name}_generation`,
      input: sanitizedInput,
      output: sanitizedOutput,
    });

    langfuse.flushAsync().catch(() => {});
  } catch (e) {
    console.warn('Failed to trace AI call to Langfuse:', e instanceof Error ? e.message : 'Unknown error');
  }
}
