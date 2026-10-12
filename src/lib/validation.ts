import { isValid, parse, format } from 'date-fns';
import type { AcademicEvent, EventType, DeadlineChange, Importance } from './types';
import { v4 as uuidv4 } from 'uuid';
import { RawExtractedEventSchema, RawExtractedEvent } from './validation/schemas';

export interface DateValidationResult {
  status: 'valid' | 'null_or_pending' | 'ambiguous' | 'impossible';
  date: string | null;
  reason?: string;
}

/**
 * Validates calendar dates deterministically against the Gregorian calendar.
 * Distinguishes valid ISO dates, impossible dates (e.g. Feb 31, leap year errors),
 * ambiguous text phrases (e.g. 'next Friday'), and null/pending dates.
 */
export function validateCalendarDate(dateStr: string | null | undefined): DateValidationResult {
  if (dateStr === null || dateStr === undefined) {
    return { status: 'null_or_pending', date: null, reason: 'Date not provided' };
  }

  const trimmed = dateStr.trim();
  if (
    trimmed.length === 0 ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'tbd' ||
    trimmed.toLowerCase() === 'tba' ||
    trimmed.toLowerCase() === 'pending'
  ) {
    return { status: 'null_or_pending', date: null, reason: 'Date is explicitly pending or TBD' };
  }

  // Check strict YYYY-MM-DD pattern
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      status: 'ambiguous',
      date: null,
      reason: `Ambiguous or non-ISO date format: "${trimmed}"`,
    };
  }

  const [yearStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  if (year < 2020 || year > 2035) {
    return {
      status: 'impossible',
      date: null,
      reason: `Calendar year ${year} is outside plausible academic range`,
    };
  }

  const parsed = parse(trimmed, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== trimmed) {
    return {
      status: 'impossible',
      date: null,
      reason: `Impossible calendar date: "${trimmed}" does not exist in the calendar`,
    };
  }

  return { status: 'valid', date: trimmed };
}

/**
 * Backward-compatible helper checking whether a date string is valid or null.
 */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  const result = validateCalendarDate(dateStr);
  return result.status === 'valid' || result.status === 'null_or_pending';
}

export interface DocumentContext {
  documentId?: string;
  documentTitle?: string;
  chunkIndex?: number;
  pageNumber?: number;
}

/**
 * Validates a single raw event from AI output using strict schema validation
 * and deterministic business logic.
 */
export function validateEvent(
  raw: unknown,
  sourceType: 'pdf' | 'image' | 'text',
  docContext?: DocumentContext
): AcademicEvent | null {
  const parseResult = RawExtractedEventSchema.safeParse(raw);
  if (!parseResult.success) {
    return null;
  }

  const data: RawExtractedEvent = parseResult.data;
  const reviewReasons: string[] = [];

  // 1. Calendar Date Validation
  const dateResult = validateCalendarDate(data.date);
  let finalDate: string | null = null;
  let additionalInfoPending = data.additionalInformationPending;

  if (dateResult.status === 'valid') {
    finalDate = dateResult.date;
  } else {
    finalDate = null;
    additionalInfoPending = true;
    reviewReasons.push(dateResult.reason || 'Date requires manual confirmation');
  }

  // 2. Confidence evaluation (events with confidence < 75 require review)
  if (data.confidence < 75) {
    reviewReasons.push(`Low confidence score (${data.confidence}%)`);
  }

  // 3. Deadline Change evaluation
  const deadlineChange: DeadlineChange = data.deadlineChange;
  if (deadlineChange !== 'none' && deadlineChange !== 'unchanged') {
    reviewReasons.push(`Deadline modification detected (${deadlineChange})`);
  }

  // 4. Source Evidence Check
  const sourceText = data.sourceText.trim();
  if (sourceText.length === 0) {
    reviewReasons.push('No direct source excerpt evidence provided by model');
  }

  // 5. Importance and Strict Deadlines
  let importance: Importance = data.importance;
  if (data.strictDeadline) {
    importance = 'high';
  }

  const event: AcademicEvent = {
    id: uuidv4(),
    title: data.title.trim(),
    date: finalDate,
    type: data.type as EventType,
    description: data.description.trim(),
    confidence: data.confidence,
    importance,
    priority: importance === 'high' ? 'High' : importance === 'medium' ? 'Medium' : 'Low',
    actionRequired: Boolean(data.actionRequired),
    strictDeadline: Boolean(data.strictDeadline),
    deadlineChange,
    deadlineChangeEvidence: data.deadlineChangeEvidence || null,
    additionalInformationPending: additionalInfoPending,
    sourceText,
    sourceExcerpt: sourceText,
    course: data.course ? data.course.trim() : null,
    location: data.location ? data.location.trim() : null,
    sourceType,
    documentId: docContext?.documentId || null,
    documentTitle: docContext?.documentTitle || null,
    chunkIndex: docContext?.chunkIndex ?? null,
    pageNumber: docContext?.pageNumber ?? null,
    needsReview: reviewReasons.length > 0,
    reviewReason: reviewReasons.length > 0 ? reviewReasons.join('; ') : null,
  };

  return event;
}

/**
 * Validates an array of raw AI-generated events.
 */
export function validateEvents(
  rawEvents: unknown[],
  sourceType: 'pdf' | 'image' | 'text',
  docContext?: DocumentContext
): AcademicEvent[] {
  if (!Array.isArray(rawEvents)) return [];

  const results: AcademicEvent[] = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const validated = validateEvent(rawEvents[i], sourceType, docContext);
    if (validated) {
      results.push(validated);
    }
  }

  return results;
}
