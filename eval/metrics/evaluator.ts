import type { BenchmarkDocument } from '../benchmark/schema';
import type { PipelineOutput } from '../baseline/naive-pipeline';

export interface EvaluationMetrics {
  totalDocuments: number;
  totalGroundTruthEvents: number;
  totalPredictedEvents: number;

  // Event Extraction
  extractionTP: number;
  extractionFP: number;
  extractionFN: number;
  precision: number;
  recall: number;
  f1: number;

  // Date Exact Match (on matched date-bearing events)
  dateBearingEventsCount: number;
  dateExactMatches: number;
  dateAccuracy: number;

  // Event Type
  typeMatches: number;
  typeAccuracy: number;

  // Deadline Change
  deadlineChangeExpected: number;
  deadlineChangeDetected: number;
  deadlineChangePrecision: number;
  deadlineChangeRecall: number;

  // Conflict Detection
  conflictsExpected: number;
  conflictsDetected: number;
  conflictPrecision: number;
  conflictRecall: number;

  // Retrieval
  queriesCount: number;
  recallAt1: number;
  recallAt3: number;
  mrr: number;

  // Review & Safety Gating
  reviewCount: number;
  reviewRate: number;
  falseConfirmationCount: number; // Erroneous or conflicting event confirmed without review
  falseConfirmationRate: number;

  // Latency
  avgLatencyMs: number;
  maxLatencyMs: number;
}

export interface DetailedError {
  docId: string;
  category: string;
  type: 'FALSE_POSITIVE' | 'MISSED_EVENT' | 'DATE_MISMATCH' | 'TYPE_MISMATCH' | 'FALSE_CONFIRMATION' | 'MISSED_CONFLICT';
  description: string;
  expected?: unknown;
  predicted?: unknown;
}

export interface EvaluationResult {
  metrics: EvaluationMetrics;
  errors: DetailedError[];
}

/**
 * Normalizes title string for fuzzy comparison
 */
function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates token Jaccard similarity between two title strings
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

/**
 * Evaluates predictions against human-verified ground truth
 */
