# RAGnarok — Enterprise Knowledge Copilot

A fully working Proof of Concept (POC) demonstrating a RAG-based enterprise knowledge assistant with **inline citations**, **confidence scoring**, **explainability**, **RBAC**, **feedback collection**, **query audit logging**, **Admin Console**, **Jira integration**, and **web link ingestion**.

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
                                                  │
                                            ┌─────┴─────┐
                                            │   Jira    │
                                            │ (optional)│
                                            └───────────┘
```

### Components (17 Docker Containers)

| Container | Port | Technology | Purpose |
|-----------|------|-----------|---------|
| `frontend` | 3000 | React 18, Vite, TypeScript, MUI | Web UI with chat, admin console, sources, explanations |
| `api-gateway` | 8000 | FastAPI | Routes requests, JWT validation, Jira integration |
| `document-service` | 8001 | FastAPI, MinIO | PDF/DOCX upload, URL ingestion, and storage |
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
| LLM | Ollama with llama3.1:8b (fallback qwen3:8b) |

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

After Ollama starts, pull a model (choose one):

```bash
# Primary model (recommended)
docker compose exec ollama ollama pull llama3.1:8b

# OR fallback model
docker compose exec ollama ollama pull qwen3:8b
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
| `admin` | `admin123` | admin | Full access (includes Admin Console) |
| `user` | `user123` | user | Standard access (chat and document viewing) |

1. Open http://localhost:3000
2. Click "Sign in with Keycloak"
3. Enter credentials on the Keycloak login page

---

## Features

### Chat Interface
- Type a question in the chat input and press Enter or click Send
- The system retrieves relevant chunks, generates a grounded answer via Ollama, and returns:
  - **Answer** with inline `[1]`, `[2]` citations
  - **Confidence score** (HIGH / MEDIUM / LOW) with breakdown
  - **Sources panel** showing referenced document chunks
  - **Explanation panel** with step-by-step reasoning trail
- Low-confidence answers show an **"Escalate for Human Review"** button

### Document Upload (Admin)
- In the left sidebar, select Department and Access Level
- **File Upload** tab: Click "Select PDF or DOCX" to upload a local file
- The file is uploaded to MinIO, chunked (500 tokens, 100 overlap), embedded with BGE, and stored in Qdrant

### Web Link Ingestion (Admin)
- In the left sidebar, switch to the **Webpage Link** tab
- Enter any public URL (e.g. `https://example.com/article`)
- The system fetches the page, strips HTML (scripts, styles, nav, etc.), extracts clean text, stores it in MinIO, and runs the full chunking → embedding → vector store pipeline
- Ingested web pages appear in the document list with a globe icon

### Feedback & Escalation
- **Quick feedback**: Click thumbs up/down on any response
- **Detailed feedback**: Click the feedback icon to rate (1-5 stars), add comments, or suggest corrections
- **Escalation**: Request human review for low-confidence answers — admins can resolve these in the Admin Console

### Admin Console
Admins see an **"Admin Dashboard"** button in the top toolbar. The console has six tabs:

#### Metrics
- **KPI cards**: Total queries, average confidence, average latency, pending reviews, average rating, total feedback
- **Confidence distribution**: Bar chart showing HIGH / MEDIUM / LOW breakdown
- **Latency distribution**: Bucketed into fast (< 1s), normal (1–5s), and slow (> 5s)
- **Feedback signals**: Positive/negative/corrections count with worst-performing queries
- **Satisfaction trend**: 14-day sparkline of average user rating
- **Pending human reviews**: List of escalated queries awaiting resolution, with one-click resolve

#### Audit Logs
- Expandable table of recent queries with confidence score, latency, escalation status, and full response text
- Model used per query

#### Services
- **Real-time health monitoring** of all 12 backend services
- Services grouped by role (Core, ML, Processing, Storage, Data, Auth)
- Each service shows UP / DOWN / DEGRADED status with latency
- Auto-refreshes every 10 seconds

