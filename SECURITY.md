# Security Policy

NoticeSync is committed to ensuring the security, privacy, and integrity of student academic records and document intelligence pipelines. This document describes our security architecture, supported versions, and procedure for reporting vulnerabilities.

---

## 1. Supported Versions

Security updates, dependency patches, and vulnerability fixes are applied to the active development branch:

| Version | Supported | Security Maintenance Status |
| :--- | :---: | :--- |
| `0.1.x` (Current `main`) | Yes | Actively maintained with automated dependency audits and CI security scans |
| `< 0.1.0` | No | Unsupported legacy preview commits |

---

## 2. Reporting a Vulnerability

If you discover a potential security vulnerability, privilege escalation flaw, cross-tenant data leak, or secret exposure in NoticeSync, **do not open a public issue or discussion**.

### Preferred Reporting Channel
Please report security vulnerabilities through GitHub's private reporting interface:
1. Navigate to the repository: [https://github.com/KatkamKoushik/NoticeSync](https://github.com/KatkamKoushik/NoticeSync)
2. Click on the **Security** tab.
3. Select **Advisories** and click **Report a vulnerability**.

### Alternative Direct Contact
If private reporting through GitHub is unavailable, send an email to the repository maintainer with:
- A descriptive summary of the vulnerability.
- Reproduction steps, including safe proof-of-concept commands or HTTP payloads.
- Affected files, endpoints, or dependency versions.
- Potential impact on student records or tenancy boundaries.

### Vulnerability Response SLA
- **Initial Acknowledgment:** Within 48 hours of receipt.
- **Triage and Impact Assessment:** Within 5 business days.
- **Fix and Advisory Publication:** Security patches are prioritized and validated against the continuous integration suite before release.

---

## 3. Security Architecture & Threat Model

NoticeSync is designed with defense-in-depth principles:

### A. Verified Server-Side Identity
- All client sessions are verified server-side using Supabase JWT tokens via `getAuthenticatedUser()`.
- Client-supplied `userId` parameters in JSON request bodies or query parameters are ignored.
- The effective database query identity is strictly derived from the verified session token.

### B. PostgreSQL Row-Level Security (RLS)
- All core tables (`documents`, `document_chunks`, `academic_events`, `processing_jobs`) enforce strict RLS policies.
- Every read, write, update, and delete requires `auth.uid() = user_id`.
- The `pgvector` similarity search RPC (`match_document_chunks`) explicitly scopes vector searches to the authenticated user's chunks (`p_user_id`).

### C. Untrusted Document Context Boundaries
- Uploaded syllabi, circulars, and announcements are treated as untrusted user input.
- Documents are encapsulated within `<document_context untrusted="true">` delimiters with explicit system directives forbidding the LLM from executing breakout commands or prompt injection payloads embedded inside student documents.

### D. Multi-Stage Ingestion Sanitization
- File uploads validate binary magic-byte signatures (`%PDF`, `PNG`, `JPEG`, `WebP`) before executing parsers. Zero-byte, oversized, and corrupt binaries are rejected immediately.
- File names are sanitized to prevent directory traversal attacks (`../`).
- Input strings are sanitized to strip null bytes and malformed UTF sequences.

### E. Sliding-Window Rate Limiting
Production endpoints enforce user-scoped rate limits to prevent denial-of-service and API quota abuse:
- `/api/parse`: 10 requests per minute per user.
- `/api/jobs`: 30 requests per minute per user.
- `/api/chat`: 30 turns per minute per user.
- `/api/events`: 60 requests per minute per user.
- `/api/memory`: 60 requests per minute per user.
- `/api/brief`: 20 requests per minute per user.

### F. Safe Error Masking & Secret Redaction
- Server exceptions are masked with generic responses via `safeErrorResponse` to prevent database schema and stack trace leakage.
- Observability loggers redact bearer tokens, API keys, and connection strings before recording logs.
- Automated secret scanning is enforced on every commit using Gitleaks (`.gitleaks.toml`).
