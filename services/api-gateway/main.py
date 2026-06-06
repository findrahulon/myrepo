"""RAGnarok API Gateway — routes requests to downstream microservices."""

import asyncio
import os
import time
import uuid
from typing import Optional

import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from jose import jwt, JWTError

app = FastAPI(title="RAGnarok API Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service URLs
DOCUMENT_SERVICE = os.getenv("DOCUMENT_SERVICE_URL", "http://localhost:8001")
CHUNKING_SERVICE = os.getenv("CHUNKING_SERVICE_URL", "http://localhost:8002")
EMBEDDING_SERVICE = os.getenv("EMBEDDING_SERVICE_URL", "http://localhost:8003")
RETRIEVAL_SERVICE = os.getenv("RETRIEVAL_SERVICE_URL", "http://localhost:8004")
LLM_SERVICE = os.getenv("LLM_SERVICE_URL", "http://localhost:8005")
CITATION_SERVICE = os.getenv("CITATION_SERVICE_URL", "http://localhost:8006")
EXPLANATION_SERVICE = os.getenv("EXPLANATION_SERVICE_URL", "http://localhost:8007")
CONFIDENCE_SERVICE = os.getenv("CONFIDENCE_SERVICE_URL", "http://localhost:8008")
FEEDBACK_SERVICE = os.getenv("FEEDBACK_SERVICE_URL", "http://localhost:8009")
AUDIT_SERVICE = os.getenv("AUDIT_SERVICE_URL", "http://localhost:8010")
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "ragnarok")
QUERY_TIMEOUT_SECONDS = float(os.getenv("QUERY_TIMEOUT_SECONDS", "300"))

_jwks_cache: dict = {}


async def get_keycloak_public_key():
    """Fetch Keycloak JWKS for token validation."""
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs",
                timeout=10.0,
            )
            _jwks_cache = resp.json()
            return _jwks_cache
        except Exception:
            return None


