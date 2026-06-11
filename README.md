# RAGnarok — Enterprise Knowledge Copilot

A fully working Proof of Concept (POC) demonstrating a RAG-based enterprise knowledge assistant with **inline citations**, **confidence scoring**, **explainability**, **RBAC**, **feedback collection**, and **query audit logging**.

Built with 100% free/open-source technologies. Runs entirely locally using Docker Compose.

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────▶│  API Gateway │────▶│  Microservices  │
│  React/Vite  │     │   FastAPI    │     │  (11 services)  │
│  Material UI │     │  JWT/RBAC    │     │                 │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                    │                      │
       │              ┌─────┴──────┐          ┌────┴────┐
       │              │  Keycloak  │          │ Ollama  │
       │              │   (Auth)   │          │ (LLM)   │
       │              └────────────┘          └─────────┘
       │                                          │
  ┌────┴────────────────────────────────────┐     │
  │          Infrastructure                  │     │
  │  PostgreSQL │ MinIO │ Qdrant            │     │
  └─────────────────────────────────────────┘     │
```

### Components (17 Docker Containers)

| Container | Port | Technology | Purpose |
|-----------|------|-----------|---------|
| `frontend` | 3000 | React 18, Vite, TypeScript, MUI | Web UI with chat, sources, explanations |
| `api-gateway` | 8000 | FastAPI | Routes requests, JWT validation |
| `document-service` | 8001 | FastAPI, MinIO | PDF/DOCX upload and storage |
| `chunking-service` | 8002 | FastAPI, tiktoken | 500-token chunks, 100-token overlap |
| `embedding-service` | 8003 | FastAPI, SentenceTransformers | BGE embeddings → Qdrant |
| `retrieval-service` | 8004 | FastAPI, Qdrant | Semantic search with RBAC filtering |
| `llm-service` | 8005 | FastAPI, Ollama | Grounded answer generation |
| `citation-service` | 8006 | FastAPI | Inline citation extraction |
| `explanation-service` | 8007 | FastAPI | "Why this answer?" reasoning |
| `confidence-service` | 8008 | FastAPI | HIGH/MEDIUM/LOW scoring |
| `feedback-service` | 8009 | FastAPI, PostgreSQL | Ratings and corrections |
| `audit-service` | 8010 | FastAPI, PostgreSQL | Query logging and metrics |
| `postgres` | 5432 | PostgreSQL 16 | Metadata, feedback, audit logs |
| `minio` | 9000/9001 | MinIO | Document object storage |
| `qdrant` | 6333 | Qdrant | Vector database |
| `keycloak` | 8080 | Keycloak 24 | Authentication and RBAC |
| `ollama` | 11434 | Ollama | Local LLM inference |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Material UI |
| Backend | Python 3.12, FastAPI, Pydantic, Uvicorn |
| Authentication | Keycloak Community Edition |
| Database | PostgreSQL 16 |
| Object Storage | MinIO |
| Embeddings | BAAI/bge-small-en-v1.5 via SentenceTransformers |
| Vector DB | Qdrant Community Edition |
| LLM | Ollama with llama3.1:8b |

---

## Prerequisites

- **Docker** (v20.10+) and **Docker Compose** (v2.0+)
- **16 GB RAM** minimum (LLM model requires ~6 GB)
- **20 GB free disk** space (for models and container images)

---

## Quick Start

### 1. Clone and Start

```bash
git clone https://github.com/findrahulon/myrepo.git
cd myrepo
docker compose up -d --build
```

### 2. Pull an LLM Model

The `ollama-init` container automatically pulls `llama3.1:8b` on first startup. To manually pull or update:

```bash
docker compose exec ollama ollama pull llama3.1:8b
```

### 3. Access the Application

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | See Keycloak users below |
| **API Gateway** | http://localhost:8000/health | — |
| **Keycloak Admin** | http://localhost:8080/admin | admin / admin123 |
| **MinIO Console** | http://localhost:9001 | minioadmin / minioadmin123 |
| **Qdrant Dashboard** | http://localhost:6333/dashboard | — |

### 4. Login

The Keycloak realm is pre-configured with two users:

| Username | Password | Role | Access Level |
|----------|----------|------|-------------|
| `admin` | `admin123` | admin | Full access |
| `user` | `user123` | user | Standard access |

1. Open http://localhost:3000
2. Click "Sign in with Keycloak"
3. Enter credentials on the Keycloak login page

---

## Usage Walkthrough

### Upload Documents
1. In the left sidebar, select Department and Access Level
2. Click "Select PDF or DOCX" and choose a file
3. The file is uploaded to MinIO, chunked (500 tokens, 100 overlap), embedded with BGE, and stored in Qdrant

### Ask Questions
1. Type a question in the chat input
2. The system retrieves relevant chunks, generates a grounded answer via Ollama, and returns:
   - **Answer** with inline `[1]`, `[2]` citations
   - **Confidence score** (HIGH / MEDIUM / LOW) with breakdown
   - **Sources panel** showing referenced document chunks
   - **Explanation panel** with step-by-step reasoning trail

### Provide Feedback
- Quick: Click thumbs up/down on any response
- Detailed: Click the feedback icon to rate (1-5 stars), add comments, or suggest corrections

---

## Running Individual Components Locally (Without Docker)

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### API Gateway

```bash
cd services/api-gateway
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Document Service

