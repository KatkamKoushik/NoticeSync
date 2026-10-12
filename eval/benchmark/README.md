# NoticeSync Academic Notice Evaluation Benchmark (v1.0.0)

## Overview
This benchmark provides a standardized, privacy-safe, version-controlled ground truth dataset for evaluating the NoticeSync academic extraction, date verification, memory retrieval, and conflict-detection pipelines.

All notices are synthetic academic circulars modeled on real university schedules, examination notices, and departmental communications. They contain **zero personally identifiable information (PII)** and zero proprietary third-party secrets.

---

## Benchmark Splits

| Split | Count | Purpose |
| :--- | :--- | :--- |
| **Development (`dev`)** | 5 | Exploratory error analysis, prompt refinement, and pipeline tuning. |
| **Test (`test`)** | 6 | Strictly held-out evaluation for objective metric reporting. Never used for prompt tuning. |
| **Total** | 11 | Comprehensive coverage across 8 distinct stress-test categories. |

---

## Category Coverage Matrix

1. **`standard_syllabus`**: Clear academic calendar with multiple structured milestones, explicit ISO dates, and course codes.
2. **`revised_notice`**: Official circular updating an existing milestone date, testing deadline-change classification (`extended`, `rescheduled`, etc.).
3. **`ambiguous_date`**: Notices with dates stated vaguely ("second week of November", "next Friday", or impossible dates like "February 30, 2026").
4. **`duplicate_notice`**: Exact or cosmetically modified circulars testing content-hash deduplication and idempotency.
5. **`conflicting_deadline`**: New circular proposing a deadline that contradicts earlier documents in the student's historical memory.
6. **`ocr_noise`**: Simulated optical character recognition artifacts (character misrecognitions, broken formatting, line break noise).
7. **`irrelevant_document`**: Non-academic campus documents (e.g. cafeteria food menu) that must produce zero hallucinated events.
8. **`no_events`**: Campus notices (e.g. parking advisory) with zero actionable academic deadlines, testing safe abstention.

---

## Ground Truth Annotation Standards

### 1. Date Handling
- Date strings must be in strict ISO-8601 format (`YYYY-MM-DD`).
- When a notice mentions an ungrounded, tentative, or ambiguous date (e.g. "early November", "TBD"), the ground truth date is `null`.
- Impossible calendar dates (e.g. `2026-02-30`) must resolve to `date: null` with `needsReview: true`.

### 2. Event Types
Strict taxonomy:
- `Exam`: Midterms, finals, practical tests.
- `Assignment`: Problem sets, essays, homework submissions.
- `Quiz`: In-class quizzes, surprise assessments.
- `Project`: Milestones, final demos, code freezes.
- `Holiday`: University recess, breaks.
- `Lecture`: Special guest lectures, makeup sessions.
- `Administrative`: Fee payment, registration.
- `Other`: Uncategorized events.

### 3. Review Gating (`needsReview`)
The safety flag `needsReview: true` is strictly required when:
- The event date is ambiguous, tentative, or missing (`date: null`).
- The event represents a modification or revision of a previously established deadline.
- A conflict exists between the new circular and existing memory.
- Severe OCR artifacts reduce text clarity.
- The pipeline's extraction confidence is below 75%.

**False-Confirmation Rate**: Any event flagged with `needsReview: false` when ground truth requires `needsReview: true` is counted as a critical safety violation.

### 4. Conflict & Deadline Revision Definitions
- `deadlineChange`: Categorized as `none`, `extended`, `postponed`, `rescheduled`, `moved_earlier`, `cancelled`, or `unchanged`.
- `hasConflict`: `true` if a historical memory chunk specifies an incompatible date for the exact same course/milestone.

### 5. Retrieval Evidence
- Each benchmark entry with queries includes `expectedKeywords` and relevant chunk matches to evaluate whether vector or keyword search surfaces the supporting evidence.