async def validate_token(request: Request) -> dict:
    """Validate JWT token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split(" ", 1)[1]
    jwks = await get_keycloak_public_key()

    if not jwks:
        # Fallback: decode without verification in dev mode
        try:
            payload = jwt.get_unverified_claims(token)
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        key = None
        for k in jwks.get("keys", []):
            if k["kid"] == kid:
                key = k
                break
        if not key:
            raise HTTPException(status_code=401, detail="Key not found")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience="account",
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {str(e)}")


def extract_user_info(token_payload: dict) -> dict:
    """Extract user info from token payload."""
    realm_roles = token_payload.get("realm_access", {}).get("roles", [])
    access_level = "admin" if "admin" in realm_roles else "user"
    return {
        "user_id": token_payload.get("sub", "anonymous"),
        "username": token_payload.get("preferred_username", "anonymous"),
        "email": token_payload.get("email", ""),
        "roles": realm_roles,
        "access_level": access_level,
    }


# ─── Models ──────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    filters: Optional[dict] = None
    options: Optional[dict] = None


class FeedbackRequest(BaseModel):
    query_id: Optional[str] = None
    query_text: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    correction: Optional[str] = None


class EscalationRequest(BaseModel):
    query_id: str
    reason: Optional[str] = None


class ResolveEscalationRequest(BaseModel):
    resolution: Optional[str] = None


class URLIngestRequest(BaseModel):
    url: str
    department: str = "general"
    access_level: str = "basic"


def require_admin(token_payload: dict) -> dict:
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Endpoints ───────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "api-gateway"}


@app.get("/api/v1/services/health")
async def services_health(token_payload: dict = Depends(validate_token)):
    """Aggregate real-time health of every downstream service."""
    require_admin(token_payload)

    SERVICES = [
        {"name": "api-gateway",         "url": "http://localhost:8000",       "role": "Core"},
        {"name": "document-service",     "url": DOCUMENT_SERVICE,             "role": "Storage"},
        {"name": "chunking-service",     "url": CHUNKING_SERVICE,             "role": "Processing"},
        {"name": "embedding-service",    "url": EMBEDDING_SERVICE,            "role": "ML"},
        {"name": "retrieval-service",    "url": RETRIEVAL_SERVICE,            "role": "ML"},
        {"name": "llm-service",          "url": LLM_SERVICE,                  "role": "ML"},
        {"name": "citation-service",     "url": CITATION_SERVICE,             "role": "Processing"},
        {"name": "explanation-service",  "url": EXPLANATION_SERVICE,          "role": "Processing"},
        {"name": "confidence-service",   "url": CONFIDENCE_SERVICE,           "role": "Processing"},
        {"name": "feedback-service",     "url": FEEDBACK_SERVICE,             "role": "Data"},
        {"name": "audit-service",        "url": AUDIT_SERVICE,                "role": "Data"},
        {"name": "keycloak",             "url": f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/.well-known/openid-configuration", "role": "Auth"},
    ]

    async def ping(svc: dict) -> dict:
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # Keycloak: full URL is already in svc["url"]; others get /health appended
                full_url = svc["url"] if svc["name"] == "keycloak" else f"{svc['url']}/health"
                resp = await client.get(full_url)
            latency_ms = round((time.time() - t0) * 1000)
            if resp.status_code == 200:
                body = resp.json()
                return {
                    "name": svc["name"],
                    "role": svc["role"],
                    "status": "UP",
                    "latency_ms": latency_ms,
                    "detail": body.get("status", "ok"),
                }
            return {
                "name": svc["name"],
                "role": svc["role"],
                "status": "DEGRADED",
                "latency_ms": latency_ms,
                "detail": f"HTTP {resp.status_code}",
            }
        except Exception as exc:
            latency_ms = round((time.time() - t0) * 1000)
            return {
                "name": svc["name"],
                "role": svc["role"],
                "status": "DOWN",
                "latency_ms": latency_ms,
                "detail": str(exc)[:120],
            }

    results = await asyncio.gather(*[ping(s) for s in SERVICES])
    results = list(results)

    up    = sum(1 for r in results if r["status"] == "UP")
    down  = sum(1 for r in results if r["status"] == "DOWN")
    degraded = sum(1 for r in results if r["status"] == "DEGRADED")

    return {
        "services": results,
        "summary": {
            "total": len(results),
            "up": up,
            "down": down,
            "degraded": degraded,
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }


@app.post("/api/v1/query")
async def query(req: QueryRequest, token_payload: dict = Depends(validate_token)):
    """Full RAG pipeline: retrieve → LLM → cite → explain → score → audit."""
    request_id = str(uuid.uuid4())
    start = time.time()
    user = extract_user_info(token_payload)

    async with httpx.AsyncClient(timeout=QUERY_TIMEOUT_SECONDS) as client:
        # 1. Retrieve relevant chunks
        retrieval_resp = await client.post(
            f"{RETRIEVAL_SERVICE}/retrieve",
            json={
                "query": req.query,
                "top_k": 5,
                "access_level": user["access_level"],
                "filters": req.filters,
            },
        )
        retrieval_data = retrieval_resp.json()
        chunks = retrieval_data.get("chunks", [])
        if not chunks:
            latency_ms = int((time.time() - start) * 1000)
            return {
                "status": "success",
                "data": {
                    "answer": "I could not find any relevant document context for that question. Upload or select documents that contain the answer, then try again.",
                    "citations": [],
                    "confidence": {
                        "overall": 0,
                        "level": "LOW",
                        "breakdown": {
                            "retrieval_relevance": 0,
                            "context_coverage": 0,
                            "answer_coherence": 0,
                            "source_agreement": 0,
                        },
                    },
                    "explanation": {
                        "summary": "No matching chunks were retrieved, so no LLM answer was generated.",
                        "reasoning_steps": [
                            "The query was sent to the retrieval service.",
                            "The retrieval service returned no chunks available to this user's access level.",
                        ],
                        "sources_analyzed": 0,
                        "chunks_used": 0,
                        "avg_relevance": 0,
                        "model_used": "none",
                    },
                },
                "meta": {
                    "request_id": request_id,
                    "latency_ms": latency_ms,
                    "model_used": "none",
                },
            }

        # 2. Generate answer via LLM
        llm_resp = await client.post(
            f"{LLM_SERVICE}/generate",
            json={"query": req.query, "chunks": chunks},
        )
        llm_data = llm_resp.json()
        answer = llm_data.get("answer", "I could not generate an answer.")
        model_used = llm_data.get("model_used", "unknown")

        # 3. Generate citations
        citation_resp = await client.post(
            f"{CITATION_SERVICE}/cite",
            json={"answer": answer, "chunks": chunks},
        )
        citation_data = citation_resp.json()

        # 4. Generate explanation
        explanation_resp = await client.post(
            f"{EXPLANATION_SERVICE}/explain",
            json={
                "query": req.query,
                "answer": answer,
                "chunks": chunks,
                "model_used": model_used,
            },
        )
        explanation_data = explanation_resp.json()

        # 5. Calculate confidence
        confidence_resp = await client.post(
            f"{CONFIDENCE_SERVICE}/score",
            json={"query": req.query, "answer": answer, "chunks": chunks},
        )
        confidence_data = confidence_resp.json()

        latency_ms = int((time.time() - start) * 1000)

        # 6. Audit log (fire and forget)
        try:
            await client.post(
                f"{AUDIT_SERVICE}/log",
                json={
                    "user_id": user["user_id"],
                    "username": user["username"],
                    "request_id": request_id,
                    "query_text": req.query,
                    "response_text": citation_data.get("cited_answer", answer),
                    "chunks_retrieved": chunks,
                    "confidence_score": confidence_data.get("overall", 0),
                    "confidence_level": confidence_data.get("level", "LOW"),
                    "latency_ms": latency_ms,
                    "model_used": model_used,
                },
            )
        except Exception:
            pass  # Non-critical

    return {
        "status": "success",
        "data": {
            "answer": citation_data.get("cited_answer", answer),
            "citations": citation_data.get("citations", []),
            "confidence": confidence_data,
            "explanation": explanation_data,
        },
        "meta": {
            "request_id": request_id,
            "latency_ms": latency_ms,
            "model_used": model_used,
        },
    }


@app.post("/api/v1/upload")
async def upload_document(
    file: UploadFile = File(...),
    department: str = "general",
    access_level: str = "basic",
    token_payload: dict = Depends(validate_token),
):
    """Upload a document → store in MinIO → chunk → embed."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can upload documents")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Upload to document service
        file_content = await file.read()
        files = {"file": (file.filename, file_content, file.content_type)}
        doc_resp = await client.post(
            f"{DOCUMENT_SERVICE}/upload",
            files=files,
            data={
                "uploaded_by": user["username"],
                "department": department,
                "access_level": access_level,
            },
        )
        if doc_resp.status_code != 200:
            raise HTTPException(status_code=doc_resp.status_code, detail="Upload failed")
        doc_data = doc_resp.json()
        document_id = doc_data["document_id"]

        # 2. Chunk the document
        chunk_resp = await client.post(
            f"{CHUNKING_SERVICE}/chunk",
            json={
                "document_id": document_id,
                "minio_path": doc_data["minio_path"],
                "filename": file.filename,
            },
        )
        chunk_data = chunk_resp.json()

        # 3. Embed the chunks
        embed_resp = await client.post(
            f"{EMBEDDING_SERVICE}/embed",
            json={
                "document_id": document_id,
                "filename": file.filename,
                "chunks": chunk_data.get("chunks", []),
            },
        )
        embed_data = embed_resp.json()

    return {
        "status": "success",
        "data": {
            "document_id": document_id,
            "filename": file.filename,
            "chunks_created": chunk_data.get("chunk_count", 0),
            "vectors_stored": embed_data.get("vectors_stored", 0),
        },
    }


