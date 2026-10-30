import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { safeErrorResponse } from '@/lib/validation/security';
import { logError } from '@/lib/observability';
import type { AcademicEvent, EventType, Importance, DeadlineChange } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/events
 * Retrieves confirmed and pending academic events for the authenticated student.
 * Strictly scoped to the authenticated session's user ID.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;

    // 2. Enforce Rate Limit (60 requests/minute per user)
    const rateLimitResponse = enforceRateLimit(`events:get:${userId}`, 60);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Query user-scoped events from database
    const db = session.userClient || (await import('@/lib/supabase/server')).supabaseServer;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
    const statusFilter = searchParams.get('status');

    let query = db
      .from('academic_events')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'removed')
      .order('date', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (statusFilter && ['pending_review', 'confirmed'].includes(statusFilter)) {
      query = query.eq('status', statusFilter);
    }

    const { data: records, error } = await query;

    if (error) {
      logError(new Error(error.message), { route: 'GET /api/events', userId });
      return safeErrorResponse(error, 500, 'Failed to fetch academic events.');
    }

    // 4. Map DB records to AcademicEvent domain shape
    const events: AcademicEvent[] = (records || []).map((row: Record<string, unknown>) => {
      const priorityStr = (row.priority as string) || 'Medium';
      const importance: Importance =
        priorityStr.toLowerCase() === 'critical' || priorityStr.toLowerCase() === 'high'
          ? 'high'
          : priorityStr.toLowerCase() === 'low'
            ? 'low'
            : 'medium';

      const isDeadlineChange = Boolean(row.deadline_change);
      const deadlineChange: DeadlineChange = isDeadlineChange ? 'rescheduled' : 'none';

      return {
        id: String(row.id),
        title: String(row.title || 'Untitled Event'),
        date: (row.date as string) || null,
        type: ((row.type as string) || 'Notice') as EventType,
        description: String(row.description || ''),
        confidence: typeof row.confidence === 'number' ? row.confidence : 80,
        importance,
        priority: priorityStr,
        actionRequired: Boolean(row.strict_deadline || row.information_pending),
        strictDeadline: Boolean(row.strict_deadline),
        deadlineChange,
        deadlineChangeEvidence: null,
        additionalInformationPending: Boolean(row.information_pending),
        sourceText: String(row.source_excerpt || ''),
        sourceExcerpt: (row.source_excerpt as string) || undefined,
        course: (row.course as string) || null,
        location: (row.location as string) || null,
        pageNumber: typeof row.page_number === 'number' ? row.page_number : null,
        chunkIndex: typeof row.chunk_index === 'number' ? row.chunk_index : null,
        documentId: (row.document_id as string) || null,
        sourceType: 'text',
        needsReview: row.status === 'pending_review',
        dedupHash: (row.dedup_hash as string) || undefined,
      };
    });

    return NextResponse.json({ events });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'GET /api/events' });
    return safeErrorResponse(error, 500);
  }
}
