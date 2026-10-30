# NoticeSync — Performance, Latency & Scalability Review

**Target Repository:** [NoticeSync](https://github.com/KatkamKoushik/NoticeSync)  
**Audit Branch:** `audit/repository-review-and-roadmap`  
**Date:** October 31, 2026  

---

## 1. Frontend Performance & Client Component Boundaries

### 1. Monolithic Client Bundle (`src/app/page.tsx`)
- **Analysis:** `src/app/page.tsx` is marked with `'use client'` and directly imports:
  - `OmniInput`
  - `ReviewEvent`
  - `Planner` (which in turn imports `TodayView`, `TimelineView`, `WorkloadView`, `AcademicBrief`, `AttentionView`, `AskNoticeSync`, and `AcademicMemoryView`)
  - `AIBackground`
  - Supabase client, Lucide icons, and state hooks
- **Finding:** All four application views (`input`, `review`, `success`, `planner`), as well as the streaming chat copilot, are bundled into the initial client chunk loaded on the homepage.
- **Performance Impact:** On mobile networks, initial JavaScript bundle download and hydration latency are increased unnecessarily for visitors who only need the input screen.
- **Optimization:** Use Next.js dynamic imports (`next/dynamic`) with loading fallbacks for heavier deferred components:
  ```tsx
  const Planner = dynamic(() => import('@/components/planner'), { ssr: false });
  const ReviewEvent = dynamic(() => import('@/components/review-event'), { ssr: false });
  const AskNoticeSync = dynamic(() => import('@/components/ask-noticesync'), { ssr: false });
  ```

### 2. High-Resolution Video Background (`public/gemma__page-cover__gemma__dark__4k.webm`)
- **Analysis:** `src/components/ai-background.tsx` autoplays a 4K WebM video asset in the background:
  ```tsx
  <video autoPlay muted loop playsInline className="...">
    <source src="/gemma__page-cover__gemma__dark__4k.webm" type="video/webm" />
  </video>
  ```
- **Performance Impact:**  
  1. High memory and GPU decoding overhead on lower-end mobile devices and laptops on battery saver mode.
  2. Substantial initial network bandwidth consumption if browser caches are empty.
  3. Lack of `@media (prefers-reduced-motion: reduce)` support.
- **Optimization:**  
  - Provide a responsive 1080p/720p fallback or optimized compressed format.
  - Check `prefers-reduced-motion` and substitute a static poster image (`public/videoframe_2017.png`) for users requesting reduced motion or on mobile data connections.

---

## 2. Ingestion Pipeline Latency & Bottlenecks

### Latency Profile Across Stages:

| Stage | Subsystem | Typical Latency | Bottleneck Risk | Mitigation Implemented |
| :--- | :--- | :---: | :---: | :--- |
| **Magic Byte Check** | Native Buffer inspection | < 1 ms | None | Instant rejection of invalid files |
| **PDF Extraction** | `pdf-parse` (Node.js) | 150 – 800 ms | Medium (large/scanned PDFs) | 15s timeout via `withTimeout` |
| **Image OCR** | `tesseract.js` (Wasm/Worker) | 3,000 – 18,000 ms | **High** (CPU bound) | 25s timeout via `withTimeout` |
| **Chunking & Hashing**| SHA-256 + Regex Chunker | 5 – 20 ms | None | Fast deterministic compute |
| **Vector Embeddings** | Google Embedding API | 400 – 1,200 ms | Medium (network fan-out) | `createConcurrencyLimiter(3)` + retry |
| **AI Extraction** | Groq / Gemini API | 800 – 2,500 ms | Medium (token generation) | Temperature 0.1, max 4096 tokens |
| **Memory Reasoning** | RAG hybrid retrieval + LLM | 1,200 – 3,500 ms | **High** (multi-turn reasoning) | `createConcurrencyLimiter(2)` |
| **Database Upsert** | Supabase PostgreSQL | 100 – 300 ms | Low | Composite unique index upsert |

### Key Scalability Recommendations:
1. **Asynchronous Worker Decoupling:**  
   Currently, `POST /api/parse` performs all steps within the HTTP request handler. While acceptable for text and short PDFs, large documents (10MB PDFs or multi-page OCR) can exceed the 15–30s execution timeouts imposed by serverless hosting providers (e.g., Vercel Functions).  
   *Recommendation:* Return a `202 Accepted` response with the `jobId` immediately after uploading, and execute ingestion asynchronously in background jobs (e.g., using Inngest, BullMQ, or Supabase Edge Functions).
2. **HNSW Vector Index Optimization:**  
   In `supabase/schema.sql`:
   ```sql
   CREATE INDEX ON public.document_chunks USING hnsw (embedding vector_cosine_ops);
   ```
   *Recommendation:* Tune the HNSW index parameters for optimal recall vs latency trade-offs:
   ```sql
   CREATE INDEX ON public.document_chunks USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```
   At query time in `match_document_chunks`:
   ```sql
   SET LOCAL hnsw.ef_search = 40;
   ```

---

## 3. Caching & Query Optimization

1. **Academic Memory Caching:**  
   `GET /api/memory` queries the `documents` table every time the Memory tab is clicked. Implementing React Query (`@tanstack/react-query`) or SWR with a 60-second `staleTime` will eliminate redundant database requests.
2. **Hybrid Search Lexical Pre-Filter:**  
   In `src/lib/rag/storage.ts`, `retrieveRelevantChunks` retrieves `matchCount * 2` vector candidates from PostgreSQL, then computes lexical overlap in Node.js. For larger corpora (>10,000 chunks per institution), combining PostgreSQL full-text search (`tsvector` / `websearch_to_tsquery`) directly inside PostgreSQL via a hybrid SQL function will reduce network payload and query latency.
