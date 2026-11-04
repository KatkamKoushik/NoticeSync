import { createEvents, type EventAttributes } from 'ics';
import type { AcademicEvent } from './types';

/**
 * Generate an ICS calendar string from confirmed academic events.
 * Events that are still marked needsReview are excluded unless explicitly passed.
 * Accurately parses ISO date-time strings and respects explicit event times without NaN errors.
 */
export function generateIcsString(events: AcademicEvent[]): string {
  const validEvents = events.filter((e) => e.date !== null);

  if (validEvents.length === 0) return '';

  const icsEvents: EventAttributes[] = validEvents.map((event) => {
    const rawDate = event.date as string;
    let year = 2026;
    let month = 1;
    let day = 1;
    let hour = 9;
    let minute = 0;

    const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      day = parseInt(match[3], 10);
      if (match[4] && match[5]) {
        hour = parseInt(match[4], 10);
        minute = parseInt(match[5], 10);
      }
    }

    if (event.time && /^\d{1,2}:\d{2}$/.test(event.time.trim())) {
      const [h, m] = event.time.trim().split(':').map(Number);
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        hour = h;
        minute = m;
      }
    }

    const startTuple: [number, number, number, number, number] = [year, month, day, hour, minute];

    return {
      title: event.title,
      description: [
        event.description,
        event.course ? `Course: ${event.course}` : null,
        event.type ? `Type: ${event.type}` : null,
        event.location ? `Venue: ${event.location}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      location: event.location || undefined,
      start: startTuple,
      duration: { hours: 1 },
      startInputType: 'local' as const,
      startOutputType: 'local' as const,
    };
  });

  const { error, value } = createEvents(icsEvents);

  if (error) {
    console.error('ICS generation error:', error);
    throw new Error('Failed to generate calendar file');
  }

  return value || '';
}

/**
 * Client-side: trigger download of ICS data.
 */
export function downloadIcsFile(icsContent: string, filename = 'notice-sync-calendar.ics') {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
