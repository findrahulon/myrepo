# chunking-service — Technical Documentation

## 1. Service purpose

`chunking-service` is the document splitting stage in the RAGnarok ingestion pipeline. It downloads a document from MinIO, extracts text from the raw file, splits that text into overlapping token-based chunks, stores the chunks in PostgreSQL, and marks the parent document as chunked.

The service sits between `document-service` and `embedding-service`.

---

## 2. Responsibilities

The service currently handles these responsibilities:

1. **Health reporting**
   - Exposes a lightweight `/health` endpoint.

2. **Text extraction**
   - Supports PDF, DOCX, DOC, and TXT files.
   - Reads document bytes from MinIO.
   - Extracts page-aligned text where possible.

3. **Chunk generation**
   - Splits extracted text into 500-token chunks.
   - Uses a 100-token overlap between adjacent chunks.
   - Tracks page numbers and token counts.

4. **Database persistence**
   - Inserts chunk rows into PostgreSQL.
   - Updates the parent document status to `chunked`.
   - Updates `documents.chunk_count`.

---

## 3. Code entry point

The service entry point is `services/chunking-service/main.py`.

Primary runtime symbols:

- **FastAPI application**: `app = FastAPI(...)`
- **MinIO client factory**: `get_minio_client()`
- **PostgreSQL connection factory**: `get_db()`
- **Text extractors**:
  - `extract_text_from_pdf()`
  - `extract_text_from_docx()`
- **Chunking helper**: `chunk_text()`
- **Request model**: `ChunkRequest`
- **Routes**:
  - `GET /health`
  - `POST /chunk`

---

## 4. Runtime dependencies

The service depends on these Python packages from `services/chunking-service/requirements.txt`:

- `fastapi`
- `uvicorn`
- `psycopg2-binary`
- `minio`
- `PyPDF2`
- `python-docx`
- `tiktoken`
- `pydantic`

### External services

`chunking-service` requires the following infrastructure services:

- **MinIO** for document retrieval
- **PostgreSQL** for chunk persistence and document status updates

### Docker wiring

In `docker-compose.yml`, the service is configured with:

- `DATABASE_URL=postgresql://ragnarok:ragnarok_secret@postgres:5432/ragnarok`

The code defaults also support local execution with:

- `DATABASE_URL=postgresql://ragnarok:ragnarok_secret@localhost:5432/ragnarok`
- `MINIO_ENDPOINT=minio:9000`
- `MINIO_ACCESS_KEY=minioadmin`
- `MINIO_SECRET_KEY=minioadmin123`
- `MINIO_BUCKET=ragnarok-documents`

---

## 5. Container build notes

The Dockerfile uses `python:3.12-slim` and installs `build-essential` before installing Python dependencies.

Why that matters:

- `tiktoken` and related packages may need native build tooling in some environments.
- The slim image keeps the service lightweight while still supporting package compilation.

---

## 6. Data model usage

The service reads and writes the schema defined in `init-scripts/01-init.sql`.

### `documents` table

`chunking-service` updates the following fields:

- `status`
- `chunk_count`

It expects a valid row for `document_id` to already exist.

### `chunks` table

The service inserts one row per generated chunk with the following fields:

- `id`
- `document_id`
- `chunk_text`
- `chunk_index`
- `page_number`
- `token_count`

### Schema alignment notes

The table also contains `section` and `metadata` columns, but the current service does **not** populate them.

---

## 7. Chunking design

## 7.1 Token model

The service uses `tiktoken` with the `cl100k_base` encoding.

This means chunking is token-based, not character-based.

### Current constants

- `CHUNK_SIZE = 500`
- `CHUNK_OVERLAP = 100`

### Sliding window behavior

The chunking loop advances by:

- `CHUNK_SIZE - CHUNK_OVERLAP = 400` tokens

So each new chunk shares the last 100 tokens of the previous chunk.

### Consequence

This improves retrieval continuity, especially when relevant context spans chunk boundaries.

---

## 8. Text extraction behavior

## 8.1 PDF extraction

