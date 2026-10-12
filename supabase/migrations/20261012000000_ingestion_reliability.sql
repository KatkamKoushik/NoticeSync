-- NoticeSync Ingestion Reliability & Idempotency Migration
-- Date: 2026-10-12
-- Description:
-- 1. Adds 'partial_success' status to job_status enum for diagnosable partial completions.
-- 2. Adds idempotency keys to processing_jobs to deduplicate job submissions.
-- 3. Adds content_hash to documents to prevent duplicate document insertions on retries.
-- 4. Enforces (document_id, chunk_index) uniqueness on document_chunks to guarantee retry safety.
-- 5. Adds dedup_hash to academic_events to prevent duplicate event persistence on retried reasoning.

-- Step 1: Extend job_status enum with 'partial_success'
DO $$
BEGIN
    ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'partial_success';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add idempotency_key to processing_jobs
ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_jobs_user_idempotency
  ON public.processing_jobs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Step 3: Add content_hash to documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_user_content_hash
  ON public.documents(user_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- Step 4: Add unique constraint on document_chunks(document_id, chunk_index)
ALTER TABLE public.document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_doc_chunk_unique;

ALTER TABLE public.document_chunks
  ADD CONSTRAINT document_chunks_doc_chunk_unique UNIQUE (document_id, chunk_index);

-- Step 5: Add dedup_hash to academic_events
ALTER TABLE public.academic_events
  ADD COLUMN IF NOT EXISTS dedup_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_events_doc_dedup
  ON public.academic_events(document_id, dedup_hash)
  WHERE dedup_hash IS NOT NULL;
