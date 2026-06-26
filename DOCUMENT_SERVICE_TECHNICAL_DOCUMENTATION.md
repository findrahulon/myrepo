# document-service — Technical Documentation

## 1. Service purpose

`document-service` is the ingestion and document metadata service for RAGnarok. It is responsible for accepting documents or URL-based content, storing the raw payload in MinIO, and recording the canonical document metadata in PostgreSQL.

This service is the first persistence stage of the ingestion pipeline. Downstream services such as `chunking-service` and `embedding-service` depend on the document record created here.

---

## 2. Responsibilities

The service currently implements four main responsibilities:

1. **Health reporting**
   - Exposes a lightweight `/health` endpoint for container and orchestration checks.

2. **Binary file ingestion**
   - Accepts PDF, DOCX, DOC, and TXT files through multipart upload.
   - Validates file type.
   - Stores the object in MinIO.
   - Persists document metadata in PostgreSQL.

3. **URL ingestion**
   - Accepts a URL payload.
   - Fetches HTML content using `httpx`.
   - Sanitizes HTML into plain text with `BeautifulSoup`.
   - Stores the cleaned text in MinIO as a `.txt` object.
   - Persists a metadata record in PostgreSQL, including the source URL.

4. **Document retrieval**
   - Lists registered documents.
   - Downloads the original object bytes from MinIO.
   - Returns content with a suitable media type and content-disposition header.

---

## 3. Code entry point

The service entry point is `services/document-service/main.py`.

Key runtime components:

- **FastAPI application**: `app = FastAPI(...)`
- **MinIO client factory**: `get_minio_client()`
- **PostgreSQL connection factory**: `get_db()`
- **URL cleaning helpers**: `clean_html()` and `sanitize_filename()`
- **Document routes**:
  - `GET /health`
  - `POST /url`
  - `POST /upload`
  - `GET /documents`
  - `GET /documents/{document_id}/download`

---

## 4. Runtime dependencies

The service depends on the following Python packages from `services/document-service/requirements.txt`:

- `fastapi`
- `uvicorn`
- `minio`
- `psycopg2-binary`
- `python-multipart`
- `pydantic`
- `beautifulsoup4`
- `httpx`

### External services

`document-service` requires these runtime dependencies from the stack:

- **PostgreSQL** for document metadata
- **MinIO** for object storage

### Docker wiring

In `docker-compose.yml`, the service is connected to:

- `MINIO_ENDPOINT=minio:9000`
- `MINIO_ACCESS_KEY=minioadmin`
- `MINIO_SECRET_KEY=minioadmin123`
- `MINIO_BUCKET=ragnarok-documents`
- `DATABASE_URL=postgresql://ragnarok:ragnarok_secret@postgres:5432/ragnarok`

---

## 5. Configuration reference

### Environment variables

| Variable | Default in code | Purpose |
|---|---:|---|
| `MINIO_ENDPOINT` | `localhost:9000` | MinIO host and port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin123` | MinIO secret key |
| `MINIO_BUCKET` | `ragnarok-documents` | Bucket used for stored documents |
| `DATABASE_URL` | `postgresql://ragnarok:ragnarok_secret@localhost:5432/ragnarok` | PostgreSQL connection string |

### Important deployment note

The default `DATABASE_URL` in the code uses `ragnarok_secret` as the password, which matches the current Docker Compose setup. If Postgres credentials are changed in `docker-compose.yml`, `document-service` must be updated to match.

---

## 6. Data model usage

The service reads and writes to the schema defined in `init-scripts/01-init.sql`.

### `documents` table

Fields used by `document-service`:

- `id`
- `filename`
- `file_type`
- `file_size`
- `minio_path`
- `uploaded_by`
- `department`
- `access_level`
- `status`
- `metadata`
- `created_at`

### `chunks` table

`document-service` does **not** write chunks directly. It only prepares document records that downstream ingestion services can use.

### `feedback` table

Not used by `document-service`.

### `audit_logs` table

Not used by `document-service`.

---

## 7. Storage design

### MinIO object layout

Uploaded files are stored under this path format:

```text
documents/{document_id}/{filename}
```

Examples:

- `documents/5d32.../policy.pdf`
- `documents/aa91.../Webpage.txt`

### PostgreSQL metadata record

Each upload creates a row in `documents` that captures:

- the generated UUID document ID
- the original filename or generated URL filename
- file type
- file size
- MinIO object path
- uploader identity
- department and access level tags
- status (`uploaded`)
- optional metadata such as `source_url`

---

## 8. API surface

## 8.1 `GET /health`

### Purpose
Returns the liveness/health status of the service.

### Response

```json
{
  "status": "healthy",
  "service": "document-service"
}
```

### Typical usage

- Docker health checks
- Kubernetes readiness/liveness probes
- Manual smoke testing

---

## 8.2 `POST /upload`

### Purpose
Uploads a binary document file and stores its metadata.

