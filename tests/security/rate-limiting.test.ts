import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, enforceRateLimit, resetRateLimitStoreForTesting } from '../../src/lib/security/rateLimit';

describe('Security: Sliding-Window Rate Limiting', () => {
  beforeEach(() => {
    resetRateLimitStoreForTesting();
  });

  test('permits requests within quota and tracks remaining allowance', () => {
    const key = 'test-client-1';
    const limit = 3;

    const r1 = checkRateLimit(key, limit, 60000);
    assert.equal(r1.success, true);
    assert.equal(r1.remaining, 2);

    const r2 = checkRateLimit(key, limit, 60000);
    assert.equal(r2.success, true);
    assert.equal(r2.remaining, 1);

    const r3 = checkRateLimit(key, limit, 60000);
    assert.equal(r3.success, true);
    assert.equal(r3.remaining, 0);

    // 4th request exceeds limit
    const r4 = checkRateLimit(key, limit, 60000);
    assert.equal(r4.success, false);
    assert.equal(r4.remaining, 0);
    assert.ok(r4.resetSeconds > 0);
  });

  test('enforceRateLimit returns 429 Response with Retry-After header when exceeded', async () => {
    const key = 'test-client-2';
    const limit = 2;

    assert.equal(enforceRateLimit(key, limit), null);
    assert.equal(enforceRateLimit(key, limit), null);

    const blockedRes = enforceRateLimit(key, limit);
    assert.ok(blockedRes !== null);
    assert.equal(blockedRes.status, 429);
    assert.ok(blockedRes.headers.get('Retry-After'));
    assert.equal(blockedRes.headers.get('X-RateLimit-Remaining'), '0');

    const data = await blockedRes.json();
    assert.equal(data.code, 'RATE_LIMIT_EXCEEDED');
  });
});
