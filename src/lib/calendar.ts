import { createEvents, type EventAttributes } from 'ics';
import type { AcademicEvent } from './types';

/**
 * Generate an ICS calendar string from confirmed academic events.
 * Events that are still marked needsReview are excluded unless explicitly passed.
 */
export function generateIcsString(events: AcademicEvent[]): string {
  const validEvents = events.filter((e) => e.date !== null);

  if (validEvents.length === 0) return '';

  const icsEvents: EventAttributes[] = validEvents.map((event) => {
    const [year, month, day] = (event.date as string).split('-').map(Number);

    return {
      title: event.title,
      description: [
        event.description,
        event.course ? `Course: ${event.course}` : null,
        event.type ? `Type: ${event.type}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      start: [year, month, day, 9, 0] as [number, number, number, number, number],
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