### Request type

`multipart/form-data`

### Form fields

| Field | Type | Default | Required | Description |
|---|---|---:|---:|---|
| `file` | `UploadFile` | — | Yes | PDF, DOCX, DOC, or TXT file |
| `uploaded_by` | `string` | `anonymous` | No | Logical user or system actor |
| `department` | `string` | `general` | No | Business department tag |
| `access_level` | `string` | `basic` | No | RBAC visibility tag |

### Validation rules

- File extension must be one of:
  - `pdf`
  - `docx`
  - `doc`
  - `txt`
- If the extension is unsupported, the endpoint returns HTTP `400`.

### Processing flow

1. Generate a UUID document ID.
2. Extract filename and file extension.
3. Read the file bytes into memory.
4. Determine file size.
5. Compose MinIO object path.
6. Ensure the bucket exists; create it if needed.
7. Upload the bytes to MinIO.
8. Insert metadata into PostgreSQL.
9. Return upload details.

### Response example

```json
{
  "document_id": "4fba2f7c-2d15-4d37-9af8-3cbd6d0f0c5d",
  "filename": "policy.pdf",
  "file_size": 248391,
  "minio_path": "documents/4fba2f7c-2d15-4d37-9af8-3cbd6d0f0c5d/policy.pdf",
  "status": "uploaded"
}
```

### Failure cases

- Unsupported file extension → `400 Bad Request`
- MinIO unavailable → request fails during storage
- PostgreSQL unavailable → request fails during metadata persistence

---

## 8.3 `POST /url`

### Purpose
Fetches a webpage, converts it into text, stores the result in MinIO, and registers metadata in PostgreSQL.

### Request body

```json
{
  "url": "https://example.com",
  "uploaded_by": "anonymous",
  "department": "general",
  "access_level": "basic"
}
```

### Request model

The request is represented by `URLIngestInput`:

- `url: str`
- `uploaded_by: str = "anonymous"`
- `department: str = "general"`
- `access_level: str = "basic"`

### Processing flow

1. Fetch the URL with `httpx.AsyncClient`.
2. Follow redirects.
3. Send a browser-like user agent.
4. Require HTTP `200`.
5. Parse HTML with `BeautifulSoup`.
6. Remove script, style, nav, footer, header, noscript, and iframe elements.
7. Extract visible text.
8. Create a sanitized title-based filename.
9. Store the extracted text as `.txt` in MinIO.
10. Insert a PostgreSQL metadata record with `file_type='url'` and `metadata.source_url`.

### Response example

```json
{
  "document_id": "b2a4a8b9-2d78-4e4f-b112-7ee5f3e96b88",
  "filename": "Example_Domain.txt",
  "file_size": 1423,
  "minio_path": "documents/b2a4a8b9-2d78-4e4f-b112-7ee5f3e96b88/Example_Domain.txt",
  "status": "uploaded"
}
```

### Failure cases

- Network failure or invalid URL → `400 Bad Request`
- Non-200 HTTP status → `400 Bad Request`
- MinIO unavailable → request fails during storage
- PostgreSQL unavailable → request fails during metadata persistence

---

## 8.4 `GET /documents`

### Purpose
Returns a list of all stored document metadata records.

### Query behavior

The service queries the `documents` table ordered by `created_at DESC`.

### Response structure

```json
{
  "documents": [
    {
      "id": "uuid",
      "filename": "policy.pdf",
      "file_type": "pdf",
      "file_size": 248391,
      "status": "uploaded",
      "department": "engineering",
      "access_level": "basic",
      "uploaded_by": "alice",
      "chunk_count": 12,
      "created_at": "2026-06-26T12:00:00+00:00"
    }
  ]
}
```

### Notes

- `created_at` is serialized with `isoformat()` when present.
- If `created_at` is missing, the API returns `null`.

---

## 8.5 `GET /documents/{document_id}/download`

### Purpose
Streams the original object back to the caller.

### Processing flow

1. Look up `minio_path`, `filename`, `file_type`, and `metadata` in PostgreSQL.
2. If the document does not exist, return `404`.
3. Fetch the object from MinIO.
4. Read the full object bytes.
5. Build response headers:
   - `Content-Disposition`
   - optional `X-Source-URL` for URL-ingested documents
6. Return the content with the appropriate media type.

### Media type mapping

