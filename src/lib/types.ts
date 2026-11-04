export type EventType = "Exam" | "Assignment" | "Notice" | "Task";

export type DeadlineChange =
  | "none"
  | "unchanged"
  | "extended"
  | "postponed"
  | "rescheduled"
  | "moved_earlier"
  | "cancelled"
  | "unknown";

export type Importance = "low" | "medium" | "high";

export type DatePrecision =
  | "date_only"
  | "date_time"
  | "tentative_range"
  | "null_or_pending";

export type EventStatus = "pending_review" | "confirmed" | "removed";

export interface EventProvenance {
  documentId?: string | null;
  documentTitle?: string | null;
  pageNumber?: number | null;
  chunkIndex?: number | null;
  rawSourceText: string;
}

export interface AcademicEvent {
  id: string;
  title: string;
  date: string | null; // ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss or null
  time?: string | null; // HH:mm if specified
  precision?: DatePrecision;
  timezone?: string; // Default: 'UTC' or user's local timezone
  isAllDay?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string | null; // e.g. 'weekly', 'biweekly'
  hasConflict?: boolean;
  conflictDetails?: string | null;
  type: EventType;
  description: string;
  confidence: number; // 1-100
  importance: Importance;
  priority?: string;
  actionRequired: boolean;
  strictDeadline: boolean;
  deadlineChange: DeadlineChange;
  deadlineChangeEvidence?: string | null;
  additionalInformationPending: boolean;
  sourceText: string;
  sourceExcerpt?: string;
  provenance?: EventProvenance;
  pageNumber?: number | null;
  chunkIndex?: number | null;
  documentId?: string | null;
  documentTitle?: string | null;
  course?: string | null;
  location?: string | null;
  sourceType: "pdf" | "image" | "text";
  status?: EventStatus;
  needsReview: boolean;
  reviewReason?: string | null;
  dedupHash?: string;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "partial_success";

export type InputMode = "pdf" | "image" | "text";

export type ProcessingStage =
  | "IDLE"
  | "FILE_SELECTED"
  | "EXTRACTING"
  | "AI_PROCESSING"
  | "VALIDATING"
  | "REVIEW"
  | "SUCCESS"
  | "ERROR";

export interface ParseApiResponse {
  events?: AcademicEvent[];
  message?: string;
  error?: string;
}

export interface BriefApiResponse {
  brief?: string;
  error?: string;
}
