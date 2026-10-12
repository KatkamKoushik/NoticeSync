import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { GET as jobsGet } from '../../src/app/api/jobs/route';
import { DELETE as memoryDelete } from '../../src/app/api/memory/route';
import { isValidUuid, requireValidUuid, sanitizeFileName, sanitizeString } from '../../src/lib/validation/security';
import { USER_A_TOKEN, createTestRequest } from '../helpers/testUtils';

describe('Security: Input Validation & Sanitization', () => {
  test('isValidUuid accepts standard UUID v4 and rejects malformed values', () => {
    assert.equal(isValidUuid('a0000000-0000-4000-8000-000000000001'), true);
    assert.equal(isValidUuid('123'), false);
    assert.equal(isValidUuid('../etc/passwd'), false);
    assert.equal(isValidUuid('00000000-0000-0000-0000-000000000000'), false); // nil UUID is not valid v1-v5
    assert.equal(isValidUuid(null), false);
    assert.equal(isValidUuid(undefined), false);
    assert.equal(isValidUuid({}), false);
  });

  test('requireValidUuid throws SecurityValidationError on invalid inputs', () => {
    assert.throws(
      () => requireValidUuid("'; DROP TABLE documents; --"),
      /must be a valid UUID/
    );
  });

  test('GET /api/jobs rejects invalid or malicious jobId with 400', async () => {
    const maliciousIds = [
      'invalid-uuid',
      '../../../etc/passwd',
      "123' OR '1'='1",
      '<script>alert(1)</script>',
    ];

    for (const badId of maliciousIds) {
      const req = createTestRequest(`/api/jobs?jobId=${encodeURIComponent(badId)}`, {
        method: 'GET',
        token: USER_A_TOKEN,
      });
      const res = await jobsGet(req);
      assert.equal(res.status, 400, `Expected 400 for jobId: ${badId}`);
      const data = await res.json();
      assert.match(data.error, /Valid jobId parameter is required/i);
    }
  });

  test('DELETE /api/memory rejects malformed document ID with 400', async () => {
    const req = createTestRequest('/api/memory?id=malformed-id', {
      method: 'DELETE',
      token: USER_A_TOKEN,
    });
    const res = await memoryDelete(req);
    assert.equal(res.status, 400);
  });

  test('sanitizeFileName removes path traversal and dangerous characters', () => {
    assert.equal(sanitizeFileName('../../../secret.pdf'), 'secret.pdf');
    assert.equal(sanitizeFileName('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
    assert.equal(sanitizeFileName('my syllabus (1) - 2026.pdf'), 'my syllabus (1) - 2026.pdf');
    assert.equal(sanitizeFileName('<script>evil.pdf'), 'scriptevil.pdf');
  });

  test('sanitizeString strips null bytes and control characters', () => {
    const dirty = 'Safe Text \u0000\u0007\u001F More Text';
    const clean = sanitizeString(dirty);
    assert.equal(clean, 'Safe Text  More Text');
  });
});
