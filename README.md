# NoticeSync 🎓✨

**NoticeSync** is an AI-powered academic intelligence platform built for college students. It solves the problem of scattered college notices (syllabi, circulars, professor messages) by extracting, cross-referencing, and organizing academic events into a unified planner.

It leverages Google's **Gemma** open models and the **Gemini API** for advanced retrieval-augmented generation (RAG) and multi-document reasoning, deployed on **Next.js** with **Supabase**.

---

## 🌟 Key Features

1. **Omni-Modal Ingestion**: Upload PDFs (syllabi), images (screenshots of circulars), or paste text (WhatsApp announcements).
2. **AI Academic Reasoning (Gemma)**: Extracts structured academic events (exams, assignments, holidays) from unstructured text with confidence scores.
3. **Multi-Document Memory & RAG**: Uses `pgvector` to remember past uploads. If a new circular postpones an exam from an old syllabus, Gemma detects the conflict and flags it for human review.
4. **Human-in-the-Loop Review**: Allows students to quickly verify the AI's deductions, resolve conflicts, and confirm deadlines.
5. **Smart Planner & Workload Analysis**: Visualizes the academic timeline, highlights upcoming crunch periods, and flags missing information.
6. **"Ask NoticeSync" Chat**: A built-in RAG assistant to answer specific questions like *"When is my next DBMS lab?"* based on uploaded documents.
7. **Demo Mode**: Run the app with `?demo=true` in the URL for a guaranteed, offline presentation flow.

---

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router), React, Tailwind CSS
- **AI Models**: Gemma 2 (via Gemini API) for reasoning, `text-embedding-004` for vector embeddings.
- **Database**: Supabase (PostgreSQL with `pgvector`), Realtime subscriptions.
- **Processing**: `pdf-parse`, `tesseract.js`.
- **Observability**: Sentry (Error tracking), Langfuse (LLM Tracing).
- **Design**: Custom deep-dark scientific aesthetics inspired by the Gemma visual language.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- pnpm
- A Supabase Project
- A Gemini API Key (or multiple for rotation)

### 2. Installation
```bash
git clone <repo-url>
cd noticesync
pnpm install
```

### 3. Environment Setup
Create a `.env.local` file in the root directory:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key
# Optional Fallbacks
GEMINI_API_KEY_FALLBACK_1=your_fallback_key
GEMINI_API_KEY_FALLBACK_2=your_fallback_key

# Observability (Optional)
LANGFUSE_PUBLIC_KEY=your_langfuse_pk
LANGFUSE_SECRET_KEY=your_langfuse_sk
LANGFUSE_BASEURL=https://cloud.langfuse.com
```

### 4. Database Setup
Run the SQL script located in `supabase/schema.sql` in your Supabase SQL Editor to create the necessary tables (`documents`, `document_chunks`, `academic_events`, `processing_jobs`) and enable `pgvector`.

### 5. Run Locally
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧠 Architecture Overview

NoticeSync uses a multi-stage reasoning pipeline:
1. **Ingestion**: Raw files are parsed into text (OCR or PDF extraction).
2. **Memory Building**: Text is chunked and embedded into Supabase `pgvector`.
3. **Extraction**: Gemma extracts structured events (`AcademicEvent` schema).
4. **Reasoning**: Each event is cross-referenced against the vector database to detect contradictions, postponements, or missing information.
5. **Review & Persistence**: The user confirms the events, and they are saved to the timeline.

## 🤝 Contributing
Built for the Hackathon. Feel free to fork and improve!
