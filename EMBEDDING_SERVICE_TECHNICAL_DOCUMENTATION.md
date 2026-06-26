# embedding-service — Technical Documentation

## 1. Service purpose

`embedding-service` transforms chunk text into dense vector embeddings and stores them in Qdrant for downstream semantic retrieval.

It is the vectorization stage of the RAGnarok ingestion pipeline:

- `document-service` stores the raw document
- `chunking-service` splits the document into chunks
- `embedding-service` converts chunks into vectors and persists them in Qdrant
- `retrieval-service` later searches those vectors at query time

---

## 2. Responsibilities

The service currently handles three core responsibilities:

1. **Startup initialization**
   - Loads the embedding model.
   - Connects to Qdrant.
   - Creates the target collection if it does not already exist.

2. **Chunk embedding**
   - Accepts a document ID plus a list of chunk payloads.
   - Encodes each chunk’s text with a SentenceTransformer model.
   - Upserts the vectors into Qdrant along with searchable metadata.

3. **Query embedding**
   - Accepts a single text string.
   - Returns the normalized embedding vector.

---

## 3. Code entry point

The service entry point is `services/embedding-service/main.py`.

Key runtime symbols:

- **FastAPI application**: `app = FastAPI(...)`
- **Startup hook**: `startup()`
- **Global resources**:
  - `model`
  - `qdrant`
- **Request models**:
  - `EmbedRequest`
  - `EmbedTextRequest`
- **Routes**:
  - `GET /health`
  - `POST /embed`
  - `POST /embed-query`

---

## 4. Runtime dependencies

The service depends on these Python packages from `services/embedding-service/requirements.txt`:

- `fastapi`
- `uvicorn`
- `sentence-transformers`
- `qdrant-client`
- `pydantic`
- `numpy`

### External services

`embedding-service` requires the following infrastructure:

- **Qdrant** for vector storage
- A local or cached Hugging Face model download path for the embedding model

### Docker wiring

In `docker-compose.yml`, the service is configured with:

- `QDRANT_HOST=qdrant`
- `QDRANT_PORT=6333`
- `COLLECTION_NAME=enterprise_knowledge`

It exposes port `8003` and depends on Qdrant being available.

---

## 5. Container build notes

The Dockerfile uses `python:3.12-slim` and installs `build-essential` before installing dependencies.

Why that matters:

- `sentence-transformers` and transitive packages may require build tooling during installation in some environments.
- The slim base image keeps the service footprint smaller while still supporting package compilation.

---

## 6. Model configuration

The service currently uses a fixed model name:

- `MODEL_NAME = "BAAI/bge-small-en-v1.5"`

### Vector dimension

The service expects embeddings with dimension `384`.

That value is used when creating the Qdrant collection:

- `VECTOR_DIM = 384`

### Normalization

Both chunk embeddings and query embeddings are normalized:

- `normalize_embeddings=True`

This matches the cosine similarity distance configured in Qdrant.

---

## 7. Qdrant collection design

### Collection name

The collection name is read from `COLLECTION_NAME`, defaulting to:

- `enterprise_knowledge`

### Startup behavior

On startup, the service:

1. Connects to Qdrant.
2. Lists existing collections.
3. Checks whether the configured collection already exists.
4. Creates the collection if it does not exist.

### Collection configuration

The collection is created with:

- vector size: `384`
- distance: `COSINE`

### Operational implication

The service does not version the collection schema. If the embedding model changes, the collection size and/or semantic assumptions must be kept in sync manually.

---

## 8. Data model usage

`embedding-service` does **not** write to PostgreSQL tables from `init-scripts/01-init.sql`.

That schema defines document, chunk, feedback, and audit metadata, but embeddings themselves live in Qdrant.

### How it relates to SQL data

The service expects chunk payloads that are usually derived from the `chunks` table:

- `chunk_text`
- `chunk_index`
- `page_number`
- `section`
- `token_count`
- optional `id`

### What gets stored in Qdrant payloads

Each vector point stores payload metadata including:

- `document_id`
- `filename`
- `chunk_text`
- `chunk_index`
- `page_number`
- `section`
- `token_count`

---

## 9. API surface

## 9.1 `GET /health`

### Purpose
Returns a simple liveness response.

### Response

```json
{
  "status": "healthy",
  "service": "embedding-service"
}
```

---

## 9.2 `POST /embed`

### Purpose
Generates embeddings for a list of document chunks and upserts them into Qdrant.

### Request body

```json
{
  "document_id": "uuid",
  "filename": "policy.pdf",
  "chunks": [
    {
      "id": "optional-chunk-id",
      "chunk_text": "chunk content",
      "chunk_index": 0,
      "page_number": 1,
      "section": "optional",
      "token_count": 500
    }
  ]
}
```

### Request model

The request is represented by `EmbedRequest`:

- `document_id: str`
- `filename: str = ""`
- `chunks: list[dict]`

### Processing flow

1. If `chunks` is empty, return `vectors_stored: 0` immediately.
2. Extract `chunk_text` from each chunk.
3. Encode all chunk texts using the SentenceTransformer model.
4. Normalize the embeddings.
5. Create Qdrant `PointStruct` entries.
6. Use the chunk `id` if present.
7. Otherwise, synthesize an ID using `document_id` and the chunk index.
8. Upsert the vectors to Qdrant in batches of 100.
9. Return the number of stored vectors.

### Response example

```json
{
  "vectors_stored": 3,
  "document_id": "4fba2f7c-2d15-4d37-9af8-3cbd6d0f0c5d"
}
```

### Qdrant point payload

