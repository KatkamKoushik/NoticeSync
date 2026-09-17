import * as Sentry from '@sentry/nextjs';
import { Langfuse } from 'langfuse';

// Initialize Langfuse (it will safely no-op if env vars are missing)
export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || 'pk-lf-placeholder',
  secretKey: process.env.LANGFUSE_SECRET_KEY || 'sk-lf-placeholder',
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com'
});

/**
 * Log an error to Sentry and console
 */
export function logError(error: Error | unknown, context?: Record<string, any>) {
  console.error('[NoticeSync Error]', error, context);
  Sentry.captureException(error, { extra: context });
}

/**
 * Trace an AI generation call using Langfuse
 */
export function traceAiCall(name: string, input: any, output: any, metadata?: any) {
  try {
    const trace = langfuse.trace({
      name,
      metadata,
    });
    
    trace.generation({
      name: `${name}_generation`,
      input: input,
      output: output,
    });
    
    // Flush asynchronously
    langfuse.flushAsync().catch(() => {});
  } catch (e) {
    console.warn('Failed to trace AI call to Langfuse', e);
  }
}
