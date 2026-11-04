import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { isValidUuid, safeErrorResponse } from '@/lib/validation/security';
import { logError } from '@/lib/observability';

export const runtime = 'nodejs';

/**
 * POST /api/jobs
 * Creates a new processing job for the authenticated user.
 * Client-supplied user IDs are strictly ignored; scoped to session.user.id.
 * Uses verified userClient with RLS.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user from server-verified session (enforces CSRF for cookie sessions)
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    // 2. Rate limit (30 requests/minute per user)
    const rateLimitResponse = enforceRateLimit(`jobs:create:${userId}`, 30);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Optional payload parsing (safely ignore any client-supplied userId)
    const body = await req.json().catch(() => ({}));
    let documentId: string | null = null;
    if (body && typeof body.documentId === 'string' && isValidUuid(body.documentId)) {
      documentId = body.documentId;
    }

    // Extract idempotency key from header or body
    const rawIdempotencyKey =
      req.headers.get('idempotency-key') ||
      req.headers.get('Idempotency-Key') ||
      (body && typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null);
    const idempotencyKey =
      rawIdempotencyKey && rawIdempotencyKey.trim().length > 0
        ? rawIdempotencyKey.trim().substring(0, 128)
        : null;

    // Check if an existing job matches the idempotency key for this user
    if (idempotencyKey) {
      const { data: existingJob } = await db
        .from('processing_jobs')
        .select('id, status, progress, current_step')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', userId)
        .single();

      if (existingJob) {
        return NextResponse.json({
          jobId: existingJob.id,
          status: existingJob.status,
          replayed: true,
        });
      }
    }

    // 4. Create the job strictly bound to session.user.id
    const { data, error } = await db
      .from('processing_jobs')
      .insert({
        user_id: userId,
        document_id: documentId,
        idempotency_key: idempotencyKey,
        status: 'pending',
        current_step: 'Initializing...',
        progress: 0,
      })
      .select('id')
      .single();

    if (error) {
      logError(new Error(error.message), { route: '/api/jobs', userId });
      return safeErrorResponse(error, 500, 'Failed to initialize processing job.');
    }

    return NextResponse.json({ jobId: data.id });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: '/api/jobs' });
    return safeErrorResponse(error, 500);
  }
}

/**
 * GET /api/jobs?jobId=...
 * Retrieves the status of a processing job with strict user ownership verification.
 * User A cannot view User B's job. Uses verified userClient with RLS.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    // 2. Validate jobId query parameter
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId || !isValidUuid(jobId)) {
      return NextResponse.json({ error: 'Valid jobId parameter is required.' }, { status: 400 });
    }

    // Rate limit polling (60 requests/minute per user)
    const rateLimitResponse = enforceRateLimit(`jobs:get:${userId}`, 60);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Query job strictly filtered by user_id
    const { data: job, error } = await db
      .from('processing_jobs')
      .select('id, status, progress, current_step, error_message, updated_at')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found or access denied.' }, { status: 404 });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        currentStep: job.current_step,
        errorMessage: job.error_message,
        updatedAt: job.updated_at,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'GET /api/jobs' });
    return safeErrorResponse(error, 500);
  }
}
