import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { isValidUuid, safeErrorResponse } from '@/lib/validation/security';
import { logError } from '@/lib/observability';

export const runtime = 'nodejs';

/**
 * GET /api/memory
 * Retrieves documents stored in academic memory for the authenticated user.
 * Strictly scoped to session user via userClient with RLS.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    const rateLimitResponse = enforceRateLimit(`memory:get:${userId}`, 60);
    if (rateLimitResponse) return rateLimitResponse;

    const { data: documents, error } = await db
      .from('documents')
      .select('id, title, source_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logError(new Error(error.message), { route: 'GET /api/memory', userId });
      return safeErrorResponse(error, 500, 'Failed to fetch academic memory.');
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'GET /api/memory' });
    return safeErrorResponse(error, 500);
  }
}

/**
 * DELETE /api/memory?id=...
 * Deletes a document owned by the authenticated user.
 * Strictly scoped to session user via userClient with RLS.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    const rateLimitResponse = enforceRateLimit(`memory:delete:${userId}`, 30);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('id');

    if (!docId || !isValidUuid(docId)) {
      return NextResponse.json({ error: 'Valid document ID is required.' }, { status: 400 });
    }

    const { error } = await db
      .from('documents')
      .delete()
      .eq('id', docId)
      .eq('user_id', userId);

    if (error) {
      logError(new Error(error.message), { route: 'DELETE /api/memory', userId, docId });
      return safeErrorResponse(error, 500, 'Failed to delete document.');
    }

    return NextResponse.json({ success: true, message: 'Document deleted from academic memory.' });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'DELETE /api/memory' });
    return safeErrorResponse(error, 500);
  }
}