Each stored point includes:

- vector: embedding array of length 384
- payload: document and chunk metadata

### Upsert batching

The service writes points in batches of 100. This keeps large document ingestion from sending a single oversized write request.

---

## 9.3 `POST /embed-query`

### Purpose
Generates an embedding for a single query string.

### Request body

```json
{
  "text": "What is the policy for expense approvals?"
}
```

### Request model

The request is represented by `EmbedTextRequest`:

- `text: str`

### Response example

```json
{
  "embedding": [0.0123, -0.0441, 0.081, "..."]
}
```

### Intended use

This endpoint is useful for semantic retrieval pipelines and debugging, where the raw vector is needed directly.

---

## 10. Startup lifecycle

The service initializes expensive resources once on startup.

### Steps

1. Log the model load operation.
2. Load `BAAI/bge-small-en-v1.5` into memory.
3. Connect to Qdrant.
4. Ensure the target collection exists.

### Why this matters

- The model load is the heaviest part of startup.
- Startup may take noticeable time on cold boot.
- Requests should not be served until the model and Qdrant client are ready.

---

## 11. Embedding pipeline behavior

### Chunk embedding path

For each chunk request:

- `chunk_text` is encoded independently
- the resulting embedding is attached to the chunk’s metadata
- the final payload is upserted into Qdrant

### Query embedding path

For query requests:

- only the input text is encoded
- the service returns the raw normalized vector
- no persistence occurs

### Important note

The service does not itself retrieve chunks from PostgreSQL. It assumes the caller has already assembled the chunk payloads.

---

## 12. Error handling model

The current implementation is intentionally lightweight.

### Observed behavior

- Empty chunk list returns success with zero stored vectors.
- There is no explicit validation that `chunk_text` exists in every chunk dictionary beyond runtime access.
- Qdrant connection failures can surface as runtime errors.
- Model loading failures can prevent service startup.
- Embedding generation errors will propagate to the caller.

### Practical implications

- The service is simple but relies on upstream services and valid request payloads.
- Operational observability is important for diagnosing startup or model-download issues.

---

## 13. Performance characteristics

### Model load cost

`SentenceTransformer` initialization is the dominant cold-start cost.

### Batch inference

The service encodes all chunk texts in one call to `model.encode(texts, ...)`, which is efficient for throughput.

### Write batching

Upserts are batched in groups of 100 points to reduce request size and improve write efficiency.

### Memory behavior

The service holds chunk texts, embeddings, and Qdrant points in memory during a request. This is appropriate for the POC scale but should be monitored for very large ingestion jobs.

---

## 14. Security and trust considerations

### Service trust model

The service does not authenticate requests itself. It assumes trusted internal access through the API gateway or internal service network.

### Payload trust

The service trusts the provided chunk payloads, including `document_id`, `filename`, and `chunk_text`.

### Data integrity concern

Because chunk data is accepted from the caller, incorrect or malicious payloads could lead to incorrect vector records in Qdrant.

In a hardened deployment, consider validating the chunks against PostgreSQL before embedding.

---

## 15. Implementation caveats

### No PostgreSQL writes

The service does not persist any metadata into PostgreSQL. It only writes vectors and payloads to Qdrant.

### No schema migration logic

If the embedding model changes, the collection may need to be recreated manually.

### Payload size growth

Because `chunk_text` is stored in the Qdrant payload, the vector store carries both semantic vectors and the raw text. This is convenient for retrieval but increases storage size.

### Optional `id` handling

If a chunk does not include an `id`, the service generates one from `document_id` and the index. That is useful, but it means IDs are only stable when the chunk order is stable.

### Unused import

`CollectionStatus` is imported but not used in the current implementation.

---

## 16. End-to-end integration role

`embedding-service` bridges the gap between chunked text and semantic search.

### Upstream dependency

- `chunking-service` produces chunk records to be embedded.

### Downstream consumer

- `retrieval-service` searches Qdrant for relevant vectors at query time.

### Pipeline summary

1. `document-service` stores the uploaded file.
2. `chunking-service` extracts and splits the file.
3. `embedding-service` converts chunks into vectors.
4. `retrieval-service` searches those vectors to support grounded answers.

In short, `embedding-service` is the service that makes the document corpus searchable by meaning.

---

## 17. Quick reference

### Public endpoints

- `GET /health`
- `POST /embed`
- `POST /embed-query`

### Persistent dependency

- Qdrant collection: `enterprise_knowledge`

### Embedding configuration

- Model: `BAAI/bge-small-en-v1.5`
- Vector dimension: `384`
- Distance: `COSINE`
- Normalization: `enabled`

### Batch behavior

- Upsert batch size: `100`

---

## 18. Suggested improvements

These are high-value follow-up improvements:

1. Add explicit validation for `chunk_text` and other required chunk fields.
2. Validate embedding dimension before upserting.
3. Add startup retries or clearer health signaling for Qdrant/model readiness.
4. Add Qdrant payload schema conventions for future compatibility.
5. Introduce collection versioning if the model changes.
6. Add tests for batch upsert behavior and point ID generation.
7. Consider storing only minimal payload data in Qdrant if storage growth becomes a concern.
8. Add structured error handling for invalid request payloads and model failures.

---

## 19. Minimal operational summary

If you only need the shortest accurate summary:

- `embedding-service` loads a SentenceTransformer model on startup.
- It creates a Qdrant collection if needed.
- It embeds document chunks and stores vectors plus metadata in Qdrant.
- It can also embed a single query text and return the vector directly.
- It is the service that makes chunked documents available for semantic retrieval.

