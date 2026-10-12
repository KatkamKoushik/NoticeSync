-- NoticeSync Initial Database Schema Migration
-- Timestamp: 20261010000000
-- Description:
-- 1. Enables pgvector extension in extensions schema.
-- 2. Defines custom enums (source_type, event_type, priority_level, event_status, job_status).
-- 3. Creates core tables: documents, document_chunks, academic_events, tasks, processing_jobs.
-- 4. Creates vector HNSW index and foreign keys.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Custom Enums
DO $$ BEGIN
    CREATE TYPE source_type AS ENUM ('pdf', 'image', 'text');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE event_type AS ENUM ('Exam', 'Assignment', 'Notice', 'Task');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE priority_level AS ENUM ('Critical', 'High', 'Medium', 'Low');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE event_status AS ENUM ('pending_review', 'confirmed', 'removed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- documents table
CREATE TABLE IF NOT EXISTS public.documents (
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

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);

-- document_chunks table (for RAG)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768),
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON public.document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- academic_events table
CREATE TABLE IF NOT EXISTS public.academic_events (
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

CREATE INDEX IF NOT EXISTS idx_academic_events_user_id ON public.academic_events(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_events_document_id ON public.academic_events(document_id);

-- tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event_id ON public.tasks(event_id);

-- processing_jobs table
CREATE TABLE IF NOT EXISTS public.processing_jobs (
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

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_document_id ON public.processing_jobs(document_id);
