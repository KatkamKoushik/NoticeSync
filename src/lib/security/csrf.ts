/**
 * NoticeSync CSRF & Origin Validation Guard
 *
 * Protects state-changing API routes against Cross-Site Request Forgery (CSRF).
 * When requests are authenticated via ambient cookies, this module enforces
 * W3C Fetch Metadata (Sec-Fetch-Site) and Origin/Referer header verification
 * against trusted deployment origins.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CsrfValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

/**
 * Validates CSRF protection for incoming requests.
 *
 * @param req Request to inspect
 * @param authType How the request was authenticated: 'bearer' | 'cookie' | 'none'
 */
export function validateCsrf(req: Request, authType: 'bearer' | 'cookie' | 'none'): CsrfValidationResult {
  const method = req.method.toUpperCase();

  // Safe HTTP methods do not change state
  if (!STATE_CHANGING_METHODS.has(method)) {
    return { valid: true };
  }

  // Token-authenticated API requests (Authorization: Bearer ...) are immune to classic CSRF
  // because browsers cannot automatically attach custom Authorization headers cross-origin.
  if (authType === 'bearer') {
    return { valid: true };
  }

  // If unauthenticated, auth enforcement will reject it; CSRF is not the primary gate
  if (authType === 'none') {
    return { valid: true };
  }

  // For cookie-authenticated state-changing requests, enforce strict CSRF checks:
  
  // 1. W3C Fetch Metadata Check (Sec-Fetch-Site)
  const secFetchSite = req.headers.get('sec-fetch-site')?.toLowerCase().trim();
  if (secFetchSite === 'cross-site') {
    return {
      valid: false,
      code: 'CSRF_FETCH_METADATA_VIOLATION',
      reason: 'Cross-site request blocked by Fetch Metadata policy.',
    };
  }

  // 2. Origin & Referer Header Verification
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';

  const trustedHost = host.split(':')[0].toLowerCase();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const trustedOrigins: string[] = [];
  if (configuredSiteUrl) {
    try {
      const parsed = new URL(configuredSiteUrl);
      trustedOrigins.push(parsed.origin.toLowerCase());
    } catch {
      // Ignore malformed URL config
    }
  }

  const isDevOrTest =
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.NOTICE_SYNC_TEST_MODE === 'true';

  if (isDevOrTest) {
    trustedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost');
  }

  const sourceUrl = origin || referer;
  if (!sourceUrl) {
    // If running in browser and sending cookies without Origin/Referer, block it
    return {
      valid: false,
      code: 'CSRF_ORIGIN_MISSING',
      reason: 'State-changing cookie request must supply an Origin or Referer header.',
    };
  }

  try {
    const parsedSource = new URL(sourceUrl);
    const sourceHostname = parsedSource.hostname.toLowerCase();
    const sourceOrigin = parsedSource.origin.toLowerCase();

    // Check against host header
    if (trustedHost && sourceHostname === trustedHost) {
      return { valid: true };
    }

    // Check against trusted origins list
    if (trustedOrigins.some((to) => to === sourceOrigin || to.includes(sourceHostname))) {
      return { valid: true };
    }

    // Allow localhost / 127.0.0.1 in development/testing
    if (isDevOrTest && (sourceHostname === 'localhost' || sourceHostname === '127.0.0.1')) {
      return { valid: true };
    }

    return {
      valid: false,
      code: 'CSRF_ORIGIN_MISMATCH',
      reason: `Untrusted request origin: ${sourceOrigin}`,
    };
  } catch {
    return {
      valid: false,
      code: 'CSRF_ORIGIN_MALFORMED',
      reason: 'Invalid Origin or Referer URL header.',
    };
  }
}

/**
 * Convenience helper that returns a 403 Response if CSRF validation fails, or null if valid.
 */
export function enforceCsrf(req: Request, authType: 'bearer' | 'cookie' | 'none'): Response | null {
  const result = validateCsrf(req, authType);
  if (!result.valid) {
    return new Response(
      JSON.stringify({
        error: result.reason || 'CSRF validation failed.',
        code: result.code || 'CSRF_VIOLATION',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  return null;
}

