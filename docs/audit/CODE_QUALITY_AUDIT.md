# NoticeSync — Code Quality, Bug & Edge-Case Audit

**Target Repository:** [NoticeSync](https://github.com/KatkamKoushik/NoticeSync)  
**Audit Branch:** `audit/repository-review-and-roadmap`  
**Date:** October 31, 2026  

---

## 1. Code Quality Overview

NoticeSync displays **high code discipline** in its type annotations, strict schema validations using Zod, and defensive security measures (such as UUID regex enforcement and log sanitization). The repository passes both `pnpm lint` and `pnpm typecheck` (`tsc --noEmit`) with **zero errors**.

However, detailed line-by-line inspection identified several **critical logic bugs, broken state lifecycles, and edge cases** that degrade the user experience and create operational fragility.

---

## 2. Confirmed Issue Register

### CQ-01 [CRITICAL]: Missing Initial Schedule Fetch in Main Application Shell
- **Severity:** Critical
- **Affected File:** [src/app/page.tsx](file:///d:/noticesync/src/app/page.tsx#L19-L50) (lines 19–50)
- **Technical Root Cause:**  
  In `src/app/page.tsx`, `confirmedEvents` is initialized as an empty React state array:
  ```tsx
  const [confirmedEvents, setConfirmedEvents] = useState<AcademicEvent[]>([]);
  ```
  While the `useEffect` on lines 31–49 listens to `supabase.auth.onAuthStateChange` to capture user credentials, **it never fetches previously saved academic events from the database**. Furthermore, there is no `GET /api/events` route anywhere in `src/app/api/`.
- **Evidence from Code:**  
  When `page.tsx` mounts, `confirmedEvents` is always empty `[]`. Events only appear when the user completes a new upload in that specific session. If the user reloads the browser, logs out and logs back in, or accesses the application from another device, their schedule disappears completely from the UI, even though records exist in the Supabase `academic_events` table.
- **User-Facing Impact:** Appears to the student as catastrophic data loss upon page refresh.
- **Recommended Fix:**  
  1. Create a `GET /api/events` endpoint that queries `academic_events` filtered by `auth.uid() = user_id`.
  2. In `src/app/page.tsx`, trigger a fetch inside the auth change listener when `session.user` is present to populate `confirmedEvents`.
- **Estimated Effort:** 2 hours.
- **Dependencies & Regression Risks:** Low risk. Ensure existing client components (`TodayView`, `TimelineView`, `WorkloadView`) handle hydration and initial loading gracefully.

---

### CQ-02 [HIGH]: 15,000-Character Silent Truncation in AI Extraction Pipeline
- **Severity:** High
- **Affected File:** [src/app/api/parse/route.ts](file:///d:/noticesync/src/app/api/parse/route.ts#L260-L263) (lines 260–263)
- **Technical Root Cause:**  
  In `POST /api/parse`:
  ```ts
  const textForAi = extractedText.substring(0, 15000);
  const rawEvents = await extractEventsWithSchemaRetry(textForAi);
  ```
  The full text is chunked and stored in `document_chunks` for vector retrieval, but **only the first 15,000 characters are passed to the event extraction model**.
- **Evidence from Code:**  
  A typical university syllabus or multi-page examination schedule runs 10 to 30 pages (approximately 30,000 to 100,000 characters). Syllabi universally place course policies, attendance requirements, and grading criteria at the beginning, while **the detailed weekly schedule, project milestones, and final exam timetable appear at the end**.
- **User-Facing Impact:** Syllabi exceeding 5–6 pages will fail to extract final exams, term papers, and late-semester deadlines, giving students a false sense of security that no deadlines exist.
- **Recommended Fix:**  
  Implement a sliding window, section splitter, or map-reduce extraction strategy:
  1. Split text into logical section chunks (e.g., 8,000 characters with 1,000 character overlap).
  2. Run extraction across chunks with bounded concurrency (`createConcurrencyLimiter(2)`).
  3. Aggregate extracted events and run deduplication via `computeEventDedupHash`.
- **Estimated Effort:** 4 hours.
- **Dependencies & Regression Risks:** Increases model token consumption for long documents; requires keeping token limits in mind.

---

### CQ-03 [MEDIUM]: Hardcoded Mock Fallback Data in Academic Memory View
- **Severity:** Medium
- **Affected File:** [src/components/academic-memory-view.tsx](file:///d:/noticesync/src/components/academic-memory-view.tsx#L26-L32) (lines 26–32)
- **Technical Root Cause:**  
  In `AcademicMemoryView`:
  ```tsx
  if (res.ok) {
    const data = await res.json();
    setDocuments(data.documents || []);
  } else {
    setDocuments([
      { id: '1', title: 'DBMS Syllabus', source_type: 'pdf', created_at: new Date().toISOString() },
      { id: '2', title: 'Circular August', source_type: 'image', created_at: new Date().toISOString() },
    ]);
  }
  ```
- **Evidence from Code:**  
  If the user is unauthenticated or the server returns an error (such as 401 Unauthorized or 500 Server Error), the component silently catches the failure and **renders fake static documents** with IDs `'1'` and `'2'`. If the user clicks the delete button for `'1'`, the client sends `DELETE /api/memory?id=1`. The API endpoint rejects `'1'` with a 400 Bad Request because `'1'` is not a valid UUID (`requireValidUuid`), and the fake card remains in the UI.
- **User-Facing Impact:** Confusing phantom data; unauthenticated users see mock files that cannot be interacted with or deleted.
- **Recommended Fix:**  
  Remove fake fallback documents. Display a clean empty state or an actionable error message indicating authentication is required.
- **Estimated Effort:** 30 minutes.
- **Dependencies & Regression Risks:** None.

---

### CQ-04 [MEDIUM]: Client-Side Timezone Display Inconsistencies
- **Severity:** Medium
- **Affected Files:**  
  - [src/components/attention-view.tsx](file:///d:/noticesync/src/components/attention-view.tsx#L29) (lines 29, 59)
  - [src/components/event-card.tsx](file:///d:/noticesync/src/components/event-card.tsx#L47) (lines 47, 84–101)
- **Technical Root Cause:**  
  Academic events store dates as ISO strings without timestamps: `YYYY-MM-DD` (e.g., `2026-08-25`). In `attention-view.tsx` line 29:
  ```ts
  return new Date(a.date).getTime() - new Date(b.date).getTime();
  ```
  And line 59:
  ```tsx
  {item.date ? new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}
  ```
- **Evidence from Code:**  
  In JavaScript, `new Date("2026-08-25")` parses the string as **UTC midnight**. When `.toLocaleDateString()` is invoked on a browser running in any Western hemisphere timezone (e.g., UTC-5 EST or UTC-8 PST), UTC midnight shifts backward into the previous evening, displaying as **August 24 instead of August 25**.
- **User-Facing Impact:** Students in timezones behind UTC may see their assignment or exam dates shifted backward by one day.
- **Recommended Fix:**  
  Consistently use `date-fns`'s `parseISO` or string splitting (already implemented in `src/lib/dates.ts`) rather than standard `new Date(string)` across all components.
- **Estimated Effort:** 1 hour.
- **Dependencies & Regression Risks:** Low; ensure existing date formatting tests remain green.

---

### CQ-05 [MEDIUM]: Stale Job Polling in `handleAddMore`
- **Severity:** Medium
- **Affected File:** [src/app/page.tsx](file:///d:/noticesync/src/app/page.tsx#L187-L193) (lines 187–193)
- **Technical Root Cause:**  
  In `handleAddMore`:
  ```tsx
  const handleAddMore = () => {
    setView('input');
    setStage('IDLE');
    setError(null);
    setExtractedEvents([]);
  };
  ```
  The function resets `view`, `stage`, `error`, and `extractedEvents`, but **fails to reset `activeJobId` to `null`**.
- **Evidence from Code:**  
  Because `activeJobId` is retained, the `useJobTracking` hook continues polling `GET /api/jobs?jobId=...` for the previous completed job in the background, consuming unnecessary client CPU and network bandwidth.
- **User-Facing Impact:** Unnecessary network requests; risk of job state confusion when uploading a second document.
- **Recommended Fix:**  
  Add `setActiveJobId(null);` to `handleAddMore`.
- **Estimated Effort:** 10 minutes.
- **Dependencies & Regression Risks:** None.

---

### CQ-06 [LOW]: Synchronous `window.alert` Calls Degrade UX and Accessibility
- **Severity:** Low
- **Affected Files:**  
  - [src/components/planner.tsx](file:///d:/noticesync/src/components/planner.tsx#L45) (line 45, 50)
  - [src/app/page.tsx](file:///d:/noticesync/src/app/page.tsx#L284) (line 284)
- **Technical Root Cause:**  
  Direct invocation of browser-native synchronous `alert(...)`:
  ```tsx
  if (confirmedEvents.length === 0) {
    alert('No confirmed events with exact dates to export. Please review and confirm events first.');
    return;
  }
  ```
- **Evidence from Code:**  
  Synchronous alerts freeze the main UI thread, cannot be styled to match the dark aesthetic, and are inaccessible to screen reader assistive technologies.
- **User-Facing Impact:** Jarring browser popups that break application immersion.
- **Recommended Fix:**  
  Introduce an accessible toast notification system (e.g., `sonner` or a lightweight React banner).
- **Estimated Effort:** 1 hour.
- **Dependencies & Regression Risks:** None.

---

### CQ-07 [LOW]: Data Model Inconsistency (`importance` vs `priority`)
- **Severity:** Low
- **Affected Files:**  
  - [src/lib/types.ts](file:///d:/noticesync/src/lib/types.ts#L13-L23) (lines 13–23)
  - [supabase/schema.sql](file:///d:/noticesync/supabase/schema.sql#L8-L59) (lines 8, 59)
  - [src/app/api/parse/route.ts](file:///d:/noticesync/src/app/api/parse/route.ts#L320-L327) (lines 320–327)
- **Technical Root Cause:**  
  In TypeScript, `AcademicEvent` defines:
  ```ts
  importance: 'low' | 'medium' | 'high';
  priority?: string;
  ```
  While the PostgreSQL schema defines:
  ```sql
  CREATE TYPE priority_level AS ENUM ('Critical', 'High', 'Medium', 'Low');
  ```
  In `parse/route.ts`, the server has to manually title-case `importance` to coerce it into the DB enum:
  ```ts
  const rawPriority = event.importance || 'Medium';
  const formattedPriority = String(rawPriority).charAt(0).toUpperCase() + String(rawPriority).slice(1).toLowerCase();
  ```
- **User-Facing Impact:** No functional crash currently, but creates cognitive friction for developers and risks runtime enum conversion failures.
- **Recommended Fix:**  
  Align TypeScript types and DB enums to a unified `priority: 'Critical' | 'High' | 'Medium' | 'Low'`.
- **Estimated Effort:** 1 hour.
- **Dependencies & Regression Risks:** Low; update Zod schemas and tests.

---

### CQ-08 [LOW]: Monolithic Single-Page UI Component (`src/app/page.tsx`)
- **Severity:** Low
- **Affected File:** [src/app/page.tsx](file:///d:/noticesync/src/app/page.tsx) (420 lines)
- **Technical Root Cause:**  
  `page.tsx` directly manages 4 disparate application phases (`'input'`, `'review'`, `'success'`, `'planner'`), handles all authentication state subscriptions, orchestrates demo mode switching, executes file submission dispatches, and coordinates video animation triggers.
- **User-Facing Impact:** Higher cognitive load when maintaining or extending UI flows; lack of URL routing prevents direct bookmarking of the planner view.
- **Recommended Fix:**  
  Extract distinct view controllers or utilize Next.js subroutes (`/`, `/review`, `/planner`) with shared layouts.
- **Estimated Effort:** 4 hours.
- **Dependencies & Regression Risks:** Medium; ensure view transitions remain smooth.

---

## 3. TypeScript Type Safety & Dead Code Audit

1. **Unsafe Casts (`as unknown as ...`):**  
   - In `src/lib/auth/server.ts` line 284: `createMockTestClient` uses `as unknown as SupabaseClient`. This is acceptable for test mocks, but should be strictly restricted to non-production code paths.
   - In `src/app/api/chat/route.ts` line 152: `as 'user' | 'assistant'` is cast without runtime enum validation. If an incoming message has an unexpected role, it is blindly coerced to `'user'`.
2. **Dead Code / Unused Artifacts:**  
   - `demo/generate-pdf.js`: Scratch script used to generate `sample-syllabus.pdf`. Should be documented or relocated under `scripts/`.
   - `public/custom_loading.mp4`: Unused 1.2MB video asset (the application uses `gemma__page-cover__gemma__dark__4k.webm` and an SVG astroid animation instead). Can be safely removed to reduce repository size.
