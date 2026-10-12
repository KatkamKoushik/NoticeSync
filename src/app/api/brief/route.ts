import { NextRequest, NextResponse } from 'next/server';
import { generateAcademicBrief } from '@/lib/ai';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { safeErrorResponse } from '@/lib/validation/security';
import { logError } from '@/lib/observability';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user from session
    const session = await getAuthenticatedUser(req);
    const userId = session.user.id;

    // 2. Enforce Rate Limit (20 brief generations per minute per user)
    const rateLimitResponse = enforceRateLimit(`brief:${userId}`, 20);
    if (rateLimitResponse) return rateLimitResponse;

    // 3. Validate request payload
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.events)) {
      return NextResponse.json({ error: 'Valid events array is required.' }, { status: 400 });
    }

    const { events } = body;
    if (events.length === 0) {
      return NextResponse.json({ brief: 'No events to summarize.' });
    }

    if (events.length > 100) {
      return NextResponse.json({ error: 'Too many events. Maximum 100 allowed.' }, { status: 400 });
    }

    // Sanitize event properties to include only expected fields
    const sanitizedEvents = events.map((e: unknown) => {
      const item = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
      return {
        title: typeof item.title === 'string' ? item.title.substring(0, 200) : 'Untitled',
        date: typeof item.date === 'string' ? item.date : null,
        type: typeof item.type === 'string' ? item.type : 'Notice',
        importance: typeof item.importance === 'string' ? item.importance : 'medium',
        strictDeadline: Boolean(item.strictDeadline),
        deadlineChange: typeof item.deadlineChange === 'string' ? item.deadlineChange : 'none',
        additionalInformationPending: Boolean(item.additionalInformationPending),
        course: typeof item.course === 'string' ? item.course.substring(0, 100) : null,
      };
    });

    const eventsJson = JSON.stringify(sanitizedEvents, null, 2);
    const brief = await generateAcademicBrief(eventsJson);

    return NextResponse.json({ brief });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logError(err, { route: '/api/brief' });
    return safeErrorResponse(err, 500, 'An unexpected error occurred while generating the brief.');
  }
}
