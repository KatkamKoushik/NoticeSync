# API Reference & Route Authorization Matrix

All NoticeSync API routes require server-side session authentication. Unauthorized requests receive HTTP 401 Unauthorized, and requests violating cross-tenant boundaries receive HTTP 403 Forbidden or 404 Not Found.

---

## 1. Route Authorization Matrix

| Endpoint | Method | Allowed Caller | Auth Method | CSRF Check | RLS Scoping Filter |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `/api/events` | `GET` | Authenticated Student | Bearer / Cookie | No | `academic_events.user_id = session.user.id` |
| `/api/events` | `POST` | Authenticated Student | Bearer / Cookie | **Yes** | Forces `user_id = session.user.id` |
| `/api/events` | `PATCH` | Authenticated Student | Bearer / Cookie | **Yes** | Updates event where `id = :id AND user_id = session.user.id` |
| `/api/events` | `DELETE`| Authenticated Student | Bearer / Cookie | **Yes** | Deletes event where `id = :id AND user_id = session.user.id` |
| `/api/jobs` | `POST` | Authenticated Student | Bearer / Cookie | **Yes** | Inserts `processing_jobs` with `user_id = session.user.id` |
| `/api/jobs` | `GET` | Authenticated Student | Bearer / Cookie | No | Checks `processing_jobs.user_id = session.user.id` |
| `/api/parse` | `POST` | Authenticated Student | Bearer / Cookie | **Yes** | Enforces job ownership and scopes document insertions |
| `/api/memory` | `GET` | Authenticated Student | Bearer / Cookie | No | `documents.user_id = session.user.id` |
| `/api/memory` | `DELETE`| Authenticated Student | Bearer / Cookie | **Yes** | Cascading delete where `id = :id AND user_id = session.user.id` |
| `/api/chat` | `POST` | Authenticated Student | Bearer / Cookie | **Yes** | RAG retrieval scopes `p_user_id = session.user.id` |
| `/api/brief` | `POST` | Authenticated Student | Bearer / Cookie | **Yes** | In-memory summarization scoped to caller session |

---

## 2. Endpoint Specifications

### `/api/events`

#### `GET /api/events`
Retrieves confirmed and pending events for the authenticated student.
- **Query Parameters:** `status` (optional: `confirmed`, `pending`, `all`), `course` (optional).
- **Response `200 OK`:**
  ```json
  {
    "events": [
      {
        "id": "e0000000-0000-4000-8000-000000000001",
        "title": "Midterm Examination",
        "courseCode": "CS101",
        "eventType": "exam",
        "date": "2026-11-15",
        "time": "14:30",
        "timezone": "UTC",
        "precision": "date_time",
        "status": "confirmed",
        "needsReview": false,
        "hasConflict": false
      }
    ]
  }
  ```

#### `PATCH /api/events`
Human review confirmation or correction endpoint.
- **Request Body:**
  ```json
  {
    "eventId": "e0000000-0000-4000-8000-000000000001",
    "status": "confirmed",
    "confirmedDate": "2026-11-15",
    "notes": "Verified against revised departmental notice"
  }
  ```
- **Response `200 OK`:**
  ```json
  { "success": true, "eventId": "e0000000-0000-4000-8000-000000000001", "status": "confirmed" }
  ```

---

### `/api/jobs`

#### `POST /api/jobs`
Initializes a new background processing job for a notice upload.
- **Request Body:**
  ```json
  {
    "fileName": "Semester_Exam_Notice.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1048576
  }
  ```
- **Response `201 Created`:**
  ```json
  { "jobId": "b0000000-0000-4000-8000-000000000001", "status": "pending" }
  ```

#### `GET /api/jobs?jobId=:uuid`
Polls the execution status and extracted events payload for an ongoing job.
- **Response `200 OK`:**
  ```json
  {
    "jobId": "b0000000-0000-4000-8000-000000000001",
    "status": "completed",
    "progress": 100,
    "step": "done",
    "result": { "events": [...] }
  }
  ```

---

### `/api/parse`

#### `POST /api/parse`
Uploads and processes the notice stream.
- **Headers:** `Content-Type: multipart/form-data`
- **Form Data:** `file` (Binary), `jobId` (UUID v4)
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "jobId": "b0000000-0000-4000-8000-000000000001",
    "extractedCount": 3,
    "needsReviewCount": 1
  }
  ```

---

### Standard Error Response Format

Unhandled exceptions and validation errors return masked responses to prevent credential and database leakage:

```json
{
  "error": "The requested operation could not be completed.",
  "code": "VALIDATION_FAILED",
  "status": 400
}
```

