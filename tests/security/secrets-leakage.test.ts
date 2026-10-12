import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { safeErrorResponse, sanitizeForLogging } from '../../src/lib/validation/security';

describe('Security: Secrets and Error Leakage Prevention', () => {
  test('safeErrorResponse returns generic messages and hides internal exception details', async () => {
    const internalDbError = new Error('FATAL: password authentication failed for user "postgres"');
    (internalDbError as any).stack = 'Error at pg.connect(/secret/path/credentials.ts:12:5)';

    const res = safeErrorResponse(internalDbError, 500);
    assert.equal(res.status, 500);

    const data = await res.json();
    assert.equal(data.error, 'An error occurred while processing your request.');
    assert.equal(data.code, 'INTERNAL_ERROR');
    assert.equal(data.stack, undefined, 'Stack traces must never be exposed');
    assert.ok(!JSON.stringify(data).includes('password'), 'Database credentials must not be leaked');
  });

  test('sanitizeForLogging redacts sensitive tokens and passwords', () => {
    const rawPayload = {
      apiKey: 'mock_groq_api_key_sample',
      bearerToken: 'mock_bearer_token_sample',
      auth: {
        password: 'mock_database_password_sample',
      },
      documentText: 'A'.repeat(1000), // Very long document content
      normalField: 'DBMS Syllabus',
    };

    const sanitized = sanitizeForLogging(rawPayload) as any;

    assert.equal(sanitized.apiKey, '[REDACTED]');
    assert.equal(sanitized.bearerToken, '[REDACTED]');
    assert.equal(sanitized.auth.password, '[REDACTED]');
    assert.ok(sanitized.documentText.includes('[Truncated 1000 chars]'));
    assert.equal(sanitized.normalField, 'DBMS Syllabus');
  });
});
