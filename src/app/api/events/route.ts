import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { isValidUuid, safeErrorResponse, sanitizeString } from '@/lib/validation/security';
import { validateCalendarDate } from '@/lib/validation';
import { logError } from '@/lib/observability';
import type { AcademicEvent, EventType, Importance, DeadlineChange, EventStatus } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/events
 * Retrieves confirmed and pending academic events for the authenticated student.
 * Strictly scoped to the authenticated session's user ID via userClient with RLS.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user from session
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    // 2. Enforce Rate Limit (60 requests/minute per user)
    const rateLimitResponse = enforceRateLimit(`events:get:${userId}`, 60);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Query user-scoped events from database
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
      const status: EventStatus = (row.status as EventStatus) || 'pending_review';

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
        provenance: {
          documentId: (row.document_id as string) || null,
          pageNumber: typeof row.page_number === 'number' ? row.page_number : null,
          chunkIndex: typeof row.chunk_index === 'number' ? row.chunk_index : null,
          rawSourceText: String(row.source_excerpt || ''),
        },
        course: (row.course as string) || null,
        location: (row.location as string) || null,
        pageNumber: typeof row.page_number === 'number' ? row.page_number : null,
        chunkIndex: typeof row.chunk_index === 'number' ? row.chunk_index : null,
        documentId: (row.document_id as string) || null,
        sourceType: 'text',
        status,
        needsReview: status === 'pending_review',
        hasConflict: Boolean(row.has_conflict),
        conflictDetails: (row.conflict_details as string) || null,
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