| File type | Media type |
|---|---|
| `pdf` | `application/pdf` |
| `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `doc` | `application/msword` |
| `txt` | `text/plain; charset=utf-8` |
| `url` | `text/plain; charset=utf-8` |
| unknown | `application/octet-stream` |

### Header behavior

- The filename is sanitized for `Content-Disposition`.
- If metadata contains `source_url`, the response includes `X-Source-URL`.

---

## 9. Helper functions

### `get_minio_client()`
Creates and returns a MinIO client using the configured endpoint and credentials.

### `get_db()`
Creates a PostgreSQL connection using `DATABASE_URL`.

### `get_media_type(file_type)`
Maps a document type to a MIME type for downloads.

### `content_disposition(filename)`
Builds a safe `Content-Disposition` header value by escaping backslashes and quotes.

### `clean_html(html_content)`
Transforms HTML into a text payload.

Behavior:

- Extracts `<title>` if present
- Removes script and layout noise
- Produces plain text with normalized line breaks

### `sanitize_filename(name)`
Converts a title into a filesystem-safe base name.

Rules:

- Keeps alphanumeric characters, space, `-`, `_`
- Trims whitespace
- Replaces spaces with underscores
- Caps length at 100 characters
- Falls back to `webpage` if the result is empty

---

## 10. Document lifecycle

### A. File upload lifecycle

1. Client sends multipart upload to `/upload`
2. Service validates extension
3. File bytes are read into memory
4. Object is saved in MinIO
5. Metadata row is saved in PostgreSQL
6. Service returns the new document ID

### B. URL ingestion lifecycle

1. Client posts a URL to `/url`
2. Service fetches the page
3. HTML is cleaned into text
4. Text is stored in MinIO as `.txt`
5. Metadata row is saved with URL provenance
6. Service returns the new document ID

### C. Download lifecycle

1. Client requests `/documents/{document_id}/download`
2. Service resolves the MinIO path from PostgreSQL
3. Service reads the object from MinIO
4. Service returns the raw bytes with headers

---

## 11. Error handling model

Current error handling is intentionally simple:

- Uses FastAPI `HTTPException` for client-facing failures
- Wraps URL fetch failures with a generic `400` response
- Lets infrastructure exceptions surface for storage/database problems

### Practical implications

- Bad URLs and unsupported file types are handled explicitly.
- MinIO/PostgreSQL connection failures bubble up as runtime errors unless intercepted by the deployment environment.
- The service assumes the database schema already exists.

---

## 12. Security and trust considerations

### Input trust

The current implementation does not perform authentication or authorization at the service layer. It assumes trusted internal access behind the API gateway.

### URL ingestion risks

- Arbitrary URL fetches can expose the service to SSRF-style risks.
- The current implementation does not restrict outbound destinations.
- If this endpoint is exposed publicly, consider adding allowlists, scheme checks, and timeout controls.

### Content handling

- Downloaded HTML is converted to text before storage.
- Uploaded files are stored as-is.
- Filenames are sanitized before use in object paths and response headers.

---

## 13. Implementation notes and caveats

### In-memory upload handling

Both upload paths load content into memory before writing to MinIO. This is simple and works well for small-to-medium documents, but large files may require streaming or chunked handling in a future iteration.

### Bucket creation

Each upload path checks whether the bucket exists and creates it if missing. In a multi-instance deployment, this is usually acceptable, but a dedicated bootstrap job is cleaner.

### Database insert shape

The service writes a `status='uploaded'` row for every successful ingest. The document remains in this state until downstream services update it.

### Schema dependency

`document-service` expects the `documents` table from `init-scripts/01-init.sql` to be present.

### Known credential alignment

The code default uses `ragnarok_secret`, and the current Compose file also uses `ragnarok_secret`. This alignment is important for avoiding PostgreSQL authentication failures.

---

## 14. End-to-end integration role

`document-service` is the anchor point for document ingestion in the broader RAG pipeline:

- `api-gateway` sends upload and URL ingest traffic here
- `chunking-service` consumes the document record and/or MinIO object for text splitting
- `embedding-service` uses chunks for vector creation
- `retrieval-service` later uses those vectors to answer queries
- `feedback-service` and `audit-service` operate on query-side data, not upload-side data

In short, this service owns the authoritative document registry and storage path.

---

## 15. Suggested improvements

These are useful follow-up hardening items if the service is evolving:

1. Add explicit authentication/authorization at the service boundary or enforce gateway-only access.
2. Stream uploads directly to MinIO for large files.
3. Add better validation for URL ingestion, including SSRF protection.
4. Centralize bucket provisioning during startup.
5. Add request/response models for stronger OpenAPI documentation.
6. Add unit tests for HTML cleaning, filename sanitization, and download header generation.
7. Add structured error logging around MinIO and PostgreSQL failures.

---

## 16. Quick reference

### Public endpoints

- `GET /health`
- `POST /url`
- `POST /upload`
- `GET /documents`
- `GET /documents/{document_id}/download`

### Persistent dependencies

- MinIO bucket: `ragnarok-documents`
- PostgreSQL tables: `documents`

### Primary outputs

- Stored object in MinIO
- Metadata row in PostgreSQL
- Document ID returned to caller

---

## 17. Minimal operational summary

If you only need the shortest technical summary:

- `document-service` ingests files and URLs.
- It stores document content in MinIO.
- It stores metadata in PostgreSQL.
- It supports document listing and download.
- It is the upstream source of truth for the rest of the RAG document pipeline.

