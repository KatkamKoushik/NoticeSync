import {
  format,
  isToday,
  isTomorrow,
  differenceInDays,
  endOfWeek,
  eachWeekOfInterval,
  parseISO,
  isAfter,
  isBefore,
} from 'date-fns';
import type { AcademicEvent, DatePrecision } from './types';

/**
 * Validates whether a given timezone string is a recognized IANA timezone identifier.
 */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to extract YYYY-MM-DD from an event date string (which may be date-only or date-time).
 */
export function normalizeDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

/**
 * Format an event date for display with optional timezone and precision awareness.
 */
export function formatEventDate(
  dateStr: string | null,
  timezone: string = 'UTC',
  precision: DatePrecision = 'date_only'
): string {
  if (!dateStr) return 'Date Pending (Needs Review)';
  try {
    const d = parseISO(dateStr);
    if (precision === 'date_time') {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: effectiveTz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return formatter.format(d).replace(/,([^,]*)$/, '$1');
    }
    return format(d, 'EEE, MMM d, yyyy');
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Computes DST offset and status for a given ISO date string and IANA timezone.
 */
export function getTimezoneOffsetDetails(dateStr: string, timeZone: string = 'UTC'): {
  timeZone: string;
  formattedLocal: string;
  offsetMinutes: number;
} {
  const d = parseISO(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00Z`);
  const effectiveTz = isValidTimezone(timeZone) ? timeZone : 'UTC';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const formattedLocal = formatter.format(d);

  // Compute timezone offset relative to UTC
  const utcDate = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(d.toLocaleString('en-US', { timeZone: effectiveTz }));
  const offsetMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);

  return {
    timeZone: effectiveTz,
    formattedLocal,
    offsetMinutes,
  };
}

/**
 * Get a relative date label.
 */
export function getRelativeLabel(dateStr: string | null): string | null {
  if (!dateStr) return 'TBD';
  const normalized = normalizeDateString(dateStr);
  const d = parseISO(normalized || dateStr);
  const today = new Date();

  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';

  const diff = differenceInDays(d, today);
  if (diff > 0 && diff <= 7) return `In ${diff} days`;
  if (diff > 7 && diff <= 14) return 'Next week';
  if (diff < 0 && diff >= -1) return 'Yesterday';
  if (diff < -1) return `${Math.abs(diff)} days ago`;

  return null;
}

/**
 * Sort events by importance (high -> medium -> low) and priority
 */
export function sortEventsByPriority(events: AcademicEvent[]): AcademicEvent[] {
  const importanceValue = { high: 3, medium: 2, low: 1 };

  return [...events].sort((a, b) => {
    // 1. Strict deadlines first
    if (a.strictDeadline !== b.strictDeadline) {
      return a.strictDeadline ? -1 : 1;
    }
    // 2. High importance
    const diff = importanceValue[b.importance] - importanceValue[a.importance];
    if (diff !== 0) return diff;
    // 3. Needs action
    if (a.actionRequired !== b.actionRequired) {
      return a.actionRequired ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Get events happening today, sorted by priority.
 */
export function getTodayEvents(events: AcademicEvent[]): AcademicEvent[] {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayEvents = events.filter((e) => normalizeDateString(e.date) === todayStr);
  return sortEventsByPriority(todayEvents);
}

/**
 * Get the next upcoming event after today.
 */
export function getNextUpcomingEvent(events: AcademicEvent[]): AcademicEvent | null {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const future = events
    .filter((e) => {
      const normalized = normalizeDateString(e.date);
      return normalized !== null && normalized > todayStr;
    })
    .sort((a, b) => (normalizeDateString(a.date) || '').localeCompare(normalizeDateString(b.date) || ''));
  return future[0] ?? null;
}

/**
 * Get all events with null dates or additional information pending.
 */
export function getPendingEvents(events: AcademicEvent[]): AcademicEvent[] {
  return sortEventsByPriority(events.filter(e => e.date === null || e.additionalInformationPending || e.needsReview));
}

/**
 * Group events by date, sorted chronologically.
 */
export function groupEventsByDate(events: AcademicEvent[]): Map<string, AcademicEvent[]> {
  const validEvents = events.filter(e => e.date !== null && normalizeDateString(e.date) !== null);
  const sorted = [...validEvents].sort((a, b) => (a.date as string).localeCompare(b.date as string));

  const map = new Map<string, AcademicEvent[]>();
  for (const evt of sorted) {
    const key = normalizeDateString(evt.date)!;
    const existing = map.get(key) || [];
    existing.push(evt);
    map.set(key, existing);
  }
  return map;
}

export interface WeekBucket {
  weekStart: string; // YYYY-MM-DD
  weekLabel: string;
  count: number;
  strictCount: number;
  highImportanceCount: number;
  events: AcademicEvent[];
  isHeavy: boolean;
}

/**
 * Bucket events into weeks for workload view.
 */
export function getWeeklyWorkload(events: AcademicEvent[]): WeekBucket[] {
  const validEvents = events.filter(e => e.date !== null);
  if (validEvents.length === 0) return [];

  const sorted = [...validEvents].sort((a, b) => (a.date as string).localeCompare(b.date as string));
  const first = parseISO(sorted[0].date as string);
  const last = parseISO(sorted[sorted.length - 1].date as string);

  const weeks = eachWeekOfInterval({ start: first, end: last }, { weekStartsOn: 1 });

  const buckets: WeekBucket[] = weeks.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekEvents = sorted.filter((e) => {
      const d = parseISO(e.date as string);
      return !isBefore(d, weekStart) && !isAfter(d, weekEnd);
    });

    const strictCount = weekEvents.filter(e => e.strictDeadline).length;
    const highImportanceCount = weekEvents.filter(e => e.importance === 'high').length;

    return {
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekLabel: format(weekStart, 'MMM d'),
      count: weekEvents.length,
      strictCount,
      highImportanceCount,
      events: weekEvents,
      isHeavy: false,
    };
  });

  for (const bucket of buckets) {
    bucket.isHeavy = bucket.count >= 4 || bucket.strictCount >= 2;
  }

  return buckets.filter((b) => b.count > 0);
}
