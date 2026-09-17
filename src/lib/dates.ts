import {
  format,
  isToday,
  isTomorrow,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  parseISO,
  isAfter,
  isBefore,
} from 'date-fns';
import type { AcademicEvent } from './types';

/**
 * Format an event date for display.
 */
export function formatEventDate(dateStr: string | null): string {
  if (!dateStr) return "Date Pending";
  const d = parseISO(dateStr);
  return format(d, 'EEE, MMM d, yyyy');
}

/**
 * Get a relative date label.
 */
export function getRelativeLabel(dateStr: string | null): string | null {
  if (!dateStr) return "TBD";
  const d = parseISO(dateStr);
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
 * Sort events by importance (high -> medium -> low)
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
  const todayEvents = events.filter((e) => e.date === todayStr);
  return sortEventsByPriority(todayEvents);
}

/**
 * Get the next upcoming event after today.
 */
export function getNextUpcomingEvent(events: AcademicEvent[]): AcademicEvent | null {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const future = events
    .filter((e) => e.date && e.date > todayStr)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  return future[0] ?? null;
}

/**
 * Get all events with null dates or additional information pending.
 */
export function getPendingEvents(events: AcademicEvent[]): AcademicEvent[] {
  return sortEventsByPriority(events.filter(e => e.date === null || e.additionalInformationPending));
}

/**
 * Group events by date, sorted chronologically.
 */
export function groupEventsByDate(events: AcademicEvent[]): Map<string, AcademicEvent[]> {
  const validEvents = events.filter(e => e.date !== null);
  const sorted = [...validEvents].sort((a, b) => (a.date as string).localeCompare(b.date as string));
  
  const map = new Map<string, AcademicEvent[]>();
  for (const evt of sorted) {
    const existing = map.get(evt.date as string) || [];
    existing.push(evt);
    map.set(evt.date as string, existing);
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

  // Heavy week logic: more strict deadlines or overall count
  for (const bucket of buckets) {
    bucket.isHeavy = bucket.count >= 4 || bucket.strictCount >= 2;
  }

  return buckets.filter((b) => b.count > 0);
}
