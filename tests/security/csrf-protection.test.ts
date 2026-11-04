import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateCsrf, enforceCsrf } from '../../src/lib/security/csrf';
import { POST as jobsPost } from '../../src/app/api/jobs/route';
import { PATCH as eventsPatch } from '../../src/app/api/events/route';
import { DELETE as memoryDelete } from '../../src/app/api/memory/route';
import { USER_A_TOKEN, createTestRequest } from '../helpers/testUtils';

describe('Web Auth & CSRF: Cross-Site Request Forgery Protection', () => {
  test('Bearer token requests bypass CSRF protection for API clients', () => {
    const req = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {},
    });

    const result = validateCsrf(req, 'bearer');
    assert.equal(result.valid, true);
    const response = enforceCsrf(req, 'bearer');
    assert.equal(response, null);
  });

  test('Cookie-authenticated requests reject Sec-Fetch-Site: cross-site with 403', async () => {
    const req = createTestRequest('/api/jobs', {
      method: 'POST',
      cookie: `sb-access-token=${USER_A_TOKEN}`,
      headers: {
        'sec-fetch-site': 'cross-site',
        origin: 'https://malicious-website.com',
      },
      body: {},
    });

    const result = validateCsrf(req, 'cookie');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'CSRF_FETCH_METADATA_VIOLATION');

    const res = await jobsPost(req);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /CSRF|Fetch Metadata/i);
  });

  test('Cookie-authenticated requests reject untrusted Origin header with 403', async () => {
    const req = createTestRequest('/api/events', {
      method: 'PATCH',
      cookie: `sb-access-token=${USER_A_TOKEN}`,
      headers: {
        'sec-fetch-site': 'same-site',
        origin: 'https://evil-hacker.com',
      },
      body: { id: '00000000-0000-4000-8000-000000000001', title: 'Hacked Event' },
    });

    const result = validateCsrf(req, 'cookie');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'CSRF_ORIGIN_MISMATCH');

    const res = await eventsPatch(req);
    assert.equal(res.status, 403);
  });

  test('Cookie-authenticated requests reject missing Origin and Referer with 403', async () => {
    const req = createTestRequest('/api/memory?id=a0000000-0000-4000-8000-000000000001', {
      method: 'DELETE',
      cookie: `sb-access-token=${USER_A_TOKEN}`,
    });

    const result = validateCsrf(req, 'cookie');
    assert.equal(result.valid, false);
    assert.equal(result.code, 'CSRF_ORIGIN_MISSING');

    const res = await memoryDelete(req);
    assert.equal(res.status, 403);
  });

  test('Cookie-authenticated requests succeed when Origin matches trusted host', async () => {
    const req = createTestRequest('/api/jobs', {
      method: 'POST',
      cookie: `sb-access-token=${USER_A_TOKEN}`,
      headers: {
        'sec-fetch-site': 'same-origin',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: {},
    });

    const result = validateCsrf(req, 'cookie');
    assert.equal(result.valid, true);

    const res = await jobsPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.jobId);
  });
});

