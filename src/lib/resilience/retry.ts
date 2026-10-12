/**
 * NoticeSync Resilience: Safe Retries & Concurrency Limiting
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Determines whether an error is transient and safe to retry.
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Network / Connection dropouts
  if (
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('network error')
  ) {
    return true;
  }

  // Rate limits & Server temporary failures
  if (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('service unavailable') ||
    message.includes('gateway timeout')
  ) {
    return true;
  }

  // Non-retryable client errors
  if (
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404') ||
    message.includes('validation') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return false;
  }

  return false;
}

/**
 * Executes an asynchronous operation with exponential backoff and randomized jitter.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 3000;
  const backoffFactor = options.backoffFactor ?? 2;
  const jitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? isTransientError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      lastError = err;

      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }

      // Calculate exponential backoff delay
      let delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      delay = Math.min(delay, maxDelayMs);

      if (jitter) {
        // Add full jitter: random between 0.5 * delay and 1.5 * delay
        delay = Math.round(delay * (0.5 + Math.random()));
      }

      if (options.onRetry) {
        options.onRetry(err, attempt, delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Concurrency Limiter: Bounds the number of concurrent asynchronous operations.
 * Prevents uncontrolled request fan-out to external AI & database providers.
 */
export function createConcurrencyLimiter(concurrency: number) {
  const max = Math.max(1, concurrency);
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const task = queue.shift();
      if (task) task();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= max) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    }

    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}