export function evaluatePredictions(
  runs: { doc: BenchmarkDocument; output: PipelineOutput }[]
): EvaluationResult {
  let extractionTP = 0;
  let extractionFP = 0;
  let extractionFN = 0;

  let dateBearingEventsCount = 0;
  let dateExactMatches = 0;

  let typeMatches = 0;

  let deadlineChangeExpected = 0;
  let deadlineChangeDetected = 0;
  let deadlineChangeTruePositives = 0;

  let conflictsExpected = 0;
  let conflictsDetected = 0;
  let conflictTruePositives = 0;

  let totalQueries = 0;
  let queriesHitAt1 = 0;
  let queriesHitAt3 = 0;
  let reciprocalRankSum = 0;

  let totalReviewedEvents = 0;
  let groundTruthRequiringReview = 0;
  let falseConfirmations = 0;

  let totalLatency = 0;
  let maxLatency = 0;

  let totalGTEvents = 0;
  let totalPredEvents = 0;

  const errors: DetailedError[] = [];

  for (const { doc, output } of runs) {
    const gtEvents = doc.groundTruth.expectedEvents;
    const predEvents = output.events;

    totalGTEvents += gtEvents.length;
    totalPredEvents += predEvents.length;
    totalLatency += output.latencyMs;
    if (output.latencyMs > maxLatency) maxLatency = output.latencyMs;

    // Track matching between GT and Predicted
    const matchedGtIndices = new Set<number>();
    const matchedPredIndices = new Set<number>();

    // 1. Match predicted events to ground truth
    for (let pIdx = 0; pIdx < predEvents.length; pIdx++) {
      const pred = predEvents[pIdx];
      let bestGtIdx = -1;
      let bestScore = 0;

      for (let gIdx = 0; gIdx < gtEvents.length; gIdx++) {
        if (matchedGtIndices.has(gIdx)) continue;
        const gt = gtEvents[gIdx];

        const sim = titleSimilarity(pred.title, gt.title);
        // Also award similarity if source keywords match or same course
        const courseMatch = gt.course && pred.course && gt.course.toLowerCase() === pred.course.toLowerCase();
        const score = sim + (courseMatch ? 0.3 : 0);

        if (score > 0.4 && score > bestScore) {
          bestScore = score;
          bestGtIdx = gIdx;
        }
      }

      if (bestGtIdx !== -1) {
        matchedGtIndices.add(bestGtIdx);
        matchedPredIndices.add(pIdx);
        extractionTP++;

        const gt = gtEvents[bestGtIdx];

        // Date accuracy evaluation
        if (gt.date !== null) {
          dateBearingEventsCount++;
          if (pred.date === gt.date) {
            dateExactMatches++;
          } else {
            errors.push({
              docId: doc.id,
              category: doc.category,
              type: 'DATE_MISMATCH',
              description: `Incorrect date for "${gt.title}". Expected: ${gt.date}, Got: ${pred.date}`,
              expected: gt.date,
              predicted: pred.date,
            });
          }
        } else {
          // GT date was null (ambiguous or impossible)
          if (pred.date !== null) {
            errors.push({
              docId: doc.id,
              category: doc.category,
              type: 'DATE_MISMATCH',
              description: `Hallucinated concrete date for ambiguous/impossible notice "${gt.title}". Expected: null, Got: ${pred.date}`,
              expected: null,
              predicted: pred.date,
            });
          }
        }

        // Type accuracy
        if (pred.type.toLowerCase() === gt.type.toLowerCase()) {
          typeMatches++;
        } else {
          errors.push({
            docId: doc.id,
            category: doc.category,
            type: 'TYPE_MISMATCH',
            description: `Type mismatch for "${gt.title}". Expected: ${gt.type}, Got: ${pred.type}`,
            expected: gt.type,
            predicted: pred.type,
          });
        }

        // Review & Safety Gating
        if (pred.needsReview) {
          totalReviewedEvents++;
        }
        if (gt.needsReview) {
          groundTruthRequiringReview++;
          if (!pred.needsReview) {
            falseConfirmations++;
            errors.push({
              docId: doc.id,
              category: doc.category,
              type: 'FALSE_CONFIRMATION',
              description: `CRITICAL SAFETY VIOLATION: Event "${gt.title}" required human review (${doc.category}) but was falsely confirmed without warning.`,
              expected: { needsReview: true },
              predicted: { needsReview: false },
            });
          }
        }

        // Deadline change
        if (gt.deadlineChange && gt.deadlineChange !== 'none') {
          deadlineChangeExpected++;
          if (pred.deadlineChange && pred.deadlineChange !== 'none') {
            deadlineChangeDetected++;
            if (pred.deadlineChange === gt.deadlineChange) {
              deadlineChangeTruePositives++;
            }
          }
        }

        // Conflict detection
        if (gt.hasConflict) {
          conflictsExpected++;
          if (pred.hasConflict) {
            conflictsDetected++;
            conflictTruePositives++;
          } else {
            errors.push({
              docId: doc.id,
              category: doc.category,
              type: 'MISSED_CONFLICT',
              description: `Missed conflict for "${gt.title}". Prior memory contradiction was not flagged.`,
              expected: { hasConflict: true },
              predicted: { hasConflict: false },
            });
          }
        }
      } else {
        // Predicted event had no GT match -> False Positive
        extractionFP++;
        errors.push({
          docId: doc.id,
          category: doc.category,
          type: 'FALSE_POSITIVE',
          description: `Spurious event extracted from document: "${pred.title}" (${pred.date || 'undated'})`,
          predicted: pred,
        });
      }
    }

    // Unmatched Ground Truth events -> False Negatives
    for (let gIdx = 0; gIdx < gtEvents.length; gIdx++) {
      if (!matchedGtIndices.has(gIdx)) {
        extractionFN++;
        const missed = gtEvents[gIdx];
        errors.push({
          docId: doc.id,
          category: doc.category,
          type: 'MISSED_EVENT',
          description: `Failed to extract expected event: "${missed.title}" (${missed.date || 'pending'})`,
          expected: missed,
        });
      }
    }

    // 2. Retrieval Evaluation
    if (doc.groundTruth.retrievalQueries && doc.groundTruth.retrievalQueries.length > 0) {
      for (const queryTarget of doc.groundTruth.retrievalQueries) {
        if (queryTarget.expectedKeywords.length === 0) continue; // negative query
        totalQueries++;

        const topChunks = output.retrievedChunks.slice(0, 3);
        let foundRank = -1;

        for (let i = 0; i < topChunks.length; i++) {
          const chunkText = topChunks[i].content.toLowerCase();
          const hasKeyword = queryTarget.expectedKeywords.some((k) =>
            chunkText.includes(k.toLowerCase())
          );
          if (hasKeyword) {
            foundRank = i + 1;
            break;
          }
        }

        if (foundRank === 1) queriesHitAt1++;
        if (foundRank >= 1 && foundRank <= 3) queriesHitAt3++;
        if (foundRank > 0) reciprocalRankSum += 1 / foundRank;
      }
    }
  }

  // Aggregate ratios
  const precision = extractionTP + extractionFP > 0 ? extractionTP / (extractionTP + extractionFP) : 0;
  const recall = extractionTP + extractionFN > 0 ? extractionTP / (extractionTP + extractionFN) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const dateAccuracy = dateBearingEventsCount > 0 ? dateExactMatches / dateBearingEventsCount : 1.0;
  const typeAccuracy = extractionTP > 0 ? typeMatches / extractionTP : 0;

  const deadlineChangePrecision = deadlineChangeDetected > 0 ? deadlineChangeTruePositives / deadlineChangeDetected : 1.0;
  const deadlineChangeRecall = deadlineChangeExpected > 0 ? deadlineChangeTruePositives / deadlineChangeExpected : 1.0;

  const conflictPrecision = conflictsDetected > 0 ? conflictTruePositives / conflictsDetected : 1.0;
  const conflictRecall = conflictsExpected > 0 ? conflictTruePositives / conflictsExpected : 1.0;

  const recallAt1 = totalQueries > 0 ? queriesHitAt1 / totalQueries : 1.0;
  const recallAt3 = totalQueries > 0 ? queriesHitAt3 / totalQueries : 1.0;
  const mrr = totalQueries > 0 ? reciprocalRankSum / totalQueries : 1.0;

  const reviewRate = totalPredEvents > 0 ? totalReviewedEvents / totalPredEvents : 0;
  const falseConfirmationRate = groundTruthRequiringReview > 0 ? falseConfirmations / groundTruthRequiringReview : 0;

  const avgLatencyMs = runs.length > 0 ? Math.round(totalLatency / runs.length) : 0;

  return {
    metrics: {
      totalDocuments: runs.length,
      totalGroundTruthEvents: totalGTEvents,
      totalPredictedEvents: totalPredEvents,
      extractionTP,
      extractionFP,
      extractionFN,
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      f1: parseFloat(f1.toFixed(4)),
      dateBearingEventsCount,
      dateExactMatches,
      dateAccuracy: parseFloat(dateAccuracy.toFixed(4)),
      typeMatches,
      typeAccuracy: parseFloat(typeAccuracy.toFixed(4)),
      deadlineChangeExpected,
      deadlineChangeDetected,
      deadlineChangePrecision: parseFloat(deadlineChangePrecision.toFixed(4)),
      deadlineChangeRecall: parseFloat(deadlineChangeRecall.toFixed(4)),
      conflictsExpected,
      conflictsDetected,
      conflictPrecision: parseFloat(conflictPrecision.toFixed(4)),
      conflictRecall: parseFloat(conflictRecall.toFixed(4)),
      queriesCount: totalQueries,
      recallAt1: parseFloat(recallAt1.toFixed(4)),
      recallAt3: parseFloat(recallAt3.toFixed(4)),
      mrr: parseFloat(mrr.toFixed(4)),
      reviewCount: totalReviewedEvents,
      reviewRate: parseFloat(reviewRate.toFixed(4)),
      falseConfirmationCount: falseConfirmations,
      falseConfirmationRate: parseFloat(falseConfirmationRate.toFixed(4)),
      avgLatencyMs,
      maxLatencyMs: maxLatency,
    },
    errors,
  };
}