/**
 * PATCH /api/events
 * Human Review & Confirmation: Updates, edits, or confirms existing academic events.
 * Supports single event ({ id / eventId, ... }) or batch confirmation ({ events: [...] }).
 * Strictly verifies and scopes mutation to the authenticated session user.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    const rateLimitResponse = enforceRateLimit(`events:mutate:${userId}`, 30);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Valid JSON payload is required.' }, { status: 400 });
    }

    // Support batch update when events array is supplied
    if (Array.isArray(body.events)) {
      let updatedCount = 0;
      for (const item of body.events) {
        if (!item || typeof item !== 'object') continue;
        const targetId = item.id || item.eventId;
        if (!targetId || !isValidUuid(targetId)) continue;

        const itemUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (item.status && ['pending_review', 'confirmed', 'removed'].includes(item.status)) {
          itemUpdates.status = item.status;
        }
        if (item.confirm === true) {
          itemUpdates.status = 'confirmed';
        }
        if (item.title && typeof item.title === 'string') {
          itemUpdates.title = sanitizeString(item.title, 200);
        }
        if (item.location !== undefined) {
          itemUpdates.location = typeof item.location === 'string' ? sanitizeString(item.location, 100) : null;
        }
        if (item.description !== undefined) {
          itemUpdates.description = typeof item.description === 'string' ? sanitizeString(item.description, 1000) : '';
        }
        if (item.type && ['Exam', 'Assignment', 'Notice', 'Task'].includes(item.type)) {
          itemUpdates.type = item.type;
        }
        if (item.date !== undefined) {
          if (item.date === null || item.date === '') {
            itemUpdates.date = null;
            itemUpdates.information_pending = true;
          } else {
            const dateVal = validateCalendarDate(item.date);
            if (dateVal.status === 'valid') {
              itemUpdates.date = dateVal.date;
              itemUpdates.information_pending = false;
            }
          }
        }

        const { error: batchErr } = await db
          .from('academic_events')
          .update(itemUpdates)
          .eq('id', targetId)
          .eq('user_id', userId);

        if (!batchErr) {
          updatedCount++;
        }
      }

      return NextResponse.json({ success: true, updatedCount, message: `${updatedCount} events updated.` });
    }

    // Single event update path
    const eventId = body.id || body.eventId;
    if (!eventId || !isValidUuid(eventId)) {
      return NextResponse.json({ error: 'Valid event UUID is required.' }, { status: 400 });
    }

    // Check ownership before updating
    const { data: existing, error: findError } = await db
      .from('academic_events')
      .select('id, user_id, status')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title && typeof body.title === 'string') {
      updates.title = sanitizeString(body.title, 200);
    }

    if (body.date !== undefined) {
      if (body.date === null || body.date === '') {
        updates.date = null;
        updates.information_pending = true;
      } else {
        const dateVal = validateCalendarDate(body.date);
        if (dateVal.status !== 'valid') {
          return NextResponse.json(
            { error: dateVal.reason || 'Invalid calendar date provided.' },
            { status: 400 }
          );
        }
        updates.date = dateVal.date;
        updates.information_pending = false;
      }
    }

    if (body.status && ['pending_review', 'confirmed', 'removed'].includes(body.status)) {
      updates.status = body.status;
    }

    if (body.confirm === true) {
      updates.status = 'confirmed';
    }

    if (body.location !== undefined) {
      updates.location = typeof body.location === 'string' ? sanitizeString(body.location, 100) : null;
    }

    if (body.description !== undefined) {
      updates.description = typeof body.description === 'string' ? sanitizeString(body.description, 1000) : '';
    }

    if (body.type && ['Exam', 'Assignment', 'Notice', 'Task'].includes(body.type)) {
      updates.type = body.type;
    }

    if (typeof body.strictDeadline === 'boolean') {
      updates.strict_deadline = body.strictDeadline;
    }

    const { error: updateError } = await db
      .from('academic_events')
      .update(updates)
      .eq('id', eventId)
      .eq('user_id', userId);

    if (updateError) {
      logError(new Error(updateError.message), { route: 'PATCH /api/events', userId, eventId });
      return safeErrorResponse(updateError, 500, 'Failed to update academic event.');
    }

    return NextResponse.json({ success: true, message: 'Event successfully updated.' });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'PATCH /api/events' });
    return safeErrorResponse(error, 500);
  }
}

/**
 * DELETE /api/events?id=...
 * Removes an event owned by the authenticated student.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    const rateLimitResponse = enforceRateLimit(`events:mutate:${userId}`, 30);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('id');

    if (!eventId || !isValidUuid(eventId)) {
      return NextResponse.json({ error: 'Valid event ID is required.' }, { status: 400 });
    }

    const { error } = await db
      .from('academic_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', userId);

    if (error) {
      logError(new Error(error.message), { route: 'DELETE /api/events', userId, eventId });
      return safeErrorResponse(error, 500, 'Failed to delete academic event.');
    }

    return NextResponse.json({ success: true, message: 'Event removed from academic schedule.' });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'DELETE /api/events' });
    return safeErrorResponse(error, 500);
  }
}

/**
 * POST /api/events
 * Creates new academic event(s) for the authenticated user.
 * Supports single event ({ title, date, ... }) or batch creation ({ events: [...] }).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;
    const db = session.userClient;

    const rateLimitResponse = enforceRateLimit(`events:mutate:${userId}`, 30);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Valid JSON payload is required.' }, { status: 400 });
    }

    // Support batch event insertion
    if (Array.isArray(body.events)) {
      const recordsToInsert = [];
      for (const item of body.events) {
        if (!item || typeof item.title !== 'string' || item.title.trim().length === 0) continue;

        let eventDate: string | null = null;
        let infoPending = false;
        if (item.date) {
          const dateVal = validateCalendarDate(item.date);
          if (dateVal.status === 'valid') {
            eventDate = dateVal.date;
          } else {
            infoPending = true;
          }
        } else {
          infoPending = true;
        }

        recordsToInsert.push({
          id: item.id && isValidUuid(item.id) ? item.id : undefined,
          user_id: userId,
          title: sanitizeString(item.title, 200),
          date: eventDate,
          type: ['Exam', 'Assignment', 'Notice', 'Task'].includes(item.type) ? item.type : 'Notice',
          description: typeof item.description === 'string' ? sanitizeString(item.description, 1000) : '',
          priority: item.priority || 'Medium',
          strict_deadline: Boolean(item.strictDeadline),
          information_pending: infoPending,
          status: item.status && ['pending_review', 'confirmed'].includes(item.status) ? item.status : 'confirmed',
          source_excerpt: typeof item.sourceExcerpt === 'string' ? sanitizeString(item.sourceExcerpt, 500) : 'User Created',
          location: typeof item.location === 'string' ? sanitizeString(item.location, 100) : null,
        });
      }

      if (recordsToInsert.length === 0) {
        return NextResponse.json({ error: 'No valid events provided in batch payload.' }, { status: 400 });
      }

      const { data, error } = await db
        .from('academic_events')
        .insert(recordsToInsert)
        .select('id');

      if (error) {
        logError(new Error(error.message), { route: 'POST /api/events (batch)', userId });
        return safeErrorResponse(error, 500, 'Failed to create academic events.');
      }

      return NextResponse.json({ success: true, count: data?.length || recordsToInsert.length }, { status: 201 });
    }

    // Single event insertion
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ error: 'Event title is required.' }, { status: 400 });
    }

    let eventDate: string | null = null;
    let infoPending = false;
    if (body.date) {
      const dateVal = validateCalendarDate(body.date);
      if (dateVal.status !== 'valid') {
        return NextResponse.json({ error: dateVal.reason || 'Invalid date' }, { status: 400 });
      }
      eventDate = dateVal.date;
    } else {
      infoPending = true;
    }

    const { data, error } = await db
      .from('academic_events')
      .insert({
        id: body.id && isValidUuid(body.id) ? body.id : undefined,
        user_id: userId,
        title: sanitizeString(body.title, 200),
        date: eventDate,
        type: ['Exam', 'Assignment', 'Notice', 'Task'].includes(body.type) ? body.type : 'Notice',
        description: typeof body.description === 'string' ? sanitizeString(body.description, 1000) : '',
        priority: body.priority || 'Medium',
        strict_deadline: Boolean(body.strictDeadline),
        information_pending: infoPending,
        status: 'confirmed',
        source_excerpt: 'User Created',
        location: typeof body.location === 'string' ? sanitizeString(body.location, 100) : null,
      })
      .select('id')
      .single();

    if (error) {
      logError(new Error(error.message), { route: 'POST /api/events', userId });
      return safeErrorResponse(error, 500, 'Failed to create academic event.');
    }

    return NextResponse.json({ id: data.id, success: true }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError(error, { route: 'POST /api/events' });
    return safeErrorResponse(error, 500);
  }
}
