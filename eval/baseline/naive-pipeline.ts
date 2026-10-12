import type { BenchmarkDocument } from '../benchmark/schema';
import type { DeadlineChange } from '../../src/lib/types';

export interface EvaluatedEvent {
  title: string;
  date: string | null;
  type: string;
  course: string | null;
  strictDeadline: boolean;
  needsReview: boolean;
  deadlineChange: DeadlineChange;
  hasConflict: boolean;
  sourceText?: string;
}

export interface PipelineOutput {
  events: EvaluatedEvent[];
  retrievedChunks: { content: string; score: number }[];
  latencyMs: number;
}

/**
 * Naive Baseline Pipeline:
 * - Simple regex date search without Gregorian calendar validation
 * - Heuristic title matching
 * - No multi-document memory reasoning (cannot detect conflicts or revisions)
 * - No review gating (blindly marks everything confirmed)
 * - Basic substring retrieval
 */
export async function runNaiveBaseline(doc: BenchmarkDocument): Promise<PipelineOutput> {
  const start = Date.now();
  const text = doc.inputText;
  const events: EvaluatedEvent[] = [];

  // 1. Naive regex for ISO dates or month words (accepts impossible dates like 2026-02-30)
  const isoDateMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  
  // Naive course regex
  const courseMatch = text.match(/\b([A-Z]{2,4}\s?\d{3})\b/);
  const course = courseMatch ? courseMatch[1].replace(/\s+/, '') : null;

  // Simple heuristic event identification
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    const isExam = /exam|quiz|midterm|final|test|viva/i.test(line);
    const isAssignment = /assignment|homework|project|demo|submission/i.test(line);

    if (isExam || isAssignment) {
      // Find date on line or closest date
      const dateInLine = line.match(/\b\d{4}-\d{2}-\d{2}\b/);
      const chosenDate = dateInLine ? dateInLine[0] : (isoDateMatches[0] || null);

      let eventType = 'Other';
      if (/quiz/i.test(line)) eventType = 'Quiz';
      else if (/midterm|final|exam|viva/i.test(line)) eventType = 'Exam';
      else if (/project|demo/i.test(line)) eventType = 'Project';
      else if (/assignment/i.test(line)) eventType = 'Assignment';

      events.push({
        title: line.replace(/[:\-]/g, ' ').substring(0, 50).trim(),
        date: chosenDate,
        type: eventType,
        course,
        strictDeadline: /strict|mandatory/i.test(line),
        // Naive baseline flaw: Never triggers review gating
        needsReview: false,
        // Naive baseline flaw: No cross-document reasoning
        deadlineChange: 'none',
        hasConflict: false,
        sourceText: line,
      });
    }
  }

  // Deduplicate identical titles in naive baseline
  const uniqueEvents: EvaluatedEvent[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const key = `${ev.title}|${ev.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEvents.push(ev);
    }
  }

  // Naive retrieval: simple word overlap
  const retrievedChunks: { content: string; score: number }[] = [];
  if (doc.groundTruth.retrievalQueries) {
    for (const q of doc.groundTruth.retrievalQueries) {
      const qWords = q.query.toLowerCase().split(/\s+/);
      const score = lines.reduce((acc, line) => {
        const matches = qWords.filter((w) => line.toLowerCase().includes(w)).length;
        return acc + matches;
      }, 0);
      retrievedChunks.push({ content: text.substring(0, 200), score });
    }
  }

  const latencyMs = Date.now() - start;

  return {
    events: uniqueEvents,
    retrievedChunks,
    latencyMs,
  };
}
