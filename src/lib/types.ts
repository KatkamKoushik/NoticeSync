export type EventType = "Exam" | "Assignment" | "Notice";

export type DeadlineChange =
  | "none"
  | "extended"
  | "postponed"
  | "rescheduled"
  | "moved_earlier"
  | "cancelled"
  | "unknown";

export type Importance = "low" | "medium" | "high";

export interface AcademicEvent {
  id: string;
  title: string;
  date: string | null; // YYYY-MM-DD or null
  type: EventType;
  description: string;
  confidence: number; // 1-100
  importance: Importance;
  actionRequired: boolean;
  strictDeadline: boolean;
  deadlineChange: DeadlineChange;
  additionalInformationPending: boolean;
  sourceText: string;
  course?: string | null;
  sourceType: "pdf" | "image" | "text";
  needsReview: boolean;
}

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