`extract_text_from_pdf(content)`:

- Uses `PyPDF2.PdfReader`
- Loads the object bytes from memory
- Iterates through all pages
- Extracts page text with `page.extract_text()`
- Skips pages that produce empty or whitespace-only text
- Returns a list of dictionaries in the form:

```json
{
  "page": 1,
  "text": "..."
}
```

### Notes

- Page numbering is 1-based.
- Empty pages are ignored.
- PDF text quality depends on the source document and OCR availability.

## 8.2 DOCX extraction

`extract_text_from_docx(content)`:

- Uses `python-docx.Document`
- Reads paragraph text from the document
- Concatenates paragraphs with newline separators
- Approximates pages by slicing the text into 3000-character segments
- Returns a list of `{"page": <n>, "text": <segment>}` entries

### Notes

- This is an approximation, not true page detection.
- DOC files are treated the same as DOCX files in the current implementation.
- Because the library reads DOCX natively, legacy `.doc` files may not parse correctly unless they are already compatible.

## 8.3 TXT extraction

For TXT files:

- The entire object is decoded as UTF-8 with replacement for invalid bytes.
- The file is treated as a single page with `page=1`.

## 8.4 Unsupported file types

If the extension is not one of:

- `pdf`
- `docx`
- `doc`
- `txt`

then the endpoint returns:

```json
{
  "error": "Unsupported file type: <ext>",
  "chunks": [],
  "chunk_count": 0
}
```

This is a plain JSON response, not an HTTP error.

---

## 9. API surface

## 9.1 `GET /health`

### Purpose
Returns a simple liveness response.

### Response

```json
{
  "status": "healthy",
  "service": "chunking-service"
}
```

---

## 9.2 `POST /chunk`

### Purpose
Downloads a stored document from MinIO, extracts text, chunks it, stores chunk rows in PostgreSQL, and updates the document record.

### Request body

```json
{
  "document_id": "uuid",
  "minio_path": "documents/<document_id>/<filename>",
  "filename": "policy.pdf"
}
```

### Request model

The request is represented by `ChunkRequest`:

- `document_id: str`
- `minio_path: str`
- `filename: str`

### Processing flow

1. Create a MinIO client.
2. Download the object from `MINIO_BUCKET` using `minio_path`.
3. Read the full file into memory.
4. Infer the file extension from `filename`.
5. Extract page text according to file type.
6. Split each page’s text into overlapping token chunks.
7. Renumber chunk indexes globally across the full document.
8. Insert each chunk into PostgreSQL.
9. Update `documents.status` to `chunked`.
10. Update `documents.chunk_count` with the total number of chunks.
11. Return the generated chunk metadata.

### Response example

```json
{
  "document_id": "4fba2f7c-2d15-4d37-9af8-3cbd6d0f0c5d",
  "chunk_count": 12,
  "chunks": [
    {
      "chunk_index": 0,
      "chunk_text": "...",
      "page_number": 1,
      "token_count": 500
    }
  ]
}
```

---

## 10. Chunk record format

Each generated chunk has these in-memory fields before persistence:

- `chunk_index`
- `chunk_text`
- `page_number`
- `token_count`

When stored, the service adds a UUID `id`.

### Database insert shape

```sql
INSERT INTO chunks (id, document_id, chunk_text, chunk_index, page_number, token_count)
VALUES (...)
```

### Important observation

The current code does not store chunk `metadata` or `section`, even though the schema supports those fields.

---

## 11. Document status lifecycle

The service assumes a document has already been uploaded by `document-service`.

### Current state transition

1. `document-service` creates the row with `status='uploaded'`
2. `chunking-service` inserts chunks
3. `chunking-service` updates the document row to `status='chunked'`
4. `documents.chunk_count` is set to the number of generated chunks

This service does not create the initial document record.

---

## 12. Error handling model

The current error handling is minimal and mostly implicit.

### Observed behavior

