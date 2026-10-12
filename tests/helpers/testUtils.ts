import { NextRequest } from 'next/server';

Object.assign(process.env, {
  NODE_ENV: 'test',
  NOTICE_SYNC_TEST_MODE: 'true',
});

export const USER_A_ID = 'a0000000-0000-4000-8000-000000000001';
export const USER_B_ID = 'b0000000-0000-4000-8000-000000000002';

export const USER_A_TOKEN = 'test-token-user-a';
export const USER_B_TOKEN = 'test-token-user-b';

/**
 * Creates a mock NextRequest with test headers and configuration.
 */
export function createTestRequest(
  url: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    formData?: FormData;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let requestBody: BodyInit | null = null;
  if (options.formData) {
    requestBody = options.formData;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(options.body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers,
    body: requestBody,
  });
}