```bash
cd services/document-service
pip install -r requirements.txt
# Requires: PostgreSQL on localhost:5432, MinIO on localhost:9000
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### Chunking Service

```bash
cd services/chunking-service
pip install -r requirements.txt
# Requires: PostgreSQL on localhost:5432, MinIO on localhost:9000
uvicorn main:app --host 0.0.0.0 --port 8002 --reload
```

### Embedding Service

```bash
cd services/embedding-service
pip install -r requirements.txt
# Requires: Qdrant on localhost:6333
# Downloads BGE model on first run (~130 MB)
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

### Retrieval Service

```bash
cd services/retrieval-service
pip install -r requirements.txt
# Requires: Qdrant on localhost:6333
uvicorn main:app --host 0.0.0.0 --port 8004 --reload
```

### LLM Service

```bash
cd services/llm-service
pip install -r requirements.txt
# Requires: Ollama on localhost:11434 with a model pulled
uvicorn main:app --host 0.0.0.0 --port 8005 --reload
```

### Citation Service

```bash
cd services/citation-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8006 --reload
```

### Explanation Service

```bash
cd services/explanation-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8007 --reload
```

### Confidence Service

```bash
cd services/confidence-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8008 --reload
```

### Feedback Service

```bash
cd services/feedback-service
pip install -r requirements.txt
# Requires: PostgreSQL on localhost:5432
uvicorn main:app --host 0.0.0.0 --port 8009 --reload
```

### Audit Service

```bash
cd services/audit-service
pip install -r requirements.txt
# Requires: PostgreSQL on localhost:5432
uvicorn main:app --host 0.0.0.0 --port 8010 --reload
```

---

## API Reference

### POST /api/v1/query
Submit a question to the knowledge base.

```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "How to reset VPN?"}'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "answer": "To reset the VPN... [1]",
    "citations": [{"index": 1, "doc_title": "...", "page": 12, "relevance_score": 0.94}],
    "confidence": {"overall": 0.87, "level": "HIGH", "breakdown": {...}},
    "explanation": {"summary": "...", "reasoning_steps": [...]}
  },
  "meta": {"request_id": "uuid", "latency_ms": 2340, "model_used": "llama3.1:8b"}
}
```

### POST /api/v1/upload
Upload a PDF or DOCX document.

```bash
curl -X POST http://localhost:8000/api/v1/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf" \
  -F "department=engineering" \
  -F "access_level=basic"
```

### POST /api/v1/feedback
Submit feedback on a response.

