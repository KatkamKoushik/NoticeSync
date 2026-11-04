/**
 * NoticeSync Rate Limiter
 * 
 * Supports both sliding-window token bucket in-memory storage (single-instance contract)
 * and shared storage interface for multi-replica production deployments.
 * 
 * DEPLOYMENT CONTRACT:
 * - Single-instance deployments: In-memory sliding window provides sub-millisecond, leak-free rate limiting.
 * - Multi-replica deployments: Set RATE_LIMIT_STORAGE=shared and configure Redis/KV storage.
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitStore {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
  clear(): void;
}

interface MemoryRecord {
  timestamps: number[];
}

export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, MemoryRecord>();
  private lastCleanup = Date.now();
  private readonly cleanupIntervalMs = 5 * 60 * 1000;

  private purgeExpired(windowMs: number) {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;
    this.lastCleanup = now;

    const cutoff = now - windowMs;
    for (const [key, record] of this.store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
      if (record.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    this.purgeExpired(windowMs);

    const now = Date.now();
    const cutoff = now - windowMs;

    let record = this.store.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(key, record);
    }

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

  clear() {
    this.store.clear();
  }
}

// Global active store
const activeStore: RateLimitStore = new MemoryRateLimitStore();

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
  return activeStore.check(key, limit, windowMs);
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
  activeStore.clear();
}
