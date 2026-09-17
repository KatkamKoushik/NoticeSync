-- Enable pgvector extension
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Enums
CREATE TYPE source_type AS ENUM ('pdf', 'image', 'text');
CREATE TYPE event_type AS ENUM ('Exam', 'Assignment', 'Notice', 'Task');
CREATE TYPE priority_level AS ENUM ('Critical', 'High', 'Medium', 'Low');
CREATE TYPE event_status AS ENUM ('pending_review', 'confirmed', 'removed');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- documents table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    source_type source_type NOT NULL,
    file_name TEXT,
    original_text TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- document_chunks table (for RAG)
CREATE TABLE public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- using 768 dimensions for text-embedding-004
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for vector search (HNSW index)
CREATE INDEX ON public.document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_document_chunks_user_id ON public.document_chunks(user_id);

-- academic_events table
CREATE TABLE public.academic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_academic_events_user_id ON public.academic_events(user_id);

-- tasks table
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_id UUID REFERENCES public.academic_events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date DATE,
    priority priority_level,
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);

-- processing_jobs table
CREATE TABLE public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    status job_status DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    current_step TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_user_id ON public.processing_jobs(user_id);

-- Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- Note: We assume the application accesses data via a service_role key for backend processing,
-- but if users are authenticating via Supabase Auth, these policies ensure they only see their own data.
CREATE POLICY "Users can access their own documents" ON public.documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own chunks" ON public.document_chunks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own events" ON public.academic_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own jobs" ON public.processing_jobs FOR ALL USING (auth.uid() = user_id);

-- Function to match documents
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
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE dc.user_id = p_user_id
      AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
$$;