```bash
curl -X POST http://localhost:8000/api/v1/feedback \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comment": "Very helpful!", "query_text": "How to reset VPN?"}'
```

### GET /api/v1/documents
List all uploaded documents.

### GET /health
API Gateway health check.

---

## RAG Pipeline Flow

```
User Query
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Retrieval   │────▶│  LLM Service │────▶│   Citation   │
│  Service     │     │  (Ollama)    │     │   Engine     │
│  Qdrant +    │     │  Grounded    │     │  Inline refs │
│  RBAC filter │     │  generation  │     │  [1],[2]...  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                           ┌────────────────────┤
                           ▼                    ▼
                    ┌──────────────┐     ┌──────────────┐
                    │ Explanation  │     │ Confidence   │
                    │ Engine       │     │ Service      │
                    │ Why this     │     │ HIGH/MED/LOW │
                    │ answer?      │     │ Multi-signal │
                    └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ Audit Service│
                                         │ Query log    │
                                         │ Latency      │
                                         └──────────────┘
```

## Document Ingestion Flow

```
File Upload
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Document    │────▶│  Chunking    │────▶│  Embedding   │
│  Service     │     │  Service     │     │  Service     │
│  MinIO store │     │  500 tokens  │     │  BGE model   │
│  PG metadata │     │  100 overlap │     │  → Qdrant    │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Troubleshooting

### Keycloak not ready
Keycloak takes 60-90 seconds to start. Check status:
```bash
docker compose logs keycloak
```

### Ollama model not found
Pull the model after Ollama starts:
```bash
docker compose exec ollama ollama pull llama3.1:8b
```

### Embedding service slow on first start
The BGE model (~130 MB) is downloaded on first startup. Subsequent starts use the cached model.

### Port conflicts
If ports are in use, modify the port mappings in `docker-compose.yml`.

### View all service logs
```bash
docker compose logs -f
```

### Restart a specific service
```bash
docker compose restart api-gateway
```

---

## Project Structure

```
myrepo/
├── docker-compose.yml          # All 17 containers
├── .env.example                # Environment configuration
├── .gitignore
├── README.md
├── init-scripts/
│   └── 01-init.sql             # PostgreSQL schema
├── keycloak/
│   └── ragnarok-realm.json     # Pre-configured realm with users/roles
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf              # Reverse proxy config
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx             # Main app with auth + layout
│       ├── components/
│       │   ├── LoginPage.tsx       # Keycloak SSO login
│       │   ├── ChatInterface.tsx   # Chat UI
│       │   ├── ChatMessage.tsx     # Message with citations/confidence
│       │   ├── DocumentUpload.tsx  # File upload widget
│       │   ├── DocumentList.tsx    # Document listing
│       │   ├── SourcePanel.tsx     # Citation sources display
│       │   ├── ExplanationPanel.tsx# Reasoning trail
│       │   ├── ConfidenceIndicator.tsx # Confidence bars
│       │   └── FeedbackWidget.tsx  # Rating + comments
│       ├── services/
│       │   ├── api.ts          # API client
│       │   └── keycloak.ts     # Keycloak config
│       ├── types/
│       │   └── index.ts        # TypeScript types
│       └── theme/
│           └── theme.ts        # Dark MUI theme
└── services/
    ├── api-gateway/            # JWT auth + request routing
    ├── document-service/       # MinIO upload + PG metadata
    ├── chunking-service/       # Text extraction + chunking
    ├── embedding-service/      # BGE embeddings → Qdrant
    ├── retrieval-service/      # Semantic search + RBAC
    ├── llm-service/            # Ollama prompt + generation
    ├── citation-service/       # Inline citations
    ├── explanation-service/    # Reasoning explanations
    ├── confidence-service/     # Multi-signal scoring
    ├── feedback-service/       # User feedback storage
    └── audit-service/          # Query logging + stats
```

---

## License

This project is a Proof of Concept using 100% open-source technologies.