@app.post("/api/v1/ingest-url")
async def ingest_url(
    req: URLIngestRequest,
    token_payload: dict = Depends(validate_token),
):
    """Ingest a webpage URL → clean text → store in MinIO → chunk → embed."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can ingest URLs")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Ingest via document service
        doc_resp = await client.post(
            f"{DOCUMENT_SERVICE}/url",
            json={
                "url": req.url,
                "uploaded_by": user["username"],
                "department": req.department,
                "access_level": req.access_level,
            },
        )
        if doc_resp.status_code != 200:
            raise HTTPException(status_code=doc_resp.status_code, detail=f"URL ingestion failed: {doc_resp.text}")
        doc_data = doc_resp.json()
        document_id = doc_data["document_id"]
        filename = doc_data["filename"]

        # 2. Chunk the document
        chunk_resp = await client.post(
            f"{CHUNKING_SERVICE}/chunk",
            json={
                "document_id": document_id,
                "minio_path": doc_data["minio_path"],
                "filename": filename,
            },
        )
        if chunk_resp.status_code != 200:
            raise HTTPException(status_code=chunk_resp.status_code, detail="Chunking failed")
        chunk_data = chunk_resp.json()

        # 3. Embed the chunks
        embed_resp = await client.post(
            f"{EMBEDDING_SERVICE}/embed",
            json={
                "document_id": document_id,
                "filename": filename,
                "chunks": chunk_data.get("chunks", []),
            },
        )
        if embed_resp.status_code != 200:
            raise HTTPException(status_code=embed_resp.status_code, detail="Embedding failed")
        embed_data = embed_resp.json()

    return {
        "status": "success",
        "data": {
            "document_id": document_id,
            "filename": filename,
            "chunks_created": chunk_data.get("chunk_count", 0),
            "vectors_stored": embed_data.get("vectors_stored", 0),
        },
    }


@app.post("/api/v1/feedback")
async def submit_feedback(
    req: FeedbackRequest, token_payload: dict = Depends(validate_token)
):
    """Submit user feedback on a query response."""
    user = extract_user_info(token_payload)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{FEEDBACK_SERVICE}/feedback",
            json={
                "query_id": req.query_id,
                "user_id": user["user_id"],
                "query_text": req.query_text,
                "rating": req.rating,
                "comment": req.comment,
                "correction": req.correction,
            },
        )
    return resp.json()


@app.post("/api/v1/escalations")
async def create_escalation(
    req: EscalationRequest, token_payload: dict = Depends(validate_token)
):
    """Request human review for a query response."""
    user = extract_user_info(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{AUDIT_SERVICE}/escalations",
            json={
                "query_id": req.query_id,
                "reason": req.reason,
                "requested_by": user["username"],
            },
        )
    return resp.json()


@app.get("/api/v1/escalations")
async def list_escalations(
    status: str = "PENDING",
    token_payload: dict = Depends(validate_token),
):
    """List escalated queries for admins."""
    require_admin(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{AUDIT_SERVICE}/escalations", params={"status": status})
    return resp.json()


@app.post("/api/v1/escalations/{query_id}/resolve")
async def resolve_escalation(
    query_id: str,
    req: ResolveEscalationRequest,
    token_payload: dict = Depends(validate_token),
):
    """Resolve an escalated query."""
    require_admin(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{AUDIT_SERVICE}/escalations/{query_id}/resolve",
            json={"resolution": req.resolution},
        )
    return resp.json()


@app.get("/api/v1/logs")
async def get_logs(limit: int = 50, token_payload: dict = Depends(validate_token)):
    """Expose audit logs to admins."""
    require_admin(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{AUDIT_SERVICE}/logs", params={"limit": limit})
    return resp.json()


@app.get("/api/v1/logs/stats")
async def get_log_stats(token_payload: dict = Depends(validate_token)):
    """Expose RAG pipeline metrics to admins."""
    require_admin(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{AUDIT_SERVICE}/logs/stats")
    return resp.json()


@app.get("/api/v1/feedback")
async def list_feedback(token_payload: dict = Depends(validate_token)):
    """Expose raw feedback to admins."""
    require_admin(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{FEEDBACK_SERVICE}/feedback")
    return resp.json()


@app.get("/api/v1/feedback/stats")
async def feedback_stats(token_payload: dict = Depends(validate_token)):
    """Expose feedback analytics to admins."""
    require_admin(token_payload)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{FEEDBACK_SERVICE}/feedback/stats")
    return resp.json()


@app.get("/api/v1/documents")
async def list_documents(token_payload: dict = Depends(validate_token)):
    """List all uploaded documents."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{DOCUMENT_SERVICE}/documents")
    return resp.json()


@app.get("/api/v1/documents/{document_id}/download")
async def download_document(document_id: str, token_payload: dict = Depends(validate_token)):
    """Download or view the original source document for a citation."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(f"{DOCUMENT_SERVICE}/documents/{document_id}/download")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Document not found")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="Document download failed")

    headers = {}
    content_disposition = resp.headers.get("content-disposition")
    if content_disposition:
        headers["Content-Disposition"] = content_disposition

    source_url = resp.headers.get("x-source-url")
    if source_url:
        headers["X-Source-URL"] = source_url

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
        headers=headers,
    )
