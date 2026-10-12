-- Enable pgvector extension
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Enums
CREATE TYPE source_type AS ENUM ('pdf', 'image', 'text');
CREATE TYPE event_type AS ENUM ('Exam', 'Assignment', 'Notice', 'Task');
CREATE TYPE priority_level AS ENUM ('Critical', 'High', 'Medium', 'Low');
CREATE TYPE event_status AS ENUM ('pending_review', 'confirmed', 'removed');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'partial_success');

-- documents table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    source_type source_type NOT NULL,
    file_name TEXT,
    original_text TEXT,
    content_hash TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT documents_id_user_id_unique UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX idx_documents_user_content_hash ON public.documents(user_id, content_hash) WHERE content_hash IS NOT NULL;

-- document_chunks table (for RAG)
CREATE TABLE public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- using 768 dimensions for text-embedding-004 / gemini-embedding-2
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT document_chunks_document_user_fkey FOREIGN KEY (document_id, user_id) REFERENCES public.documents(id, user_id) ON DELETE CASCADE,
    CONSTRAINT document_chunks_doc_chunk_unique UNIQUE (document_id, chunk_index)
);

-- Index for vector search (HNSW index)
CREATE INDEX ON public.document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_document_chunks_user_id ON public.document_chunks(user_id);
CREATE INDEX idx_document_chunks_doc_user ON public.document_chunks(document_id, user_id);

-- academic_events table
CREATE TABLE public.academic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID,
    title TEXT NOT NULL,
    date DATE,
    type event_type NOT NULL,
    description TEXT,
    confidence INTEGER,
    priority priority_level,
    strict_deadline BOOLEAN DEFAULT false,
    deadline_change BOOLEAN DEFAULT false,
    information_pending BOOLEAN DEFAULT false,
    status event_status DEFAULT 'pending_review',
    source_excerpt TEXT,
    location TEXT,
    page_number INTEGER,
    chunk_index INTEGER,
    dedup_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT academic_events_id_user_id_unique UNIQUE (id, user_id),
    CONSTRAINT academic_events_document_user_fkey FOREIGN KEY (document_id, user_id) REFERENCES public.documents(id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_academic_events_user_id ON public.academic_events(user_id);
CREATE INDEX idx_academic_events_doc_user ON public.academic_events(document_id, user_id);
CREATE UNIQUE INDEX idx_academic_events_doc_dedup ON public.academic_events(document_id, dedup_hash) WHERE dedup_hash IS NOT NULL;

-- tasks table
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_id UUID,
    title TEXT NOT NULL,
    due_date DATE,
    priority priority_level,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tasks_event_user_fkey FOREIGN KEY (event_id, user_id) REFERENCES public.academic_events(id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_event_user ON public.tasks(event_id, user_id);

-- processing_jobs table
CREATE TABLE public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID,
    status job_status DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    current_step TEXT,
    error_message TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT processing_jobs_document_user_fkey FOREIGN KEY (document_id, user_id) REFERENCES public.documents(id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_doc_user ON public.processing_jobs(document_id, user_id);
CREATE UNIQUE INDEX idx_processing_jobs_user_idempotency ON public.processing_jobs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- Granular RLS Policies
-- Documents
CREATE POLICY "documents_select" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents_insert" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_update" ON public.documents FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_delete" ON public.documents FOR DELETE USING (auth.uid() = user_id);

-- Document Chunks
CREATE POLICY "chunks_select" ON public.document_chunks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chunks_insert" ON public.document_chunks FOR INSERT WITH CHECK (
    auth.uid() = user_id AND EXISTS (
        SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    )
);
CREATE POLICY "chunks_update" ON public.document_chunks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND EXISTS (
        SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    )
);
CREATE POLICY "chunks_delete" ON public.document_chunks FOR DELETE USING (auth.uid() = user_id);

-- Academic Events
CREATE POLICY "events_select" ON public.academic_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "events_insert" ON public.academic_events FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
        SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
);
CREATE POLICY "events_update" ON public.academic_events FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
        SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
);
CREATE POLICY "events_delete" ON public.academic_events FOR DELETE USING (auth.uid() = user_id);

-- Tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (event_id IS NULL OR EXISTS (
        SELECT 1 FROM public.academic_events e WHERE e.id = event_id AND e.user_id = auth.uid()
    ))
);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND (event_id IS NULL OR EXISTS (
        SELECT 1 FROM public.academic_events e WHERE e.id = event_id AND e.user_id = auth.uid()
    ))
);
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- Processing Jobs
CREATE POLICY "jobs_select" ON public.processing_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "jobs_insert" ON public.processing_jobs FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
        SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
);
CREATE POLICY "jobs_update" ON public.processing_jobs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id AND (document_id IS NULL OR EXISTS (
        SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = auth.uid()
    ))
);
CREATE POLICY "jobs_delete" ON public.processing_jobs FOR DELETE USING (auth.uid() = user_id);

-- Function to match document chunks with strict user isolation
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
    IF auth.uid() IS NOT NULL THEN
        IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'Access denied: user isolation violation';
        END IF;
        effective_user_id := auth.uid();
    ELSE
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

REVOKE ALL ON FUNCTION match_document_chunks(vector(768), float, int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION match_document_chunks(vector(768), float, int, uuid) TO authenticated, service_role;
