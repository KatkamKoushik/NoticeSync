import { isValid, parse } from 'date-fns';
import type { AcademicEvent, EventType, DeadlineChange, Importance } from './types';
import { v4 as uuidv4 } from 'uuid';

const VALID_TYPES: EventType[] = ["Exam", "Assignment", "Notice"];
const VALID_CHANGES: DeadlineChange[] = ["none", "extended", "postponed", "rescheduled", "moved_earlier", "cancelled", "unknown"];
const VALID_IMPORTANCE: Importance[] = ["low", "medium", "high"];

/**
 * Validates a YYYY-MM-DD date string.
 */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  if (dateStr === null) return true; // null is valid for ambiguous dates
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
  return isValid(parsed);
}

/**
 * Validates a single raw event object from AI output.
 * Returns a cleaned AcademicEvent or null if fundamentally invalid.
 */
export function validateEvent(
  raw: Record<string, unknown>,
  sourceType: "pdf" | "image" | "text"
): AcademicEvent | null {
  // title
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) return null;

  // date (can be null)
  let date: string | null = null;
  if (typeof raw.date === 'string' && isValidDateString(raw.date)) {
    date = raw.date;
  }

  // type
  let eventType: EventType = "Notice";
  if (typeof raw.type === 'string' && VALID_TYPES.includes(raw.type as EventType)) {
    eventType = raw.type as EventType;
  }

  // confidence
  let confidence = 50;
  if (typeof raw.confidence === 'number' && raw.confidence >= 1 && raw.confidence <= 100) {
    confidence = Math.round(raw.confidence);
  }

  // importance
  let importance: Importance = "medium";
  if (typeof raw.importance === 'string' && VALID_IMPORTANCE.includes(raw.importance as Importance)) {
    importance = raw.importance as Importance;
  }

  // deadlineChange
  let deadlineChange: DeadlineChange = "none";
  if (typeof raw.deadlineChange === 'string' && VALID_CHANGES.includes(raw.deadlineChange as DeadlineChange)) {
    deadlineChange = raw.deadlineChange as DeadlineChange;
  }

  const event: AcademicEvent = {
    id: uuidv4(),
    title: raw.title.trim(),
    date,
    type: eventType,
    description: typeof raw.description === 'string' ? raw.description.trim() : "",
    confidence,
    importance,
    actionRequired: Boolean(raw.actionRequired),
    strictDeadline: Boolean(raw.strictDeadline),
    deadlineChange,
    additionalInformationPending: Boolean(raw.additionalInformationPending),
    sourceText: typeof raw.sourceText === 'string' ? raw.sourceText.trim() : "",
    course: typeof raw.course === 'string' ? raw.course.trim() : null,
    sourceType,
    // if date is null, review is required regardless of confidence
    needsReview: confidence < 70 || date === null,
  };

  return event;
}

/**
 * Validates an array of raw AI-generated events.
 */
export function validateEvents(
  rawEvents: unknown[],
  sourceType: "pdf" | "image" | "text"
): AcademicEvent[] {
  const results: AcademicEvent[] = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const raw = rawEvents[i];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const validated = validateEvent(raw as Record<string, unknown>, sourceType);
    if (validated) {
      results.push(validated);
    }
  }
  return results;
}