- Unsupported extensions return a normal JSON error payload.
- MinIO retrieval failures will surface as runtime exceptions.
- PostgreSQL connection or insert failures will surface as runtime exceptions.
- There is no explicit try/catch around the MinIO download block.
- The MinIO response is closed, but `release_conn()` is not called in the current code.

### Practical implications

- The service is functional but not defensive.
- Errors can propagate directly to the caller as 500-level failures.
- Operational logs and orchestration health checks become important for diagnosis.

---

## 13. Performance characteristics

### In-memory processing

The service loads the full document into memory before processing.

This is acceptable for the current POC scale, but it is not ideal for very large documents.

### Tokenization cost

`chunk_text()` tokenizes the entire page text before chunking. For large inputs, tokenization may become CPU-intensive.

### Database writes

Each chunk is inserted individually in a single transaction.

This keeps the write model straightforward but may be slower for very large documents.

---

## 14. Security and trust considerations

### Service trust model

The service does not authenticate requests on its own. It assumes trusted internal access, typically via the API gateway.

### Input trust

The request body must provide both `document_id` and `minio_path`. The service does not verify that the path belongs to the document ID.

### Data integrity concern

Because the service trusts the caller-provided `minio_path`, a malformed or malicious request could point at another object if network access and bucket permissions allow it.

In a hardened deployment, this should be validated against the `documents` table before use.

---

## 15. Implementation caveats

### DOC support is approximate

The service treats `.doc` and `.docx` the same for extraction. That works only if the file is actually parseable by `python-docx`.

### Page mapping for DOCX is approximate

The service estimates page boundaries by slicing text every 3000 characters. This is a heuristic, not a true pagination system.

### Unsupported file handling is not strict

Instead of raising an HTTP error, the service returns a JSON error object with `chunks: []` and `chunk_count: 0`.

### Chunk numbering is global

Each page is chunked independently, but the final `chunk_index` is renumbered across the whole document.

### Schema fields are underused

The database schema contains fields such as `section` and `metadata`, but the service currently ignores them.

---

## 16. End-to-end integration role

`chunking-service` is the text normalization bridge in the ingestion pipeline.

### Upstream dependency

- `document-service` stores the original file and creates the document row.

### Downstream consumer

- `embedding-service` consumes the resulting `chunks` table entries to build vector embeddings.

### Pipeline summary

1. `document-service` stores file metadata and payload
2. `chunking-service` downloads the payload from MinIO
3. `chunking-service` extracts and chunks text
4. `chunking-service` persists chunk rows to PostgreSQL
5. `embedding-service` turns chunk rows into embeddings

In short, `chunking-service` converts raw documents into retrieval-ready text units.

---

## 17. Quick reference

### Public endpoints

- `GET /health`
- `POST /chunk`

### Persistent dependencies

- MinIO bucket: `ragnarok-documents`
- PostgreSQL tables: `documents`, `chunks`

### Key constants

- Chunk size: `500` tokens
- Chunk overlap: `100` tokens
- Encoding: `cl100k_base`

### Supported file types

- `pdf`
- `docx`
- `doc`
- `txt`

---

## 18. Suggested improvements

These are high-value follow-up improvements:

1. Raise an explicit HTTP error for unsupported file types.
2. Validate that `document_id` exists before downloading or writing chunks.
3. Verify that `minio_path` belongs to the requested document.
4. Add `release_conn()` and stronger cleanup around MinIO response handling.
5. Add a try/except layer for MinIO and PostgreSQL failures with structured error messages.
6. Store `section` and `metadata` values if they become useful for retrieval.
7. Improve `.doc` support or reject true legacy `.doc` files explicitly.
8. Add unit tests for token splitting, PDF extraction, and DOCX segmentation.

---

## 19. Minimal operational summary

If you only need the shortest accurate summary:

- `chunking-service` downloads a document from MinIO.
- It extracts text from PDF, DOCX/DOC, or TXT files.
- It chunks text into 500-token windows with 100-token overlap.
- It writes chunk rows into PostgreSQL.
- It updates the document record to `chunked` and sets `chunk_count`.
- It is the bridge between raw uploads and vector embedding.

