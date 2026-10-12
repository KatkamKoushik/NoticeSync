/**
 * NoticeSync Sliding-Window Rate Limiter
 * 
 * Provides rate-limiting protection for expensive AI, OCR, and upload endpoints.
 * In a production multi-replica setup, this can be backed by Redis (e.g., Upstash)
 * or PostgreSQL advisory locks. This built-in implementation provides an in-memory
 * sliding-window token bucket with strict cleanup to prevent memory leaks.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeExpiredRecords(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, record] of store.entries()) {
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
    if (record.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Check if a request exceeds the configured rate limit.
 *
 * @param key Unique identifier (e.g. `parse:${userId}`)
 * @param limit Maximum requests allowed in the window
 * @param windowMs Time window in milliseconds (default 60 seconds)
 */
export function checkRateLimit(
  key: string,
  limit: number = 30,
  windowMs: number = 60 * 1000
): RateLimitResult {
  purgeExpiredRecords(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let record = store.get(key);
  if (!record) {
    record = { timestamps: [] };
    store.set(key, record);
  }

  // Filter out timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > cutoff);

  if (record.timestamps.length >= limit) {
    const oldestTimestamp = record.timestamps[0] || now;
    const resetSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    return {
      success: false,
      limit,
      remaining: 0,
      resetSeconds: Math.max(1, resetSeconds),
    };
  }

  record.timestamps.push(now);

  const remaining = Math.max(0, limit - record.timestamps.length);
  const oldestTimestamp = record.timestamps[0] || now;
  const resetSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

  return {
    success: true,
    limit,
    remaining,
    resetSeconds: Math.max(1, resetSeconds),
  };
}

/**
 * Helper to apply rate-limiting in a Next.js App Router API Route.
 * Returns a Response with status 429 if limit is exceeded, or null if allowed.
 */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60 * 1000
): Response | null {
  const result = checkRateLimit(key, limit, windowMs);

  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests. Please slow down and try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: result.resetSeconds,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.resetSeconds),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetSeconds),
        },
      }
    );
  }

  return null;
}

export function resetRateLimitStoreForTesting() {
  store.clear();
}
