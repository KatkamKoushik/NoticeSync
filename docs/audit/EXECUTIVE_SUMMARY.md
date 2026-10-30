# NoticeSync — Executive Engineering Audit Summary

**Date:** October 31, 2026  
**Audited Target:** [NoticeSync (KatkamKoushik/NoticeSync)](https://github.com/KatkamKoushik/NoticeSync)  
**Branch Audited:** `audit/repository-review-and-roadmap` (at commit `0a45d91`)  
**Audit Conducted By:** Principal Full-Stack, Security, AI/ML, and Database Systems Review Team  

---

## 1. Executive Synopsis

NoticeSync is an AI-powered academic scheduling and information extraction copilot designed to transform unstructured university circulars, exam timetables, assignment notices, and course syllabi (in PDF, image, and text formats) into a structured, conflict-aware academic calendar.

The project demonstrates **impressive engineering rigor in its core database security model, AI validation guardrails, and deterministic evaluation methodology**. Notably, the repository includes a custom 104-test automated verification suite, a deterministic offline ML evaluation harness measuring extraction precision, recall, and date accuracy against a naive baseline, and a hardened Supabase pgvector schema featuring composite foreign keys and strict Row Level Security (RLS) user isolation.

However, our deep-dive technical investigation has revealed **critical security vulnerabilities in third-party dependencies that currently block production builds**, **an architectural data persistence disconnect on the frontend**, **a silent document truncation bottleneck in the AI extraction pipeline**, and **a hardcoded model provider lock-in in the chat copilot route**.

---

## 2. Engineering Health Scorecard

| Domain | Health Rating | Status Summary |
| :--- | :---: | :--- |
| **Architecture & Modularity** | **B+** | Clean separation of concerns across providers, validation, and ingestion; however, frontend view state is centralized in a single 420-line client component, and backend jobs lack transactional abort rollbacks. |
| **Application Security** | **C-** | RLS database policies and UUID input sanitization are exemplary; however, production build is blocked by a **Critical Remote Code Execution vulnerability in Next.js 16.4.0** and a **Critical Middleware Bypass in Sentry 10.70.0**. In-memory rate limiting is also unsuited for serverless multi-replica deployment. |
| **AI / RAG & Intelligence** | **B** | Multi-provider abstraction (Groq, Gemini, Ollama, Mock) and Gregorian date validation with review gating are excellent. However, a hardcoded 15,000-character ceiling silently drops dates on late syllabus pages, and the chat route is hardcoded to Groq. |
| **Database & pgvector** | **A-** | PostgreSQL schema with composite keys `(document_id, user_id)` and HNSW vector index is well designed. Missing cursor-based pagination and lack of an initial events fetch endpoint are the primary deficiencies. |
| **Code Quality & Typing** | **B+** | Strict TypeScript configuration with zero type errors (`tsc --noEmit` passes cleanly) and clean ESLint pass. Minor inconsistencies between DB `priority_level` and frontend `importance`, plus synchronous browser `window.alert` calls. |
| **Frontend & UI/UX** | **B-** | Visually compelling dark mode UI with animated SVG processing status; however, accessibility is hindered by missing form `<label>`s, lack of `prefers-reduced-motion` controls for 4K background video, and WCAG AA contrast shortfalls. |
| **Testing & CI/CD** | **B** | 104 automated tests across 27 suites with 100% pass rate in mock mode; comprehensive evaluation runner. However, CI quality gate fails on `pnpm audit` and `next build` due to dependency CVEs, and UI components have 0 unit/integration tests. |
| **Dependencies & Modernity** | **C** | Uses cutting-edge Next.js 16 and React 19.2.8; however, 17 production dependency vulnerabilities (3 critical, 6 high) must be patched immediately. |

---

## 3. Key Architectural Strengths

1. **Relational Multi-Tenant Isolation by Design:**  
   The database schema (`supabase/schema.sql` and `supabase/migrations/20261011000000_security_hardening.sql`) does not rely on application-level filtering alone. Every child table (`document_chunks`, `academic_events`, `tasks`, `processing_jobs`) enforces composite foreign keys referencing `(parent_id, user_id)`. Combined with PostgreSQL Row Level Security (RLS) and the `match_document_chunks` security invoker function, cross-user data leakage is strictly prevented at the engine level.

2. **Deterministic Gregorian Calendar Validation & Safety Gating:**  
   Unlike naive LLM wrappers that hallucinate non-existent calendar dates (e.g., February 31), `src/lib/validation.ts` enforces a deterministic Gregorian validator (`validateCalendarDate`). Impossible dates, leap-year errors, and ambiguous temporal expressions (e.g., "tentative in November") are automatically stripped, flagged as pending, and gated behind human review (`needsReview: true`).

3. **Pluggable Model Provider Architecture:**  
   `src/lib/providers/` cleanly abstracts LLMs (`GroqLLMProvider`, `GeminiLLMProvider`, `OllamaLLMProvider`, `MockLLMProvider`) and Embeddings (`GoogleEmbeddingProvider`, `MockEmbeddingProvider`). Local Gemma inference via Ollama is optional and decoupled, ensuring the app remains fully functional without local GPU hardware.

4. **Rigorous Offline Evaluation Suite:**  
   `eval/runner.ts` provides a benchmark harness evaluating NoticeSync against a naive baseline across synthetic academic circulars. NoticeSync achieves **100% extraction precision and 0% false confirmations** (versus a 100% false-confirmation rate in the unvalidated baseline).

---

## 4. Primary Weaknesses & High-Impact Vulnerabilities

1. **CRITICAL: Production Build Failure via Next.js 16.4.0 Vulnerability:**  
   Running `pnpm build` immediately fails with:  
   `Error [SecurityFatalError]: Your version of Next.js is affected by a known security vulnerability (Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used).`  
   Next.js 16.4.0 must be upgraded to `>=16.4.1`.

2. **CRITICAL: Sentry Middleware Bypass Vulnerability (`@sentry/nextjs` 10.70.0):**  
   `pnpm audit:deps` reports GHSA-mchm-gjx6-7h55 (`Sentry-Javascript: Middleware Bypass when using Tunnel route`), affecting `>=10.0.0-alpha.0 <10.75.2`. It must be patched to `>=10.75.2`.

3. **ARCHITECTURAL BUG: Disconnect Between Database Persistence and UI Mount:**  
   While `/api/parse` saves confirmed academic events to `academic_events` in Supabase, `src/app/page.tsx` stores confirmed events only in local React state (`useState<AcademicEvent[]>([])`). **There is no `useEffect` or API endpoint to load saved events on page mount.** When a student reloads the page or logs in from another device, their planner displays zero events until they upload a new notice.

4. **AI RELIABILITY: Silent Document Truncation at 15,000 Characters:**  
   In `src/app/api/parse/route.ts` line 260, the extraction pipeline passes `extractedText.substring(0, 15000)` to the LLM. In typical 10–25 page syllabi, the actual exam schedules and deadlines are located at the end of the document. Any schedule appearing past character 15,000 is silently omitted from event extraction.

5. **AI ARCHITECTURE: Chat Copilot Route Hardcoded to Groq:**  
   While the extraction pipeline supports Gemini, Ollama, and Mock providers, `src/app/api/chat/route.ts` imports `@ai-sdk/groq` directly and hardcodes Groq. If an operator sets `LLM_PROVIDER=gemini`, the chat feature crashes or demands Groq API keys.

6. **SECURITY / SCALABILITY: In-Memory Rate Limiting in Serverless Context:**  
   `src/lib/security/rateLimit.ts` stores request timestamps in a local JavaScript `Map`. On serverless deployments (Vercel, AWS Lambda), state is not shared across lambda instances, allowing users or automated scripts to bypass rate limits by hitting different instances.

7. **UX / ACCESSIBILITY: Mock Fallbacks and Synchronous Browser Alerts:**  
   If `GET /api/memory` fails or is unauthenticated, `src/components/academic-memory-view.tsx` displays hardcoded mock records ("DBMS Syllabus") which fail when deleted. Furthermore, user notifications in `planner.tsx` rely on synchronous `alert()` popups rather than accessible UI toasts.

---

## 5. Top 10 Recommended Engineering Actions

| Rank | Issue ID | Action Item | Target File(s) | Severity / Priority |
| :---: | :---: | :--- | :--- | :---: |
| **1** | SEC-01 | Upgrade Next.js to `>=16.4.1` to eliminate Image Optimization RCE and unblock production build. | `package.json`, `pnpm-lock.yaml` | **Critical / P0** |
| **2** | SEC-02 | Upgrade `@sentry/nextjs` to `>=10.75.2` to patch Tunnel route middleware bypass. | `package.json`, `pnpm-lock.yaml` | **Critical / P0** |
| **3** | ARCH-01 | Create `GET /api/events` endpoint and add `useEffect` in `page.tsx` to restore persisted events upon user authentication. | `src/app/api/events/route.ts`, `src/app/page.tsx` | **High / P0** |
| **4** | AI-01 | Implement multi-chunk or map-reduce syllabus extraction in `/api/parse` to eliminate the 15,000-character ceiling. | `src/app/api/parse/route.ts` | **High / P1** |
| **5** | AI-02 | Refactor `src/app/api/chat/route.ts` to use provider abstraction layer instead of hardcoded Groq SDK. | `src/app/api/chat/route.ts` | **High / P1** |
| **6** | SEC-03 | Migrate in-memory rate limiter to Redis/Upstash or PostgreSQL advisory locks for serverless isolation. | `src/lib/security/rateLimit.ts` | **High / P1** |
| **7** | SEC-04 | Enforce CSRF / `Sec-Fetch-Site` checks when extracting auth tokens from browser cookies. | `src/lib/auth/server.ts` | **Medium / P1** |
| **8** | UI-01 | Replace hardcoded mock fallback in `academic-memory-view.tsx` with proper empty/unauthenticated error states. | `src/components/academic-memory-view.tsx` | **Medium / P2** |
| **9** | UI-02 | Replace browser `alert()` calls with accessible toast notifications and fix WCAG contrast ratios. | `src/components/planner.tsx`, `src/app/page.tsx` | **Medium / P2** |
| **10** | DATA-01 | Add cursor-based pagination and filter parameters to `/api/memory` and the new `/api/events` routes. | `src/app/api/memory/route.ts`, `src/components/academic-memory-view.tsx` | **Medium / P2** |

---

## 6. Audit Deliverables Index

Detailed domain-specific engineering investigations are documented in the following audit reports under `docs/audit/`:

- [Architecture Assessment](file:///d:/noticesync/docs/audit/ARCHITECTURE_REVIEW.md)
- [Code Quality & Bug Register](file:///d:/noticesync/docs/audit/CODE_QUALITY_AUDIT.md)
- [Security & Privacy Vulnerability Audit](file:///d:/noticesync/docs/audit/SECURITY_AUDIT.md)
- [AI, RAG & Document Processing Evaluation](file:///d:/noticesync/docs/audit/AI_RAG_AUDIT.md)
- [Dependency Upgrades & Modernization Report](file:///d:/noticesync/docs/audit/DEPENDENCY_UPGRADES.md)
- [Performance & Scalability Analysis](file:///d:/noticesync/docs/audit/PERFORMANCE_REVIEW.md)
- [Testing, CI/CD & Production Readiness](file:///d:/noticesync/docs/audit/TESTING_AND_CI_AUDIT.md)
- [Missing Features & Product Roadmap](file:///d:/noticesync/docs/audit/FEATURE_IMPROVEMENTS.md)
- [Prioritized Engineering Roadmap](file:///d:/noticesync/docs/audit/PRIORITIZED_ROADMAP.md)
- [Implementation Backlog](file:///d:/noticesync/docs/audit/IMPLEMENTATION_BACKLOG.md)
