import { isValid, parse, format } from 'date-fns';
import type {
  AcademicEvent,
  EventType,
  DeadlineChange,
  Importance,
  DatePrecision,
  EventStatus,
} from './types';
import { v4 as uuidv4 } from 'uuid';
import { RawExtractedEventSchema, RawExtractedEvent } from './validation/schemas';

export interface DateValidationResult {
  status: 'valid' | 'null_or_pending' | 'ambiguous' | 'impossible';
  date: string | null;
  time?: string | null;
  precision?: DatePrecision;
  reason?: string;
}

/**
 * Validates calendar dates deterministically against the Gregorian calendar.
 * Distinguishes valid ISO dates, impossible dates (e.g. Feb 31, leap year errors),
 * ambiguous text phrases (e.g. 'next Friday', DD-MM-YYYY), and null/pending dates.
 *
 * CRITICAL SCHEDULE INTEGRITY RULE:
 * Non-ISO formats (e.g., DD-MM-YYYY, MM/DD/YYYY) are treated as ambiguous and
 * routed to human review; we never guess or silently convert them to authoritative deadlines.
 */
export function validateCalendarDate(dateStr: string | null | undefined): DateValidationResult {
  if (dateStr === null || dateStr === undefined) {
    return {
      status: 'null_or_pending',
      date: null,
      precision: 'null_or_pending',
      reason: 'Date not provided in document',
    };
  }

  const trimmed = dateStr.trim();
  if (
    trimmed.length === 0 ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'tbd' ||
    trimmed.toLowerCase() === 'tba' ||
    trimmed.toLowerCase() === 'pending' ||
    trimmed.toLowerCase() === 'tentative'
  ) {
    return {
      status: 'null_or_pending',
      date: null,
      precision: 'null_or_pending',
      reason: 'Date is explicitly pending, tentative, or TBD',
    };
  }

  // 1. Check for Ambiguous numeric date formats (e.g. MM/DD/YYYY or DD-MM-YYYY)
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmed)) {
    return {
      status: 'ambiguous',
      date: null,
      precision: 'tentative_range',
      reason: `Ambiguous numeric date format (day vs month uncertain); requires human confirmation: "${trimmed}"`,
    };
  }

  // 2. Check ISO Date-Time: YYYY-MM-DDTHH:mm(:ss)?
  const dateTimeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (dateTimeMatch) {
    const baseDateResult = validateCalendarDate(dateTimeMatch[1]);
    if (baseDateResult.status === 'valid') {
      return {
        status: 'valid',
        date: baseDateResult.date,
        time: dateTimeMatch[2],
        precision: 'date_time',
      };
    }
    return baseDateResult;
  }

  // 3. Strict ISO YYYY-MM-DD pattern check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      status: 'ambiguous',
      date: null,
      precision: 'tentative_range',
      reason: `Ambiguous or non-ISO date format: "${trimmed}"`,
    };
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 2020 || year > 2035) {
    return {
      status: 'impossible',
      date: null,
      precision: 'null_or_pending',
      reason: `Impossible calendar date: year ${year} is outside plausible academic range`,
    };
  }

  if (month < 1 || month > 12) {
    return {
      status: 'impossible',
      date: null,
      precision: 'null_or_pending',
      reason: `Impossible calendar date: month ${month} does not exist in Gregorian calendar`,
    };
  }

  // Check days per month in Gregorian calendar including leap years
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day < 1 || day > daysInMonth[month]) {
    return {
      status: 'impossible',
      date: null,
      precision: 'null_or_pending',
      reason: `Impossible calendar date: "${trimmed}" does not exist in the calendar`,
    };
  }

  const parsed = parse(trimmed, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== trimmed) {
    return {
      status: 'impossible',
      date: null,
      precision: 'null_or_pending',
      reason: `Impossible calendar date: "${trimmed}" does not exist in the calendar`,
    };
  }

  return {
    status: 'valid',
    date: trimmed,
    precision: 'date_only',
  };
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
 *
 * CRITICAL INTEGRITY DIRECTIVE:
 * - Never converts uncertain, ambiguous, or unverified dates into authoritative deadlines.
 * - Always marks conflicting, revised, or low-confidence notices for human review.
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
  let finalTime: string | null = null;
  let precision: DatePrecision = 'date_only';
  let additionalInfoPending = data.additionalInformationPending;

  if (dateResult.status === 'valid') {
    finalDate = dateResult.date;
    finalTime = dateResult.time || null;
    precision = dateResult.precision || 'date_only';
  } else {
    finalDate = null;
    additionalInfoPending = true;
    precision = dateResult.precision || 'null_or_pending';
    reviewReasons.push(dateResult.reason || 'Date requires human confirmation');
  }

  // 2. Confidence evaluation (events with confidence < 75 require human review)
  if (data.confidence < 75) {
    reviewReasons.push(`Low AI confidence score (${data.confidence}%)`);
  }

  // 3. Deadline Change evaluation (rescheduled, postponed, cancelled require human review)
  const deadlineChange: DeadlineChange = data.deadlineChange;
  if (deadlineChange !== 'none' && deadlineChange !== 'unchanged') {
    reviewReasons.push(`Deadline modification detected (${deadlineChange})`);
  }

  // 4. Source Evidence Check (separate source text from model interpretation)
  const sourceText = data.sourceText.trim();
  if (sourceText.length === 0) {
    reviewReasons.push('No direct source excerpt evidence provided by model');
  }

  // 5. Importance and Strict Deadlines
  let importance: Importance = data.importance;
  if (data.strictDeadline) {
    importance = 'high';
  }

  const needsReview = reviewReasons.length > 0;
  const status: EventStatus = needsReview ? 'pending_review' : 'confirmed';

  const event: AcademicEvent = {
    id: uuidv4(),
    title: data.title.trim(),
    date: finalDate,
    time: finalTime,
    precision,
    timezone: 'UTC',
    isAllDay: !finalTime,
    isRecurring: false,
    recurrenceRule: null,
    hasConflict: false,
    conflictDetails: null,
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
    provenance: {
      documentId: docContext?.documentId || null,
      documentTitle: docContext?.documentTitle || null,
      pageNumber: docContext?.pageNumber ?? null,
      chunkIndex: docContext?.chunkIndex ?? null,
      rawSourceText: sourceText,
    },
    course: data.course ? data.course.trim() : null,
    location: data.location ? data.location.trim() : null,
    sourceType,
    documentId: docContext?.documentId || null,
    documentTitle: docContext?.documentTitle || null,
    chunkIndex: docContext?.chunkIndex ?? null,
    pageNumber: docContext?.pageNumber ?? null,
    status,
    needsReview,
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
