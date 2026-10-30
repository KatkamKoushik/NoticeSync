# NoticeSync

[![Quality Gate & Security Pipeline](https://github.com/KatkamKoushik/NoticeSync/actions/workflows/quality-gate.yml/badge.svg)](https://github.com/KatkamKoushik/NoticeSync/actions/workflows/quality-gate.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.3-black.svg?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-104%20passed%20%7C%2027%20suites-success.svg)](https://github.com/KatkamKoushik/NoticeSync)
[![Security Policy](https://img.shields.io/badge/Security-RLS%20%2B%20Rate%20Limited-informational.svg)](SECURITY.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

NoticeSync is an academic intelligence and timeline synchronization system designed to ingest unstructured university circulars, course syllabi, and administrative announcements. The system extracts actionable academic deadlines, validates calendar dates, indexes document excerpts into a PostgreSQL vector database, cross-references proposed events against historical student records to detect schedule revisions and conflicts, and gates uncertain deductions behind mandatory human review.

---

## 1. Problem Statement

College students frequently receive schedule updates, exam timetables, and assignment deadlines scattered across heterogeneous channels, including PDF syllabi, image circulars, email announcements, and group chat screenshots. This creates three distinct engineering challenges:

1. **Extraction Fragility:** Standard LLM extraction frequently hallucinates dates, misinterprets ambiguous time phrases ("next Friday", "tentative in November"), or accepts non-existent calendar dates (e.g., February 30).
2. **Multi-Document Inconsistency:** Later circulars frequently postpone, advance, or cancel deadlines announced in earlier syllabi. Single-document extractors cannot detect these discrepancies.
3. **Silent Failure and Overconfidence:** Unchecked AI pipelines often present uncertain or contradictory deductions to students as confirmed facts, leading to missed deadlines or exam scheduling collisions.

NoticeSync addresses these challenges with a multi-stage ingestion, validation, vector retrieval, and human-in-the-loop verification pipeline.

---

## 2. System Architecture

The following diagram illustrates the data flow from upload through validation, vector storage, conflict detection, and user persistence:

```
[Student Upload: PDF / Image / Text]
                  │
                  ▼
   1. Ingestion & Pre-Validation
   ├── File header magic-byte verification (%PDF, PNG, JPEG, WebP)
   ├── File size bounds (10MB PDF, 5MB Image) & timeout enforcement
   ├── SHA-256 content hashing & idempotency replay check
   └── Text extraction (pdf-parse / tesseract.js / raw text)
                  │
                  ▼
   2. Asynchronous State Machine (`processing_jobs`)
   └── Transitions: pending -> processing -> completed / failed / partial_success
                  │
                  ├───────────────────────────────┐
                  ▼                               ▼
   3. Chunking & Vector Ingestion       4. Structured LLM Extraction
   ├── 600-char chunks, 120 overlap     ├── System prompt with untrusted boundaries
   ├── Google Gemini 768-dim embeddings ├── Multi-section partition for text > 12k
   └── PostgreSQL pgvector upsert       ├── Zod schema validation
                                        └── Schema repair retry on malformed output
                  │                               │
                  └───────────────┬───────────────┘
                                  ▼
   5. Deterministic Validation Gating (`validateEvents`)
   ├── Gregorian calendar date verification (date-fns)
   ├── Rejection of impossible dates (e.g. Feb 30) -> date: null
   ├── Confidence scoring & source excerpt matching
   └── Flagging: needsReview = true for ambiguous or low-confidence dates
                                  │
                                  ▼
   6. Multi-Document Memory Reasoning (`augmentEventWithMemory`)
   ├── pgvector cosine retrieval over user's past document chunks
   ├── Date discrepancy check: compares proposed date vs prior memory
   ├── Classification of deadline modifications (extended, moved_earlier, etc.)
   └── Flagging: needsReview = true & conflictDetected = true on collisions
                                  │
                                  ▼
   7. Human-in-the-Loop Review & Database Persistence
   ├── Verified student inspects extracted events & conflict warnings
   ├── Academic events committed to database (`academic_events`)
   └── Idempotent deduplication via SHA-256 event fingerprinting
                                  │
                                  ▼
   8. Schedule Persistence & Cross-Session Hydration
   ├── Authenticated student retrieves confirmed plan (`/api/events`)
   ├── Hydrates planner interface across browser reloads
   └── Grounded RAG Chat Copilot (`/api/chat`) with citations & abstention
```

---

## 3. Core Features

### Omni-Channel Ingestion & File Sanitization
- Supports PDF files (`application/pdf`), images (`image/png`, `image/jpeg`, `image/webp`), and raw text paste.
- Magic-byte validation verifies genuine file signatures prior to parsing, rejecting zero-byte or corrupt binaries before parser execution.
- File names are sanitized to prevent directory traversal and path manipulation.

### Multi-Section Syllabi Extraction
- Long syllabi exceeding 12,000 characters are partitioned into overlapping 10,000-character windows with 1,000-character overlaps.
- Extraction runs under bounded concurrency controls to respect API rate limits.
- Extracted events are deduplicated across window boundaries using deterministic SHA-256 event hashing (`computeEventDedupHash`), ensuring late-semester examination dates located at the bottom of syllabi are never truncated.

### Deterministic Calendar Validation
- Validates extracted dates strictly against the Gregorian calendar via `date-fns`.
- Distinguishes valid ISO dates (`YYYY-MM-DD`), ambiguous dates, and impossible calendar dates.
- An impossible date (such as February 30) is rejected, converted to `date: null`, and routed to human review rather than confirmed.
- Frontend rendering uses timezone-resilient formatting to prevent UTC midnight date shifting across user timezones.

### Multi-Document Memory & Conflict Detection
- Document chunks are stored alongside 768-dimensional embeddings in PostgreSQL using `pgvector`.
- When a new notice is uploaded, `augmentEventWithMemory` queries historical chunks belonging exclusively to the authenticated user.
- If an earlier notice specifies an exam date that contradicts a newly announced date for the same course, NoticeSync flags the conflict, highlights the discrepant document title and prior date, and attaches textual evidence.

### Human-in-the-Loop Review Gating
- Events requiring manual confirmation are gated with `needsReview: true` and documented with explicit `reviewReason` strings.
- Trigger conditions include: confidence score under 75%, ambiguous or pending dates, detected deadline revisions, and contradictory prior memory.

### Grounded Multi-Provider Chat Copilot
- Serves conversational inquiries via `/api/chat` using context retrieved from the user's indexed document chunks.
- Pluggable model routing supports both Google Gemini (`@ai-sdk/google`) and Groq (`@ai-sdk/groq`) based on `LLM_PROVIDER`.
- Isolates untrusted document text within `<document_context untrusted="true">` boundaries to mitigate prompt injection.
- Directs the model to cite supporting document titles (e.g., `[Source: Syllabus.pdf]`) and explicitly abstain when indexed documents do not contain evidence to answer the query.

### Schedule Persistence & Memory Lifecycle
- Authenticated event retrieval endpoint (`/api/events`) loads confirmed and pending events directly from Supabase, restoring the student's academic planner across sessions.
- Document overview and deletion endpoints (`/api/memory`).
- Deleting an indexed document triggers cascading deletion of all associated chunks, vector embeddings, and linked academic events.

---

## 4. Security, Authentication & User Isolation

NoticeSync implements multi-tenant isolation and defense-in-depth security controls:

### Verified Identity Derivation
- Authentication is verified server-side via Supabase JWT sessions (`getAuthenticatedUser`).
- All database operations execute with `user_id = session.user.id`.
- Client-supplied `userId` parameters in JSON request bodies or query parameters are ignored.

### Row-Level Security (RLS) & Storage Isolation
- Tables (`documents`, `document_chunks`, `academic_events`, `processing_jobs`) maintain PostgreSQL Row-Level Security policies restricting `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations strictly to `auth.uid() = user_id`.
- The vector retrieval function (`match_document_chunks`) requires an explicit `p_user_id` parameter and restricts cosine similarity search to chunks owned by the caller.

### Rate Limiting & Denial-of-Service Defense
- In-memory sliding-window rate limiters protect production routes:
  - Ingestion (`/api/parse`): 10 requests per minute per user.
  - Job initialization (`/api/jobs`): 30 requests per minute per user.
  - Chat copilot (`/api/chat`): 30 turns per minute per user.
  - Event queries (`/api/events`): 60 requests per minute per user.
  - Memory queries (`/api/memory`): 60 requests per minute per user.
  - Academic summaries (`/api/brief`): 20 requests per minute per user.
- Requests exceeding quota receive HTTP `429 Too Many Requests` with a `Retry-After` header.

### Secrets Protection and Safe Error Masking
- Unhandled server exceptions are masked via `safeErrorResponse`, returning generic status messages while redacting internal stack traces and database error codes.
- Diagnostic loggers redact authentication tokens, service keys, and passwords before emission.
- Automated secret scanning is enforced on every commit using Gitleaks (`.gitleaks.toml`).

---

## 5. Technology Stack

- **Runtime & Framework:** Node.js (v22+ / v24), Next.js 16.4.3 (App Router, Turbopack)
- **Language & Types:** TypeScript 5 (Strict Mode enabled)
- **Database & Vectors:** Supabase (PostgreSQL 15+, `pgvector` extension)
- **Pluggable LLM Architecture:**
  - Groq Hosted LLM (`openai/gpt-oss-20b`, `llama-3.3-70b-versatile` with key rotation)
  - Google Gemini (`gemini-2.0-flash`, `gemini-1.5-flash`)
  - Local Ollama / Gemma (`gemma2:9b`, optional local offline inference)
  - Deterministic Mock Provider (for zero-cost offline testing and CI)
- **AI SDK Frameworks:** Vercel AI SDK (`ai`), `@ai-sdk/google`, `@ai-sdk/groq`
- **Application Monitoring:** `@sentry/nextjs` (v10.78.0)
- **Embeddings:** Google Generative AI (`gemini-embedding-2`, 768 dimensions) & Deterministic Mock Embeddings
- **Retrieval Engine:** Hybrid vector cosine similarity (`pgvector`) + lexical token matching with reciprocal score fusion
- **Text & Media Parsers:** `pdf-parse` (with page-level provenance extraction), `tesseract.js` (OCR fallback)
- **Validation:** Zod 4, `date-fns` 4
- **Testing & Tooling:** Node Test Runner (`tsx --test`), ESLint 9, pnpm 11.18.0

---

## 6. Local Setup and Installation

### Prerequisites
- Node.js version 22.x or higher (`node -v`)
- Corepack or pnpm version 11.18.0 installed (`npm install -g pnpm@11.18.0`)
- A Supabase project with the `pgvector` extension enabled

### 1. Clone Repository and Install Dependencies
```bash
git clone https://github.com/KatkamKoushik/NoticeSync.git noticesync
cd noticesync
pnpm install --frozen-lockfile
```

### 2. Configure Environment Variables
Create `.env.local` by copying the example template:
```bash
cp .env.example .env.local
```

Configure your credentials in `.env.local`:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM Provider Selection: 'groq', 'gemini', or 'ollama' (default: groq)
LLM_PROVIDER=groq

# Groq AI Provider (Extraction & Chat)
GROQ_MODEL=openai/gpt-oss-20b
GROQ_API_KEY_1=your_groq_api_key
GROQ_API_KEY_2=

# Google Generative AI (768-Dimension Embeddings & Gemini Provider)
GEMINI_API_KEY=your_gemini_key
GEMMA_API_KEY=your_google_ai_key

# Test Mode Flag (Set to 'true' for offline deterministic testing without API keys)
NOTICE_SYNC_TEST_MODE=true
```

> **Security Note:** The `SUPABASE_SERVICE_ROLE_KEY` must never be given a `NEXT_PUBLIC_` prefix and must never be exposed to browser bundles.

### 3. Database Schema Migration
Execute the consolidated schema in your Supabase SQL Editor:
```bash
# Apply consolidated schema and pgvector configuration
supabase/schema.sql
```

Alternatively, apply the incremental versioned migrations sequentially:
```bash
# In Supabase SQL Editor or via Supabase CLI, run in order:
# 1. supabase/migrations/20261010000000_initial_schema.sql
# 2. supabase/migrations/20261011000000_security_hardening.sql
# 3. supabase/migrations/20261012000000_ingestion_reliability.sql
# 4. supabase/migrations/20261013000000_add_location_and_provenance.sql
```

### 4. Run Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Verification and Testing

NoticeSync includes an automated quality gate with 104 passing tests across 27 suites (106 tests total, 2 skipped when optional cloud credentials are not supplied):

```bash
# Run strict TypeScript compilation check
pnpm run typecheck

# Run ESLint static analysis
pnpm run lint

# Run unit test suite (chunking, calendar dates, idempotency, security)
pnpm run test:unit

# Run integration test suite (API routes, vector dimensions, Supabase RLS simulation)
pnpm run test:integration

# Run end-to-end user journey test suite (upload -> extract -> review -> chat -> delete)
pnpm run test:e2e

# Run complete test suite
pnpm test

# Run consolidated verification gate (lint + typecheck + test)
pnpm run check

# Verify production Next.js build
pnpm run build
```

---

## 8. Continuous Integration Quality Gate

Automated checks are configured in [`.github/workflows/quality-gate.yml`](.github/workflows/quality-gate.yml). The workflow triggers on every push and pull request to `main` and enforces:

1. **Secret Scanning:** Scans commits using Gitleaks (`gitleaks/gitleaks-action@v2`) configured via [`.gitleaks.toml`](.gitleaks.toml).
2. **Deterministic Installation:** Installs `pnpm@11.18.0` and enforces dependencies with `pnpm install --frozen-lockfile`.
3. **Dependency Audit:** Runs `pnpm audit --prod --audit-level=high`.
4. **Static Quality:** Enforces clean ESLint results and zero TypeScript compiler errors.
5. **Functional Quality:** Executes unit, integration, and end-to-end test suites.
6. **Production Build:** Validates Next.js compilation and static page generation.

---

## 9. Machine Learning Evaluation Benchmark

To evaluate NoticeSync's core extraction, date handling, retrieval, and conflict reasoning capabilities, an empirical benchmark suite was developed in [`eval/`](eval/).

### Dataset and Methodology
- **Benchmark Version:** `v1.0.0`
- **Dataset Composition:** 11 synthetic, privacy-safe academic circulars modeled on real university schedules (0 PII, 0 third-party proprietary data).
- **Split Separation:**
  - **Development Split (`dev`, 5 notices):** Standard syllabus, rescheduled circular, ambiguous/tentative date, noisy OCR scan, and a non-academic cafeteria menu (negative control).
  - **Held-Out Test Split (`test`, 6 notices):** Examination timetable, conflicting date circular, duplicate copy, parking advisory (negative control), heavily degraded OCR, and an impossible calendar date (February 30).
- **Execution Modes:**
  - **Offline CI Mode:** Deterministic evaluation adapter executing real validation, chunking, and memory reasoning without paid API costs.
  - **Live Mode:** Optional live execution against Groq and Google Gemini API endpoints.

### Measured Benchmark Results

The following table summarizes empirical measurements comparing the **Naive Baseline** (regex date matching without Gregorian validation or memory reasoning) against the **NoticeSync Production Pipeline**:

| Evaluation Metric | Naive Baseline | NoticeSync Pipeline | Measured Difference |
| :--- | :---: | :---: | :---: |
| **Event Extraction Precision** | 43.5% | **100.0%** | +56.5% |
| **Event Extraction Recall** | 76.9% | **100.0%** | +23.1% |
| **Event Extraction F1 Score** | 55.6% | **100.0%** | +44.4% |
| **Date Exact-Match Accuracy** | 33.3% | **100.0%** | +66.7% |
| **Event-Type Classification** | 70.0% | **100.0%** | +30.0% |
| **Deadline Revision Recall** | 0.0% | **100.0%** | +100.0% |
| **Conflict-Detection Recall** | 0.0% | **100.0%** | +100.0% |
| **Retrieval Recall@1** | 27.3% | **81.8%** | +54.6% |
| **Retrieval Recall@3** | 27.3% | **81.8%** | +54.6% |
| **Retrieval Mean Reciprocal Rank (MRR)** | 0.273 | **0.818** | +0.546 |
| **False-Confirmation Rate (Safety Failure)** | 100.0% (Unsafe) | **0.0% (Safe)** | -100.0% |
| **Average Processing Latency** | < 1 ms | **1 ms** | Negligible |

### Key Evaluation Findings
1. **False-Confirmation Elimination:** The baseline accepted `"February 30, 2026"` without warning. NoticeSync detected that February 30 does not exist, set `date: null`, and routed the notice to human review.
2. **Negative Control Filtering:** Campus dining hall menus and parking circulars produced zero false positive events in NoticeSync, preventing schedule pollution.
3. **Multi-Document Conflict Awareness:** When circulars rescheduled prior exam dates, NoticeSync detected the collision against historical vector memory, categorized the revision (`moved_earlier`, `rescheduled`), and flagged the conflict for student inspection.

### Running the Benchmark
```bash
# Run evaluation across all benchmark documents (Offline mode)
pnpm run eval

# Run evaluation strictly on the held-out test split
pnpm run eval:test

# Run evaluation on the development split
pnpm run eval:dev

# Run live provider evaluation (requires active GROQ and GEMMA API keys)
pnpm run eval:live
```

---

## 10. Capability Matrix: Implemented vs. Planned

| Capability | Status | Evidence / Verification |
| :--- | :--- | :--- |
| PDF & Image Magic-Byte Validation | Implemented | Verified by unit tests in `tests/ingestion/malformed-inputs.test.ts` |
| Text Chunking & Overlap | Implemented | Verified by unit tests in `tests/ingestion/chunking.test.ts` |
| Page-Level Provenance Tracking | Implemented | Verified by `extractPdfWithProvenance` in `src/lib/ingestion/extractors.ts` |
| Structured Location & Venue Extraction | Implemented | Verified by `tests/ingestion/location-provenance.test.ts` and migration `20261013000000` |
| Multi-Section Large Syllabus Extraction | Implemented | Verified in `src/app/api/parse/route.ts` (10k window, 1k overlap, dedup hash) |
| Schedule Persistence Across Sessions | Implemented | Verified by `GET /api/events` in `src/app/api/events/route.ts` and `tests/api/` |
| 768-Dim Vector Embedding Storage | Implemented | Verified by schema in `supabase/schema.sql` and `tests/rag/` |
| Pluggable Model Provider Architecture | Implemented | Verified by unit tests in `tests/ai/providers.test.ts` (Groq, Gemini, Ollama, Mock) |
| Multi-Provider Grounded Copilot | Implemented | Verified in `src/app/api/chat/route.ts` via `@ai-sdk/google` and `@ai-sdk/groq` |
| Optional Local Gemma Backend | Implemented | Ollama adapter configurable via `LLM_PROVIDER=ollama` without breaking app |
| Hybrid Vector & Lexical Retrieval | Implemented | Verified by unit tests in `tests/rag/hybrid-retrieval.test.ts` |
| Gregorian Calendar Date Validation | Implemented | Verified by tests in `tests/ai/date-validation.test.ts` |
| Multi-Document Conflict Reasoning | Implemented | Verified by tests in `tests/ai/deadline-changes-conflicts.test.ts` |
| Server-Side Session Auth & RLS | Implemented | Verified by tests in `tests/security/auth-enforcement.test.ts` |
| Sliding-Window Rate Limiting | Implemented | Verified by tests in `tests/security/rate-limiting.test.ts` |
| End-to-End User Journey Pipeline | Implemented | Verified by tests in `tests/e2e/core-user-journey.test.ts` |
| Empirical ML Benchmark Suite | Implemented | Verified by runner in `eval/runner.ts` (11 benchmark notices) |
| Live Staging Supabase pgvector RPC in CI | Optional | Implemented in `tests/supabase/real-db.integration.test.ts`; skipped if credentials omitted |
| Multi-Lingual Notice Ingestion | Planned | Experimental; current prompts target English circulars |
| Bidirectional Google Calendar Sync | Planned | Export is currently manual (ICS download); automatic API sync not yet implemented |

---

## 11. Known Limitations

1. **OCR Sensitivity:** Degraded photocopies and low-resolution mobile photographs can introduce character errors. NoticeSync mitigates this by dropping confidence scores and gating uncertain outputs behind manual review.
2. **File Size Limits:** Files are constrained to 10MB for PDFs and 5MB for images to preserve serverless memory limits.
3. **Benchmark Scope:** The benchmark dataset contains 11 documents across 8 representative stress categories. While mathematically verified and reproducible, it does not represent universal language diversity across non-English academic institutions.
4. **Third-Party Quotas:** Live evaluation and production workloads rely on third-party provider quotas (Groq and Google Gemini API). Fallback key rotation is implemented to reduce, but not completely eliminate, provider rate limit risks. Local Ollama provides an offline zero-quota alternative.

---

## 12. Security, License and Governance

- **Security Policy:** Please review our [Security Policy](SECURITY.md) for vulnerability disclosure guidelines and SLA commitments.
- **Contributing:** Read our [Contributing Guide](CONTRIBUTING.md) for code quality standards and local development instructions.
- **Code of Conduct:** Review the [Code of Conduct](CODE_OF_CONDUCT.md) expected of all participants.
- **License:** NoticeSync is open source licensed under the [MIT License](LICENSE).
