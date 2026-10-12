/**
 * NoticeSync Academic Notice Evaluation Benchmark - Type Definitions & Schema
 * Version: 1.0.0
 */

export type BenchmarkSplit = 'dev' | 'test';

export type BenchmarkCategory =
  | 'standard_syllabus'
  | 'revised_notice'
  | 'ambiguous_date'
  | 'duplicate_notice'
  | 'conflicting_deadline'
  | 'ocr_noise'
  | 'irrelevant_document'
  | 'no_events';

import type { DeadlineChange } from '../../src/lib/types';

export interface ExpectedEvent {
  title: string;
  date: string | null; // ISO YYYY-MM-DD or null if undated/pending/ambiguous
  type: 'Exam' | 'Assignment' | 'Notice' | 'Task';
  course?: string | null;
  strictDeadline?: boolean;
  needsReview: boolean; // Must be true if date is ambiguous, missing, conflicting, or low confidence
  deadlineChange?: DeadlineChange;
  hasConflict?: boolean;
  sourceKeyword?: string;
}

export interface RetrievalQueryTarget {
  query: string;
  expectedKeywords: string[];
  description: string;
}

export interface PriorMemoryChunk {
  title: string;
  content: string;
  date?: string;
  course?: string;
}

export interface BenchmarkDocument {
  id: string;
  split: BenchmarkSplit;
  category: BenchmarkCategory;
  title: string;
  sourceType: 'text' | 'pdf' | 'image';
  inputText: string;
  priorMemory?: PriorMemoryChunk[];
  groundTruth: {
    expectedEvents: ExpectedEvent[];
    shouldAbstainOrReviewAll: boolean; // True if document has zero events or all events require human review
    retrievalQueries?: RetrievalQueryTarget[];
  };
  notes?: string;
}
