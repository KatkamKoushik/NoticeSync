# NoticeSync — Implementation-Ready Engineering Backlog

**Target Repository:** [NoticeSync](https://github.com/KatkamKoushik/NoticeSync)  
**Audit Branch:** `audit/repository-review-and-roadmap`  
**Date:** October 31, 2026  

---

## Task Index

- [TASK-SEC-01: Upgrade Next.js to Unblock Production Build and Patch SVG RCE](#task-sec-01-upgrade-nextjs-to-unblock-production-build-and-patch-svg-rce)
- [TASK-SEC-02: Upgrade @sentry/nextjs to Patch Tunnel Route Middleware Bypass](#task-sec-02-upgrade-sentrynextjs-to-patch-tunnel-route-middleware-bypass)
- [TASK-ARCH-01: Create GET /api/events Endpoint for User-Scoped Schedule Retrieval](#task-arch-01-create-get-apievents-endpoint-for-user-scoped-schedule-retrieval)
- [TASK-ARCH-02: Implement Persistent Schedule Hydration on App Shell Mount](#task-arch-02-implement-persistent-schedule-hydration-on-app-shell-mount)
- [TASK-AI-01: Implement Multi-Chunk Map-Reduce Extraction for Large Syllabi](#task-ai-01-implement-multi-chunk-map-reduce-extraction-for-large-syllabi)
- [TASK-AI-02: Decouple Chat Copilot Route to Support Full Provider Parity](#task-ai-02-decouple-chat-copilot-route-to-support-full-provider-parity)
- [TASK-SEC-03: Implement Distributed Sliding-Window Rate Limiting](#task-sec-03-implement-distributed-sliding-window-rate-limiting)
- [TASK-SEC-04: Enforce Same-Origin Verification on Cookie Auth Extractions](#task-sec-04-enforce-same-origin-verification-on-cookie-auth-extractions)
- [TASK-UI-01: Remove Hardcoded Mock Records in Academic Memory View](#task-ui-01-remove-hardcoded-mock-records-in-academic-memory-view)
- [TASK-UI-02: Replace Synchronous Browser Alerts with Accessible Toast System](#task-ui-02-replace-synchronous-browser-alerts-with-accessible-toast-system)
- [TASK-UI-03: Eliminate UTC Date Timezone Off-by-One Shifting](#task-ui-03-eliminate-utc-date-timezone-off-by-one-shifting)
- [TASK-A11Y-01: Form Labeling and Motion Accessibility Hardening](#task-a11y-01-form-labeling-and-motion-accessibility-hardening)
- [TASK-PERF-01: Implement Dynamic Component Code-Splitting for Deferred Views](#task-perf-01-implement-dynamic-component-code-splitting-for-deferred-views)
- [TASK-DATA-01: Add Cursor-Based Pagination to Document and Event Routes](#task-data-01-add-cursor-based-pagination-to-document-and-event-routes)

---

### TASK-SEC-01: Upgrade Next.js to Unblock Production Build and Patch SVG RCE
| Field | Specification |
| :--- | :--- |
| **ID** | `SEC-01` |
| **Priority** | **P0 (Critical)** |
| **Category** | Security / Production Blocker |
| **Title** | Upgrade `next` dependency to `>=16.4.1` to resolve Image Optimization RCE |
| **Evidence** | `pnpm build` output: `Error [SecurityFatalError]: Your version of Next.js is affected by a known security vulnerability (RCE in Image Optimization API when SVG files are used).` |
| **Affected Files** | `package.json`, `pnpm-lock.yaml` |
| **Problem** | Next.js 16.4.0 halts production builds with exit code 1 to protect against an unauthenticated remote code execution vulnerability when handling SVG images. |
| **Proposed Solution** | Update `package.json` dependency `"next": "^16.4.1"` and run `pnpm install`. |
| **Expected Benefit** | Unblocks production compilation and eliminates host container compromise vulnerability. |
| **Complexity** | Low |
| **Estimated Effort**| 30 minutes |
| **Dependencies** | None |
| **Risk** | Minor; patch release within Next.js 16 major version. |
| **Acceptance Criteria** | `pnpm build` completes with exit code 0; all pages and API routes generate static/dynamic artifacts successfully. |
| **Tests** | Run `pnpm build` and verify production output. |
| **Status** | Proposed |

---

### TASK-SEC-02: Upgrade @sentry/nextjs to Patch Tunnel Route Middleware Bypass
| Field | Specification |
| :--- | :--- |
| **ID** | `SEC-02` |
| **Priority** | **P0 (Critical)** |
| **Category** | Security / Compliance |
| **Title** | Upgrade `@sentry/nextjs` to `>=10.75.2` |
| **Evidence** | `pnpm audit:deps` reports GHSA-mchm-gjx6-7h55 (`Sentry-Javascript: Middleware Bypass when using Tunnel route`, CVSS 9.1). |
| **Affected Files** | `package.json`, `pnpm-lock.yaml` |
| **Problem** | Sentry tunnel route allows crafted HTTP requests to bypass Next.js route protection. |
| **Proposed Solution** | Update `package.json` to `"@sentry/nextjs": "^10.75.2"` and run `pnpm install`. |
| **Expected Benefit** | Eliminates middleware bypass vulnerability and satisfies GitHub Actions CI security audit. |
| **Complexity** | Low |
| **Estimated Effort**| 30 minutes |
| **Dependencies** | `SEC-01` |
| **Risk** | Low; maintain existing `sentry.client.config.ts` and `sentry.server.config.ts`. |
| **Acceptance Criteria** | `pnpm audit --prod --audit-level=high` reports 0 high/critical vulnerabilities. |
| **Tests** | Run `pnpm audit:deps`. |
| **Status** | Proposed |

---

### TASK-ARCH-01: Create GET /api/events Endpoint for User-Scoped Schedule Retrieval
| Field | Specification |
| :--- | :--- |
| **ID** | `ARCH-01` |
| **Priority** | **P0 (Critical)** |
| **Category** | Architecture / Backend |
| **Title** | Implement `GET /api/events` endpoint to query confirmed academic events |
| **Evidence** | `academic_events` table contains student records in Supabase, but no API route exists to read them. `src/app/api/` contains only `brief`, `chat`, `jobs`, `memory`, `parse`. |
| **Affected Files** | `src/app/api/events/route.ts` (new file) |
| **Problem** | Frontend cannot fetch previously saved academic events for authenticated users. |
| **Proposed Solution** | Create `src/app/api/events/route.ts` using `getAuthenticatedUser(req)`. Query `academic_events` scoped to `userClient` with `auth.uid() = user_id`, filtering out `status = 'removed'`, ordered by `date ASC`. |
| **Expected Benefit** | Provides foundational REST interface for schedule persistence across user sessions. |
| **Complexity** | Low |
| **Estimated Effort**| 1.5 hours |
| **Dependencies** | None |
| **Risk** | None; new isolated endpoint. |
| **Acceptance Criteria** | Authenticated GET returns array of user's confirmed events. Unauthenticated GET returns 401. Cross-user access returns empty array. |
| **Tests** | Add unit/integration test in `tests/api/api-routes.test.ts`. |
| **Status** | Proposed |

---

### TASK-ARCH-02: Implement Persistent Schedule Hydration on App Shell Mount
| Field | Specification |
| :--- | :--- |
| **ID** | `ARCH-02` |
| **Priority** | **P0 (Critical)** |
| **Category** | Frontend / Bug Fix |
| **Title** | Fetch and hydrate `confirmedEvents` state upon student authentication |
| **Evidence** | `src/app/page.tsx` lines 19–50: `useState<AcademicEvent[]>([])` is never populated from the database upon mount. |
| **Affected Files** | `src/app/page.tsx` |
| **Problem** | When a student refreshes their browser or logs in from another device, their planner displays 0 events. |
| **Proposed Solution** | In `src/app/page.tsx`, trigger `fetchWithAuth('/api/events')` inside the `supabase.auth.onAuthStateChange` handler when `session.user` is present, populating `confirmedEvents` and switching to `'planner'` view if events exist. |
| **Expected Benefit** | Restores true calendar utility; student schedules persist indefinitely across sessions. |
| **Complexity** | Medium |
| **Estimated Effort**| 2 hours |
| **Dependencies** | `ARCH-01` |
| **Risk** | Ensure smooth loading transition without UI flickering. |
| **Acceptance Criteria** | Logging in or refreshing the page immediately displays previously confirmed academic events. |
| **Tests** | Add E2E test verifying schedule persistence across browser reloads. |
| **Status** | Proposed |

---

### TASK-AI-01: Implement Multi-Chunk Map-Reduce Extraction for Large Syllabi
| Field | Specification |
| :--- | :--- |
| **ID** | `AI-01` |
| **Priority** | **P1 (High)** |
| **Category** | AI / Data Extraction |
| **Title** | Remove 15,000-character ceiling by implementing section-based map-reduce extraction |
| **Evidence** | `src/app/api/parse/route.ts` line 260: `const textForAi = extractedText.substring(0, 15000);`. Syllabi exceeding 5 pages have final exam routines silently truncated. |
| **Affected Files** | `src/app/api/parse/route.ts`, `src/lib/ai.ts` |
| **Problem** | Late-semester academic deadlines located on later pages are never sent to the LLM. |
| **Proposed Solution** | For documents over 12,000 characters, split text into 8,000-character section windows with 1,000-character overlap. Run extraction with bounded concurrency (`createConcurrencyLimiter(2)`), aggregate raw events, and deduplicate with `computeEventDedupHash`. |
| **Expected Benefit** | 100% extraction coverage across 20+ page syllabi. |
| **Complexity** | Medium |
| **Estimated Effort**| 4 hours |
| **Dependencies** | None |
| **Risk** | Moderately higher token consumption for very large documents; bounded concurrency prevents rate-limiting spikes. |
| **Acceptance Criteria** | Uploading `sample-syllabus.pdf` (or multi-page syllabus) extracts events from all pages, including the final exam schedule. |
| **Tests** | Create integration test with 30,000-character fixture in `tests/ingestion/chunking.test.ts`. |
| **Status** | Proposed |

---

### TASK-AI-02: Decouple Chat Copilot Route to Support Full Provider Parity
| Field | Specification |
| :--- | :--- |
| **ID** | `AI-02` |
| **Priority** | **P1 (High)** |
| **Category** | AI Architecture |
| **Title** | Refactor `POST /api/chat` to use active provider abstraction instead of hardcoded Groq |
| **Evidence** | `src/app/api/chat/route.ts` line 2: `import { createGroq } from '@ai-sdk/groq';`. Line 158: `createGroq(...)`. Setting `LLM_PROVIDER=gemini` or `LLM_PROVIDER=ollama` has no effect on chat. |
| **Affected Files** | `src/app/api/chat/route.ts`, `src/lib/providers/index.ts` |
| **Problem** | Operator or user configuring Gemini or local Ollama cannot use the chat copilot without Groq keys. |
| **Proposed Solution** | Dynamically initialize the streaming language model using `@ai-sdk/google` when `LLM_PROVIDER=gemini`, local Ollama when `LLM_PROVIDER=ollama`, and `@ai-sdk/groq` as default. |
| **Expected Benefit** | Seamless operation with Google Gemini and local offline inference in chat copilot. |
| **Complexity** | Medium |
| **Estimated Effort**| 3 hours |
| **Dependencies** | None |
| **Risk** | Verify streaming response formatting remains compatible with `@ai-sdk/react`. |
| **Acceptance Criteria** | `POST /api/chat` streams valid answers when `LLM_PROVIDER=gemini` and only Google API keys are set. |
| **Tests** | Update `tests/chat/chat-grounding.test.ts` to test provider switching. |
| **Status** | Proposed |

---

### TASK-SEC-03: Implement Distributed Sliding-Window Rate Limiting
| Field | Specification |
| :--- | :--- |
| **ID** | `SEC-03` |
| **Priority** | **P1 (High)** |
| **Category** | Security & Scalability |
| **Title** | Migrate in-memory rate limiting to distributed Redis / Upstash backend |
| **Evidence** | `src/lib/security/rateLimit.ts` line 14: `const store = new Map<string, RateLimitRecord>();`. Serverless instances do not share memory. |
| **Affected Files** | `src/lib/security/rateLimit.ts` |
| **Problem** | Users can bypass rate limits in serverless deployments by hitting multiple lambda instances concurrently. |
| **Proposed Solution** | Introduce `@upstash/ratelimit` adapter with fallback to local in-memory Map in test/offline environments (`NOTICE_SYNC_TEST_MODE=true`). |
| **Expected Benefit** | Consistent quota enforcement across all serverless regions and instances. |
| **Complexity** | Medium |
| **Estimated Effort**| 3 hours |
| **Dependencies** | None |
| **Risk** | Requires optional `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.example`. |
| **Acceptance Criteria** | Rate limit quotas strictly enforced across parallel simulated client instances. |
| **Tests** | Run `tests/security/rate-limiting.test.ts`. |
| **Status** | Proposed |

---

### TASK-SEC-04: Enforce Same-Origin Verification on Cookie Auth Extractions
| Field | Specification |
| :--- | :--- |
| **ID** | `SEC-04` |
| **Priority** | **P1 (High)** |
| **Category** | Security |
| **Title** | Enforce `Sec-Fetch-Site: same-origin` or explicit Bearer tokens to mitigate CSRF |
| **Evidence** | `src/lib/auth/server.ts` lines 37–70: extracts auth tokens from `Cookie` header without verifying request origin. |
| **Affected Files** | `src/lib/auth/server.ts` |
| **Problem** | Cross-site requests from external web pages carrying ambient cookies could trigger state modifications. |
| **Proposed Solution** | On mutating methods (`POST`, `DELETE`, `PUT`), if the token was extracted from a cookie rather than `Authorization: Bearer`, verify that `req.headers.get('sec-fetch-site') === 'same-origin'` or `origin` matches the host. |
| **Expected Benefit** | Guarantees complete CSRF immunity for cookie-authenticated sessions. |
| **Complexity** | Low |
| **Estimated Effort**| 1.5 hours |
| **Dependencies** | None |
| **Risk** | Low; legitimate same-origin requests naturally send `Sec-Fetch-Site: same-origin`. |
| **Acceptance Criteria** | Cross-origin POST/DELETE using cookies is rejected with 403 Forbidden. |
| **Tests** | Add CSRF defense test in `tests/security/auth-enforcement.test.ts`. |
| **Status** | Proposed |

---

### TASK-UI-01: Remove Hardcoded Mock Records in Academic Memory View
| Field | Specification |
| :--- | :--- |
| **ID** | `UI-01` |
| **Priority** | **P1 (High)** |
| **Category** | UX / Bug Fix |
| **Title** | Replace fake static documents in `AcademicMemoryView` with proper error state |
| **Evidence** | `src/components/academic-memory-view.tsx` lines 27–31: injects fake records `{ id: '1', title: 'DBMS Syllabus' }` when API fails. |
| **Affected Files** | `src/components/academic-memory-view.tsx` |
| **Problem** | Unauthenticated students or network failures render undeletable phantom files. |
| **Proposed Solution** | Remove the hardcoded array. Display an empty state or a button prompting the user to sign in or upload a document. |
| **Expected Benefit** | Clean, truthful UI; prevents invalid UUID deletion requests to the backend. |
| **Complexity** | Low |
| **Estimated Effort**| 30 minutes |
| **Dependencies** | None |
| **Risk** | None. |
| **Acceptance Criteria** | An error or empty response shows a clean placeholder message with no fake documents. |
| **Tests** | Manual inspection and unit test. |
| **Status** | Proposed |

---

### TASK-UI-02: Replace Synchronous Browser Alerts with Accessible Toast System
| Field | Specification |
| :--- | :--- |
| **ID** | `UI-02` |
| **Priority** | **P2 (Medium)** |
| **Category** | UX & Accessibility |
| **Title** | Replace `window.alert()` with accessible toast notification system |
| **Evidence** | `src/components/planner.tsx` lines 45, 50; `src/app/page.tsx` line 284. |
| **Affected Files** | `src/components/planner.tsx`, `src/app/page.tsx` |
| **Problem** | Browser `alert()` freezes the UI thread and is inaccessible to screen readers. |
| **Proposed Solution** | Integrate lightweight accessible toast component (or `sonner`) to display feedback. |
| **Expected Benefit** | Non-blocking, beautiful dark-mode notifications compatible with WCAG standards. |
| **Complexity** | Low |
| **Estimated Effort**| 1.5 hours |
| **Dependencies** | None |
| **Risk** | None. |
| **Acceptance Criteria** | Empty export or invalid action displays a smooth toast alert without blocking browser execution. |
| **Tests** | Visual and accessibility inspection. |
| **Status** | Proposed |

---

### TASK-UI-03: Eliminate UTC Date Timezone Off-by-One Shifting
| Field | Specification |
| :--- | :--- |
| **ID** | `UI-03` |
| **Priority** | **P2 (Medium)** |
| **Category** | Bug Fix / UX |
| **Title** | Use `date-fns/parseISO` consistently across all components to eliminate date shifting |
| **Evidence** | `src/components/attention-view.tsx` lines 29, 59; `src/components/event-card.tsx` line 47. |
| **Affected Files** | `src/components/attention-view.tsx`, `src/components/event-card.tsx` |
| **Problem** | `new Date("YYYY-MM-DD")` evaluates at UTC midnight, displaying as the previous calendar day in timezones behind UTC (e.g. EST/PST). |
| **Proposed Solution** | Import and use `formatEventDate` from `src/lib/dates.ts` across all components. |
| **Expected Benefit** | Academic dates display consistently regardless of student's physical geographical location. |
| **Complexity** | Low |
| **Estimated Effort**| 1 hour |
| **Dependencies** | None |
| **Risk** | None. |
| **Acceptance Criteria** | Dates render accurately when tested under both UTC+5:30 and UTC-8:00 locale environments. |
| **Tests** | Verify with timezone-skewed unit test. |
| **Status** | Proposed |

---

### TASK-A11Y-01: Form Labeling and Motion Accessibility Hardening
| Field | Specification |
| :--- | :--- |
| **ID** | `A11Y-01` |
| **Priority** | **P2 (Medium)** |
| **Category** | Accessibility (WCAG 2.1 AA) |
| **Title** | Add explicit form labels and `prefers-reduced-motion` video background controls |
| **Evidence** | `src/components/review-event.tsx` form inputs lack `<label>` tags; `src/components/ai-background.tsx` lacks reduced-motion media query handling. |
| **Affected Files** | `src/components/review-event.tsx`, `src/components/ai-background.tsx`, `src/components/omni-input.tsx` |
| **Problem** | Fails automated WCAG accessibility audits; can trigger motion discomfort for vestibular disorder sufferers. |
| **Proposed Solution** | Add `aria-label` or `<label>` elements to inputs; handle `prefers-reduced-motion` in CSS to pause video and substitute poster image. Allow keyboard `Space` to open file dialog. |
| **Expected Benefit** | Achieves WCAG 2.1 AA compliance score >= 95. |
| **Complexity** | Low |
| **Estimated Effort**| 2 hours |
| **Dependencies** | None |
| **Risk** | None. |
| **Acceptance Criteria** | Screen readers announce form input names; enabling reduced-motion in OS settings halts background video playback. |
| **Tests** | Run axe accessibility scanner. |
| **Status** | Proposed |

---

### TASK-PERF-01: Implement Dynamic Component Code-Splitting for Deferred Views
| Field | Specification |
| :--- | :--- |
| **ID** | `PERF-01` |
| **Priority** | **P2 (Medium)** |
| **Category** | Performance |
| **Title** | Lazy-load `Planner`, `ReviewEvent`, and `AskNoticeSync` via `next/dynamic` |
| **Evidence** | `src/app/page.tsx` imports all sub-views statically, including large Lucide icon bundles and chat components. |
| **Affected Files** | `src/app/page.tsx` |
| **Problem** | Increases initial JavaScript bundle download and hydration overhead on mobile devices. |
| **Proposed Solution** | Use `dynamic(() => import('@/components/planner'), { ssr: false })` for views not visible on initial load. |
| **Expected Benefit** | Decreases initial page load bundle size by ~35%. |
| **Complexity** | Low |
| **Estimated Effort**| 1.5 hours |
| **Dependencies** | None |
| **Risk** | Low; supply minimal skeleton loading states. |
| **Acceptance Criteria** | Lighthouse performance score improves on mobile profile. |
| **Tests** | Analyze bundle output via `next build`. |
| **Status** | Proposed |

---

### TASK-DATA-01: Add Cursor-Based Pagination to Document and Event Routes
| Field | Specification |
| :--- | :--- |
| **ID** | `DATA-01` |
| **Priority** | **P2 (Medium)** |
| **Category** | Database & Scalability |
| **Title** | Implement cursor-based pagination for `/api/memory` and `/api/events` |
| **Evidence** | `src/app/api/memory/route.ts` line 27: `.limit(50)` without pagination parameters. |
| **Affected Files** | `src/app/api/memory/route.ts`, `src/app/api/events/route.ts`, `src/components/academic-memory-view.tsx` |
| **Problem** | Students who accumulate >50 circulars cannot view older documents. |
| **Proposed Solution** | Add `cursor` (created_at ISO string) and `limit` query parameters with `next_cursor` in JSON response. |
| **Expected Benefit** | Constant O(1) database index seek time regardless of total document count. |
| **Complexity** | Medium |
| **Estimated Effort**| 3 hours |
| **Dependencies** | `ARCH-01` |
| **Risk** | Low. |
| **Acceptance Criteria** | Querying `/api/memory?limit=10` returns first 10 documents and `nextCursor`. |
| **Tests** | Add pagination unit tests. |
| **Status** | Proposed |
