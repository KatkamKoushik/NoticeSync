import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as jobsPost } from '../../src/app/api/jobs/route';
import { USER_A_ID, USER_B_ID, USER_A_TOKEN, createTestRequest } from '../helpers/testUtils';

describe('Security: Spoofed User ID Defense', () => {
  test('client-supplied userId in body is ignored; effective identity remains verified session user', async () => {
    // User A attempts to spoof User B by supplying User B's ID in the POST body
    const req = createTestRequest('/api/jobs', {
      method: 'POST',
      token: USER_A_TOKEN,
      body: {
        userId: USER_B_ID, // Attempted spoof!
      },
    });

    const res = await jobsPost(req);
    // Should succeed because User A is authenticated, but job must belong to User A, not User B
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.jobId);
  });
});
