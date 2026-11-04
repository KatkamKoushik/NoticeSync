# Architecture & System Design

NoticeSync is structured around an asynchronous, decoupled pipeline designed to safely ingest heterogeneous academic documents, extract structured dates, maintain semantic vector memory, and synchronize confirmed deadlines with student planners.

---

## 1. System Topology

```mermaid
flowchart TB
    subgraph Client_Layer ["Client Tier (Next.js 16.4.3 App Router)"]
        UI["Student Interface (Dashboard, Review Modal, Calendar, Chat)"]
        Hook["Job Tracking & Hydration Hooks (useJobTracking)"]
        UI --> Hook
    end

    subgraph Edge_API ["API Route Layer (Edge & Node.js Runtime)"]
        CSRF["CSRF & Fetch Metadata Filter (W3C Sec-Fetch-Site)"]
        Auth["Session Authenticator (JWT Verification)"]
        RateLimit["Sliding-Window Rate Limiter"]
        
        JobsRoute["/api/jobs (Job State Machine)"]
        ParseRoute["/api/parse (Ingestion & Extraction)"]
        EventsRoute["/api/events (Review & Persistence)"]
        ChatRoute["/api/chat (Grounded Copilot)"]
        MemoryRoute["/api/memory (Document & Vector Management)"]
        
        CSRF --> Auth --> RateLimit
        RateLimit --> JobsRoute
        RateLimit --> ParseRoute
        RateLimit --> EventsRoute
        RateLimit --> ChatRoute
        RateLimit --> MemoryRoute
    end

    subgraph AI_Engine ["AI & Reasoning Layer"]
        Extractor["Multi-Section Partitioning & Schema Repair"]
        CalValidator["Gregorian Calendar & Ambiguity Validator"]
        MemoryAugmenter["Historical Conflict Reasoner"]
        CopilotReasoning["Untrusted Context Boundary Sandbox"]
    end

    subgraph Storage_Layer ["Data Tier (Supabase PostgreSQL 15 + pgvector)"]
        RLS["PostgreSQL Row-Level Security Engine"]
        DocTable[("documents")]
        ChunkTable[("document_chunks (768-dim embeddings)")]
        EventTable[("academic_events")]
        JobTable[("processing_jobs")]
        
        RLS --- DocTable
        RLS --- ChunkTable
        RLS --- EventTable
        RLS --- JobTable
    end

    Hook --> Edge_API
    ParseRoute --> Extractor
    Extractor --> CalValidator
    CalValidator --> MemoryAugmenter
    ChatRoute --> CopilotReasoning
    
    Edge_API ==> RLS
    AI_Engine ==> RLS
```

---

## 2. Ingestion & Job Lifecycle Sequence

The following sequence diagram details the interaction between client, server authentication, background parsing, and database persistence during a notice ingestion cycle:

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student Browser
    participant API as NoticeSync API (/api/parse)
    participant Auth as Auth & CSRF Guard
    participant Stream as Stream Validator
    participant AI as Extraction & Reasoning
    participant DB as User-Scoped Supabase Client

    Student->>API: POST /api/jobs (create processing job)
    API->>Auth: Verify JWT & Enforce CSRF
    Auth-->>API: Valid session (session.user.id)
    API->>DB: INSERT INTO processing_jobs (status: pending)
    DB-->>Student: Return jobId & tracking token

    Student->>API: POST /api/parse (upload document stream)
    API->>Auth: Verify JWT & Enforce CSRF
    API->>Stream: Inspect Magic Bytes & Byte Counters
    alt Spoofed MIME or Exceeds Limit
        Stream-->>Student: 400 Bad Request / 413 Payload Too Large
    else Stream Valid
        Stream-->>API: Verified Buffer & MIME
    end

    API->>DB: UPDATE processing_jobs (status: processing)
    
    par Document Chunking & Embeddings
        API->>AI: Chunk text (600 chars, 120 overlap)
        AI->>DB: INSERT INTO document_chunks (768-dim vectors)
    and LLM Date Extraction
        API->>AI: Structured extraction with untrusted boundaries
        AI->>AI: Validate Gregorian dates & flag ambiguities
    end

    API->>DB: Query historical user chunks for course conflicts
    DB-->>API: Return historical context
    API->>AI: Cross-reference dates vs historical records
    
    API->>DB: UPDATE processing_jobs (status: completed, payload)
    
    Student->>API: GET /api/jobs?jobId=... (Polling)
    API-->>Student: Return extracted events with review flags
    
    Student->>API: PATCH /api/events (Confirm & Save Events)
    API->>DB: INSERT INTO academic_events (RLS enforced)
    DB-->>Student: Persisted verified schedule
```

---

## 3. Background Job State Machine

All asynchronous notice ingestion and extraction tasks are coordinated via the `processing_jobs` state machine:

```mermaid
stateDiagram-v2
    [*] --> pending: POST /api/jobs
    pending --> processing: POST /api/parse begins stream validation
    
    processing --> completed: Extraction & vectorization succeed cleanly
    processing --> partial_success: Extraction succeeds but memory reasoning has warnings
    processing --> failed: Extraction fails, file corrupt, or invalid schema
    
    completed --> [*]
    partial_success --> [*]
    failed --> [*]
```

### State Machine Transitions

| Current State | Target State | Trigger Condition | Persistence Action |
| :--- | :--- | :--- | :--- |
| `none` | `pending` | `POST /api/jobs` with valid file metadata | Inserts initial record with metadata |
| `pending` | `processing` | Ingestion stream received and validated | Updates `status: processing`, sets `progress: 10%` |
| `processing` | `completed` | All events extracted, validated, and embedded | Stores `result` JSON payload, sets `progress: 100%` |
| `processing` | `partial_success`| Events extracted but non-fatal vector/memory warnings | Stores extracted events with warning metadata |
| `processing` | `failed` | Malformed file, timeout, or fatal parser exception | Stores sanitized error message, stops processing |

---

## 4. Entity-Relationship Model

```mermaid
erDiagram
    users ||--o{ documents : owns
    users ||--o{ processing_jobs : initiates
    users ||--o{ academic_events : verifies
    documents ||--o{ document_chunks : contains
    documents ||--o{ academic_events : sources

    documents {
        uuid id PK
        uuid user_id FK
        string title
        string file_name
        string mime_type
        integer file_size
        string sha256_hash
        timestamp created_at
    }

    document_chunks {
        uuid id PK
        uuid document_id FK
        uuid user_id FK
        integer chunk_index
        text chunk_text
        vector_768 embedding
        integer page_number
        timestamp created_at
    }

    academic_events {
        uuid id PK
        uuid user_id FK
        uuid document_id FK
        string title
        string course_code
        string event_type
        date event_date
        time event_time
        string timezone
        string location
        string status
        boolean needs_review
        string review_reason
        boolean has_conflict
        string dedup_hash
        timestamp created_at
    }

    processing_jobs {
        uuid id PK
        uuid user_id FK
        string status
        integer progress
        string step
        jsonb metadata
        jsonb result
        text error
        timestamp created_at
        timestamp updated_at
    }
```