#### Service Logs
- **Live Docker container log viewer** for all 17 containers
- Select any service from a dropdown to tail its logs
- Syntax-highlighted output (errors in red, warnings in yellow, info in blue)
- Configurable tail limit (50–1000 lines)
- Auto-refresh toggle (5-second interval)
- Copy logs to clipboard

#### Onboard User
- Create new users directly from the Admin Console (no need to open Keycloak admin UI)
- Set username, first name, last name, email, password, and role (user or admin)
- Users are created in Keycloak with the assigned realm role

#### Manage Users
- View all users in the Keycloak realm with their roles and creation dates
- **Change password** for any user
- **Delete users** (with safety checks: cannot delete yourself or the default admin)

### Jira Integration
RAGnarok integrates with Jira for both **real-time query augmentation** and **bulk knowledge ingestion**.

#### Real-Time Query Augmentation
When a user asks a question that references Jira issue keys (e.g. `TS0-1`, `PROJ-123`), the API gateway:
1. Fetches the issue details live from Jira (summary, description, status, priority, assignee, comments)
2. Injects them as high-priority context chunks before the LLM generates an answer
3. Citations link back to the original Jira issue

When a query mentions general Jira keywords ("jira", "ticket", "issue"), the system fetches and injects a project directory listing of recent issues.

#### Bulk Sync (Admin Console → Jira Integration tab)
- **Live Jira Issues**: View real-time ticket status from Jira using a JQL filter
- **RAG Vector Ingestion Sync**: Ingest Jira tickets into the vector store for semantic search
  - Specify a JQL query (e.g. `project = "TS0"`)
  - Each matching ticket is converted to a structured markdown document, uploaded, chunked, and embedded
  - Console output shows progress and any errors
  - After sync, users can query against Jira ticket content just like any other document

#### Jira Configuration
Set the following environment variables in `.env` to enable Jira integration:

```bash
# Jira Integration (optional)
JIRA_URL=https://your-instance.atlassian.net     # Jira base URL
JIRA_AUTH_METHOD=basic                            # "basic" or "bearer"
JIRA_EMAIL=your-email@company.com                 # For basic auth
JIRA_API_TOKEN=your-jira-api-token                # API token
JIRA_SYNC_JQL=project = 'RAG'                     # Default JQL for sync
```

Supports Jira Cloud (API v3) and Jira Server/Data Center (API v2) with automatic fallback.

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
Submit a question to the knowledge base. If Jira is configured, issue keys in the query are resolved in real-time.

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
Upload a PDF or DOCX document (admin only).

```bash
curl -X POST http://localhost:8000/api/v1/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf" \
  -F "department=engineering" \
  -F "access_level=basic"
```

### POST /api/v1/ingest-url
Ingest a web page by URL — fetches, cleans HTML, chunks, and embeds (admin only).

```bash
curl -X POST http://localhost:8000/api/v1/ingest-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "department": "engineering", "access_level": "basic"}'
```

### POST /api/v1/feedback
Submit feedback on a response.

```bash
curl -X POST http://localhost:8000/api/v1/feedback \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comment": "Very helpful!", "query_text": "How to reset VPN?"}'
```

### POST /api/v1/escalations
Request human review for a query response.

```bash
curl -X POST http://localhost:8000/api/v1/escalations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query_id": "uuid", "reason": "Answer seems incorrect"}'
```

### POST /api/v1/onboard-user
Create a new user in Keycloak (admin only).

```bash
curl -X POST http://localhost:8000/api/v1/onboard-user \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"username": "john", "email": "john@company.com", "password": "temp123", "role": "user", "first_name": "John", "last_name": "Doe"}'
```

### GET /api/v1/users
List all users with their roles (admin only).

### PUT /api/v1/users/{user_id}/password
Update a user's password (admin only).

### DELETE /api/v1/users/{user_id}
Delete a user from the realm (admin only).

### POST /api/v1/jira/sync
Sync Jira tickets to the vector store using JQL (admin only).

```bash
curl -X POST http://localhost:8000/api/v1/jira/sync \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jql": "project = '\''TS0'\''"}'
```

### GET /api/v1/jira/live-issues
Fetch live Jira issues without syncing (admin only).

