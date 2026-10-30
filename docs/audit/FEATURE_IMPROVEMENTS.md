# NoticeSync — Missing Features & Product Improvements

**Target Repository:** [NoticeSync](https://github.com/KatkamKoushik/NoticeSync)  
**Audit Branch:** `audit/repository-review-and-roadmap`  
**Date:** October 31, 2026  

---

## 1. Feature Classification Framework

Every proposed feature is evaluated against NoticeSync's primary mission: **transforming scattered, chaotic college notices and syllabi into an accurate, conflict-aware, reliable academic plan with minimal manual overhead**.

Categories:
- **Essential Missing Functionality:** Required for the application to function as intended across user sessions.
- **Reliability Enhancement:** Hardens the system against edge cases, large inputs, and operational failure modes.
- **UX & Accessibility Enhancement:** Improves student workflow, readability, and WCAG compliance.
- **Scalability Enhancement:** Enables the application to scale across thousands of concurrent users and larger documents.
- **Optional Future Innovation:** Advanced value-add capabilities for future product phases.

---

## 2. Feature Proposals Register

### Category A: Essential Missing Functionality

#### FEAT-01: Persistent Schedule Loading on App Mount (`GET /api/events`)
- **Category:** Essential Missing Functionality
- **Description:** Currently, confirmed events are stored in Supabase, but the frontend only retains them in React memory (`useState`). When a student refreshes their browser or logs in from another laptop/phone, their schedule displays 0 events.
- **Implementation Strategy:**  
  1. Create `GET /api/events` endpoint with JWT authentication and user-scoped query:
     ```ts
     const { data: events } = await db
       .from('academic_events')
       .select('*')
       .eq('user_id', userId)
       .neq('status', 'removed')
       .order('date', { ascending: true });
     ```
  2. In `src/app/page.tsx`, trigger `fetchWithAuth('/api/events')` inside the `onAuthStateChange` listener and populate `confirmedEvents`.
- **Expected Value:** Restores core product utility: students can actually use NoticeSync as their persistent daily academic planner.

#### FEAT-02: Multi-Chunk Map-Reduce Extraction for Large Syllabi
- **Category:** Essential Missing Functionality / Reliability
- **Description:** The current pipeline extracts events only from the first 15,000 characters of a document. University syllabi often place exam routines and weekly schedules on pages 6–15 (well past character 15,000).
- **Implementation Strategy:**  
  1. For documents exceeding 12,000 characters, partition text into overlapping semantic sections (e.g., 8,000 chars with 1,000 char overlap).
  2. Run event extraction across sections with bounded concurrency (`createConcurrencyLimiter(2)`).
  3. Aggregate events and deduplicate using `computeEventDedupHash`.
- **Expected Value:** Guarantees 100% extraction coverage across full 20+ page syllabi.

---

### Category B: Reliability Enhancements

#### FEAT-03: Asynchronous Background Ingestion via Background Jobs / Edge Functions
- **Category:** Reliability & Scalability Enhancement
- **Description:** In serverless deployments (Vercel, AWS Lambda), synchronous HTTP requests are terminated if they exceed 10–30 seconds. Heavy image OCR (Tesseract) and multi-turn LLM reasoning can exceed this timeout.
- **Implementation Strategy:**  
  1. Move ingestion execution to a dedicated background task queue (Inngest, BullMQ, or Supabase Edge Functions).
  2. `POST /api/parse` validates file headers, creates a document record and a job record, dispatches the background task, and returns `202 Accepted` with `{ jobId }` immediately.
  3. The client relies on `useJobTracking` (Realtime WebSocket + polling) to receive progress updates and fetch the completed events upon transition to `status: 'completed'`.
- **Expected Value:** Eliminates HTTP 504 Gateway Timeout errors; allows seamless processing of 10MB PDFs and complex image scans.

#### FEAT-04: Distributed Rate Limiting via Redis / Upstash
- **Category:** Reliability Enhancement
- **Description:** Replace the in-memory JavaScript Map in `src/lib/security/rateLimit.ts` with a distributed rate limiter.
- **Implementation Strategy:** Integrate `@upstash/ratelimit` with Redis REST connection to enforce sliding-window quotas consistently across all serverless lambda instances.
- **Expected Value:** Prevents malicious API exhaustion and ensures budget predictability.

---

### Category C: UX & Accessibility Enhancements

#### FEAT-05: Accessible In-App Toast Notification System
- **Category:** UX Enhancement
- **Description:** Replace jarring synchronous browser `window.alert()` calls in `src/components/planner.tsx` and `src/app/page.tsx` with smooth, accessible in-app toast banners (using `sonner` or lightweight Tailwind components).
- **Expected Value:** Improves UI polish, eliminates thread freezing, and supports screen reader announcements.

#### FEAT-06: Direct Calendar Sync (Google Calendar & Microsoft Outlook OAuth)
- **Category:** UX Enhancement
- **Description:** Currently, calendar export is limited to downloading a static `.ics` file. Students want their academic schedule to automatically populate and update inside Google Calendar or Microsoft Outlook.
- **Implementation Strategy:**  
  1. Add Google Calendar API and Microsoft Graph API OAuth integration.
  2. Provide a "Sync to Google Calendar" button that creates or updates a dedicated "NoticeSync" calendar on the student's Google account.
- **Expected Value:** Seamless, automatic calendar updates without manual `.ics` file importing.

#### FEAT-07: Motion Accessibility & Dark Mode Theme Refinement
- **Category:** Accessibility & UX Enhancement
- **Description:**  
  1. Add `@media (prefers-reduced-motion: reduce)` support to `src/components/ai-background.tsx` to pause or replace the autoplaying 4K WebM video with a static poster image.
  2. Adjust text contrast for secondary text (`#64748b`) against `#121317` to achieve a 4.5:1 ratio, satisfying WCAG 2.1 AA standards.
- **Expected Value:** Certified accessibility for students with visual or vestibular sensitivities.

---

### Category D: Scalability Enhancements

#### FEAT-08: Cursor-Based Pagination for Document Memory & Academic Events
- **Category:** Scalability Enhancement
- **Description:** Currently, `GET /api/memory` enforces a hard `.limit(50)` without pagination. Over multiple academic semesters, students will accumulate hundreds of documents.
- **Implementation Strategy:** Add cursor-based pagination parameters (`cursor`, `limit`, `sort`) to `/api/memory` and the new `/api/events` endpoint, backed by indexed `created_at` or `date` columns.
- **Expected Value:** Stable, sub-50ms database queries regardless of total historical documents.

---

### Category E: Optional Future Innovations

#### FEAT-09: Automated Course Workload Density Forecasting
- **Category:** Optional Future Innovation
- **Description:** Analyze overlapping exam weeks and project deadlines to generate an intelligent "Study Prep Roadmap", suggesting specific dates when revision should begin based on deadline strictness and credits.
- **Expected Value:** Elevates NoticeSync from a passive notice reader to a proactive academic success coach.

#### FEAT-10: WhatsApp / Telegram Notice Ingestion Bot
- **Category:** Optional Future Innovation
- **Description:** In many universities (particularly in India and Southeast Asia), academic circulars are distributed via class WhatsApp or Telegram groups. Allow students to forward circular PDFs or screenshot images to a verified NoticeSync bot, which automatically digests the notice into their personal planner.
- **Expected Value:** Frictionless notice capture directly where students receive information.
