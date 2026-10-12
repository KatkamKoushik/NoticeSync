import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTransientError,
  withRetry,
  createConcurrencyLimiter,
} from '../../src/lib/resilience/retry';

describe('Ingestion Reliability: Resilience, Retries & Concurrency Limiting', () => {
  test('isTransientError correctly classifies transient vs non-transient errors', () => {
    // Transient errors
    assert.equal(isTransientError(new Error('fetch failed')), true);
    assert.equal(isTransientError(new Error('connect ECONNRESET 127.0.0.1:443')), true);
    assert.equal(isTransientError(new Error('socket hang up')), true);
    assert.equal(isTransientError(new Error('Groq API returned 429 Too Many Requests')), true);
    assert.equal(isTransientError(new Error('503 Service Unavailable')), true);
    assert.equal(isTransientError(new Error('504 Gateway Timeout')), true);

    // Non-transient client / validation / auth errors
    assert.equal(isTransientError(new Error('400 Bad Request')), false);
    assert.equal(isTransientError(new Error('401 Unauthorized session expired')), false);
    assert.equal(isTransientError(new Error('403 Forbidden')), false);
    assert.equal(isTransientError(new Error('404 Not Found')), false);
    assert.equal(isTransientError(new Error('Validation failed for date')), false);
  });

  test('withRetry succeeds immediately when operation does not fail', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      return 'success';
    });

    assert.equal(result, 'success');
    assert.equal(callCount, 1);
  });

  test('withRetry recovers from transient failures with exponential backoff', async () => {
    let attempts = 0;
    const retryDelays: number[] = [];

    const result = await withRetry(
      async (attempt) => {
        attempts++;
        if (attempt < 3) {
          throw new Error(`Transient error 503 attempt ${attempt}`);
        }
        return 'recovered-payload';
      },
      {
        maxAttempts: 3,
        initialDelayMs: 20,
        maxDelayMs: 200,
        jitter: false,
        onRetry: (_err, attempt, delay) => {
          retryDelays.push(delay);
        },
      }
    );

    assert.equal(result, 'recovered-payload');
    assert.equal(attempts, 3);
    assert.equal(retryDelays.length, 2);
    // Backoff factor of 2: delay 1 = 20ms, delay 2 = 40ms
    assert.equal(retryDelays[0], 20);
    assert.equal(retryDelays[1], 40);
  });

  test('withRetry stops retrying immediately on non-transient errors', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await withRetry(
          async () => {
            attempts++;
            throw new Error('401 Unauthorized token');
          },
          { maxAttempts: 5, initialDelayMs: 10 }
        );
      },
      (err: any) => {
        assert.match(err.message, /401 Unauthorized/);
        return true;
      }
    );

    // Should NOT retry 5 times; must stop at attempt 1
    assert.equal(attempts, 1);
  });

  test('withRetry throws last error once max attempts are exhausted', async () => {
    let attempts = 0;

    await assert.rejects(
      async () => {
        await withRetry(
          async (att) => {
            attempts++;
            throw new Error(`Persistent 503 on try ${att}`);
          },
          { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 50, jitter: false }
        );
      },
      (err: any) => {
        assert.match(err.message, /Persistent 503 on try 3/);
        return true;
      }
    );

    assert.equal(attempts, 3);
  });

  test('createConcurrencyLimiter bounds parallel executions to configured threshold', async () => {
    const limiter = createConcurrencyLimiter(2);
    let activeWorkers = 0;
    let maxObservedWorkers = 0;

    const task = async (index: number) => {
      return limiter(async () => {
        activeWorkers++;
        if (activeWorkers > maxObservedWorkers) {
          maxObservedWorkers = activeWorkers;
        }
        // Simulate asynchronous operation
        await new Promise((resolve) => setTimeout(resolve, 30));
        activeWorkers--;
        return `worker-${index}`;
      });
    };

    // Run 6 concurrent tasks
    const results = await Promise.all([
      task(1),
      task(2),
      task(3),
      task(4),
      task(5),
      task(6),
    ]);

    assert.equal(results.length, 6);
    // Concurrency limit was 2, so at no point should there have been > 2 active workers
    assert.equal(maxObservedWorkers, 2, 'Active concurrency must never exceed bound of 2');
    assert.equal(activeWorkers, 0);
  });
});
