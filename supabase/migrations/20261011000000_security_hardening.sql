-- NoticeSync Security Hardening Migration
-- Date: 2026-10-11
-- Description:
-- 1. Enforces strict ownership constraints between parent and child tables (chunks -> documents, events -> documents, tasks -> events, jobs -> documents).
-- 2. Prevents associating chunks or events with another user's document.
-- 3. Implements granular, hardened Row Level Security (RLS) policies for SELECT, INSERT, UPDATE, DELETE.
-- 4. Secures match_document_chunks vector function against cross-user leakage and unauthorized access.

-- Step 1: Ensure composite unique constraints on parent tables for relational ownership integrity
ALTER TABLE public.documents
  ADD CONSTRAINT documents_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.academic_events
  ADD CONSTRAINT academic_events_id_user_id_unique UNIQUE (id, user_id);

-- Step 2: Enforce composite foreign keys on child tables referencing (parent_id, user_id)
-- Document Chunks: prevents linking a chunk to another user's document
ALTER TABLE public.document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_document_id_fkey;

ALTER TABLE public.document_chunks
  ADD CONSTRAINT document_chunks_document_user_fkey
  FOREIGN KEY (document_id, user_id)
  REFERENCES public.documents(id, user_id)
  ON DELETE CASCADE;

-- Academic Events: ensure event document_id (if present) belongs to the same user
ALTER TABLE public.academic_events
  DROP CONSTRAINT IF EXISTS academic_events_document_id_fkey;

ALTER TABLE public.academic_events
  ADD CONSTRAINT academic_events_document_user_fkey
  FOREIGN KEY (document_id, user_id)
  REFERENCES public.documents(id, user_id)
  ON DELETE CASCADE;

-- Tasks: ensure task event_id (if present) belongs to the same user
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_event_id_fkey;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_event_user_fkey
  FOREIGN KEY (event_id, user_id)
  REFERENCES public.academic_events(id, user_id)
  ON DELETE CASCADE;

-- Processing Jobs: ensure job document_id (if present) belongs to the same user
ALTER TABLE public.processing_jobs
  DROP CONSTRAINT IF EXISTS processing_jobs_document_id_fkey;

ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_document_user_fkey
  FOREIGN KEY (document_id, user_id)
  REFERENCES public.documents(id, user_id)
  ON DELETE CASCADE;

-- Step 3: Replace broad RLS policies with granular, strict policies

-- Documents table
DROP POLICY IF EXISTS "Users can access their own documents" ON public.documents;
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;

CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (auth.uid() = user_id);

-- Document Chunks table
DROP POLICY IF EXISTS "Users can access their own chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "chunks_select" ON public.document_chunks;
DROP POLICY IF EXISTS "chunks_insert" ON public.document_chunks;
DROP POLICY IF EXISTS "chunks_update" ON public.document_chunks;
DROP POLICY IF EXISTS "chunks_delete" ON public.document_chunks;

CREATE POLICY "chunks_select" ON public.document_chunks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "chunks_insert" ON public.document_chunks
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "chunks_update" ON public.document_chunks
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "chunks_delete" ON public.document_chunks
  FOR DELETE USING (auth.uid() = user_id);

-- Academic Events table
DROP POLICY IF EXISTS "Users can access their own events" ON public.academic_events;
DROP POLICY IF EXISTS "events_select" ON public.academic_events;
DROP POLICY IF EXISTS "events_insert" ON public.academic_events;
DROP POLICY IF EXISTS "events_update" ON public.academic_events;
DROP POLICY IF EXISTS "events_delete" ON public.academic_events;

CREATE POLICY "events_select" ON public.academic_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "events_insert" ON public.academic_events
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
  );

CREATE POLICY "events_update" ON public.academic_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
  );

CREATE POLICY "events_delete" ON public.academic_events
  FOR DELETE USING (auth.uid() = user_id);

-- Tasks table
DROP POLICY IF EXISTS "Users can access their own tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (event_id IS NULL OR EXISTS (
      SELECT 1 FROM public.academic_events e WHERE e.id = event_id AND e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND (event_id IS NULL OR EXISTS (
      SELECT 1 FROM public.academic_events e WHERE e.id = event_id AND e.user_id = auth.uid()
    ))
  );

CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (auth.uid() = user_id);

-- Processing Jobs table
DROP POLICY IF EXISTS "Users can access their own jobs" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs_select" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs_insert" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs_update" ON public.processing_jobs;
DROP POLICY IF EXISTS "jobs_delete" ON public.processing_jobs;

CREATE POLICY "jobs_select" ON public.processing_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "jobs_insert" ON public.processing_jobs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
  );

CREATE POLICY "jobs_update" ON public.processing_jobs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
  );

CREATE POLICY "jobs_delete" ON public.processing_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Step 4: Secure match_document_chunks function with user isolation enforcement
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    p_user_id uuid
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    effective_user_id uuid;
BEGIN
    -- If caller is authenticated via JWT session, auth.uid() is authoritative
    IF auth.uid() IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'Access denied: user isolation violation';
        END IF;
        effective_user_id := auth.uid();
    ELSE
        -- Privileged server-side invocation MUST provide explicit valid user_id
        IF p_user_id IS NULL THEN
            RAISE EXCEPTION 'user_id is required';
        END IF;
        effective_user_id := p_user_id;
    END IF;

    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::float AS similarity
    FROM public.document_chunks dc
    WHERE dc.user_id = effective_user_id
      AND (1 - (dc.embedding <=> query_embedding)) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Revoke execute from public/anon and grant only to authenticated and service_role
REVOKE ALL ON FUNCTION match_document_chunks(vector(768), float, int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION match_document_chunks(vector(768), float, int, uuid) TO authenticated, service_role;
