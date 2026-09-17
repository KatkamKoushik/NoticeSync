import { NextRequest, NextResponse } from 'next/server';
import { generateAcademicBrief } from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { events } = await req.json();

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ brief: "No events to summarize." });
    }

    const eventsJson = JSON.stringify(events, ['title', 'date', 'type', 'importance', 'strictDeadline', 'deadlineChange', 'additionalInformationPending', 'course'], 2);

    const brief = await generateAcademicBrief(eventsJson);

    return NextResponse.json({ brief });
  } catch (err) {
    console.error('Unexpected error in /api/brief:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while generating the brief.' },
      { status: 500 }
    );
  }
}