```bash
curl http://localhost:8000/api/v1/jira/live-issues?jql=project%20%3D%20%27TS0%27 \
  -H "Authorization: Bearer <token>"
```

### GET /api/v1/services/health
Aggregate real-time health status of all services (admin only).

### GET /api/v1/services/{service_name}/logs
Retrieve Docker container logs for a specific service (admin only).

### GET /api/v1/documents
List all uploaded documents.

### GET /api/v1/documents/{document_id}/download
Download or view the original source document. For Jira-sourced documents, redirects to the Jira issue URL.

### GET /api/v1/logs
Expose audit logs to admins.

### GET /api/v1/logs/stats
Expose RAG pipeline metrics (total queries, avg confidence, avg latency, etc.) to admins.

### GET /api/v1/feedback/stats
Expose feedback analytics (avg rating, satisfaction trend, worst queries) to admins.

### GET /api/v1/escalations
List escalated queries for admins.

### POST /api/v1/escalations/{query_id}/resolve
Resolve an escalated query (admin only).

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
       ▲                                        │
       │ (if Jira             ┌─────────────────┤
       │  configured)         ▼                  ▼
  ┌────┴──────┐       ┌──────────────┐     ┌──────────────┐
  │ Jira API  │       │ Explanation  │     │ Confidence   │
  │ Real-time │       │ Engine       │     │ Service      │
  │ issue     │       │ Why this     │     │ HIGH/MED/LOW │
  │ injection │       │ answer?      │     │ Multi-signal │
  └───────────┘       └──────────────┘     └──────────────┘
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
File Upload / URL Ingestion / Jira Sync
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Document    │────▶│  Chunking    │────▶│  Embedding   │
│  Service     │     │  Service     │     │  Service     │
│  MinIO store │     │  500 tokens  │     │  BGE model   │
│  PG metadata │     │  100 overlap │     │  → Qdrant    │
└──────────────┘     └──────────────┘     └──────────────┘
```

Supported knowledge sources:
- **PDF / DOCX / TXT** — uploaded via the sidebar or API
- **Web pages** — any public URL, fetched and cleaned automatically
- **Jira tickets** — bulk-synced via JQL or injected in real-time during queries

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

### Jira integration not working
Ensure `.env` contains valid `JIRA_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`. Verify connectivity:
```bash
docker compose logs api-gateway | grep -i jira
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
│       │   ├── ChatMessage.tsx     # Message with citations/confidence/escalation
│       │   ├── AdminDashboard.tsx  # Admin console (metrics, services, logs, users, Jira)
│       │   ├── DocumentUpload.tsx  # File upload + URL ingestion widget
│       │   ├── DocumentList.tsx    # Document listing with type icons
│       │   ├── SourcePanel.tsx     # Citation sources display
│       │   ├── ExplanationPanel.tsx# Reasoning trail
│       │   ├── ConfidenceIndicator.tsx # Confidence bars
│       │   └── FeedbackWidget.tsx  # Rating + comments
│       ├── services/
│       │   ├── api.ts          # API client (query, upload, URL ingest, Jira, users)
│       │   └── keycloak.ts     # Keycloak config
│       ├── types/
│       │   └── index.ts        # TypeScript types
│       └── theme/
│           └── theme.ts        # Dark MUI theme
└── services/
    ├── api-gateway/            # JWT auth, request routing, Jira integration, user management
    ├── document-service/       # MinIO upload, URL ingestion, PG metadata
    ├── chunking-service/       # Text extraction + chunking
    ├── embedding-service/      # BGE embeddings → Qdrant
    ├── retrieval-service/      # Semantic search + RBAC
    ├── llm-service/            # Ollama prompt + generation
    ├── citation-service/       # Inline citations
    ├── explanation-service/    # Reasoning explanations
    ├── confidence-service/     # Multi-signal scoring
    ├── feedback-service/       # User feedback storage
    └── audit-service/          # Query logging + stats + escalations
```

---

## License

This project is a Proof of Concept using 100% open-source technologies.
