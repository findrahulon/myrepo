"""RAGnarok API Gateway — routes requests to downstream microservices."""

import asyncio
import logging
import os
import re
import time
import uuid
from typing import Optional

logger = logging.getLogger("api-gateway")
logging.basicConfig(level=logging.INFO)

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

# Jira Integration settings
JIRA_URL = os.getenv("JIRA_URL")
JIRA_AUTH_METHOD = os.getenv("JIRA_AUTH_METHOD", "basic")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
JIRA_SYNC_JQL = os.getenv("JIRA_SYNC_JQL", "project = 'RAG'")


def get_jira_headers() -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    if not JIRA_API_TOKEN:
        return headers

    if JIRA_AUTH_METHOD == "basic" and JIRA_EMAIL:
        cred = f"{JIRA_EMAIL}:{JIRA_API_TOKEN}"
        encoded = base64.b64encode(cred.encode("utf-8")).decode("utf-8")
        headers["Authorization"] = f"Basic {encoded}"
    else:
        headers["Authorization"] = f"Bearer {JIRA_API_TOKEN}"

    return headers


def extract_adf_text(node) -> str:
    if not node:
        return ""
    if isinstance(node, dict):
        if node.get("type") == "text" and "text" in node:
            return node["text"]
        text_parts = []
        for k, v in node.items():
            if isinstance(v, (dict, list)):
                text_parts.append(extract_adf_text(v))
        return "".join(text_parts)
    elif isinstance(node, list):
        return "".join(extract_adf_text(item) for item in node)
    return ""

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


class OnboardUserRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UpdatePasswordRequest(BaseModel):
    password: str


class JiraSyncRequest(BaseModel):
    jql: Optional[str] = None


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
    logger.info(f"[{request_id}] Query received from user '{user['username']}': {req.query[:100]}")

    async with httpx.AsyncClient(timeout=QUERY_TIMEOUT_SECONDS) as client:
        # 1. Retrieve relevant chunks
        logger.info(f"[{request_id}] Step 1: Retrieving chunks from {RETRIEVAL_SERVICE}")
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

        # Real-time Jira issue lookup
        jira_chunks = []
        if JIRA_URL:
            # Find matching keys in query e.g. TS0-1, RAG-123, PROJ-456, etc.
            issue_keys = list(set(re.findall(r'\b([A-Z][A-Z0-9]{1,9}-\d+)\b', req.query)))
            if issue_keys:
                clean_jira_url = JIRA_URL.rstrip('/')
                jira_headers = get_jira_headers()
                for key in issue_keys[:3]:  # Limit to 3 real-time lookups to avoid huge overhead
                    try:
                        # Try v3 first
                        issue_url = f"{clean_jira_url}/rest/api/3/issue/{key}"
                        params = {"fields": "summary,description,status,priority,assignee,reporter,comment,created"}
                        resp = await client.get(issue_url, headers=jira_headers, params=params)
                        if resp.status_code == 404:
                            # Try v2
                            issue_url = f"{clean_jira_url}/rest/api/2/issue/{key}"
                            resp = await client.get(issue_url, headers=jira_headers, params=params)

                        if resp.status_code == 200:
                            issue_data = resp.json()
                            fields = issue_data.get("fields", {})
                            summary = fields.get("summary", "No Summary")

                            desc_field = fields.get("description")
                            description = ""
                            if desc_field:
                                if isinstance(desc_field, dict) and "content" in desc_field:
                                    description = extract_adf_text(desc_field)
                                else:
                                    description = str(desc_field)

                            status = fields.get("status", {}).get("name", "Unknown")
                            priority = fields.get("priority", {}).get("name", "None")
                            assignee = fields.get("assignee", {}).get("displayName") if fields.get("assignee") else "Unassigned"
                            reporter = fields.get("reporter", {}).get("displayName") if fields.get("reporter") else "Unknown"
                            created = fields.get("created", "Unknown")

                            comments_data = fields.get("comment", {}).get("comments", [])
                            comments_text = ""
                            for c in comments_data[:5]:
                                author = c.get("author", {}).get("displayName", "User")
                                body = c.get("body")
                                comment_str = ""
                                if body:
                                    if isinstance(body, dict) and "content" in body:
                                        comment_str = extract_adf_text(body)
                                    else:
                                        comment_str = str(body)
                                comments_text += f"\n- *{author}*: {comment_str}"

                            ticket_md = f"""[LIVE JIRA DATA] Issue: {key}
Summary: {summary}
Status: {status}
Priority: {priority}
Assignee: {assignee}
Reporter: {reporter}
Created: {created}

Description:
{description}

Comments:
{comments_text if comments_text else "No comments."}"""

                            # Append as a mock chunk
                            jira_chunks.append({
                                "id": f"jira-{key}",
                                "chunk_text": ticket_md,
                                "document_id": f"jira-{key}",
                                "filename": f"jira-{key}.txt",
                                "chunk_index": 0,
                                "page_number": 1,
                                "section": "Jira Real-Time Status",
                                "relevance_score": 1.0
                            })
                    except Exception as e:
                        # Log error but don't fail the whole query
                        print(f"Jira real-time lookup failed for {key}: {str(e)}")
            else:
                # Check for general Jira keywords
                query_lower = req.query.lower()
                keywords = ["jira", "ticket", "issue", "task", "test-space-01", "ts0"]
                if any(kw in query_lower for kw in keywords):
                    try:
                        clean_jira_url = JIRA_URL.rstrip('/')
                        jira_headers = get_jira_headers()
                        search_url = f"{clean_jira_url}/rest/api/3/search/jql"
                        params = {
                            "jql": "project = 'TS0' ORDER BY updated DESC",
                            "fields": "summary,status,priority,assignee,reporter,created",
                            "maxResults": 50
                        }
                        resp = await client.get(search_url, headers=jira_headers, params=params)

                        # Fallbacks
                        if resp.status_code in (404, 410):
                            search_url = f"{clean_jira_url}/rest/api/3/search"
                            resp = await client.get(search_url, headers=jira_headers, params=params)
                        if resp.status_code in (404, 410):
                            search_url = f"{clean_jira_url}/rest/api/2/search"
                            resp = await client.get(search_url, headers=jira_headers, params=params)

                        if resp.status_code == 200:
                            data = resp.json()
                            issues = data.get("issues", [])
                            if issues:
                                # Format list of issues into a directory
                                issues_list = []
                                for issue in issues:
                                    key = issue.get("key")
                                    fields = issue.get("fields", {})
                                    summary = fields.get("summary", "No Summary")
                                    status = fields.get("status", {}).get("name", "Unknown")
                                    priority = fields.get("priority", {}).get("name", "None")
                                    assignee = fields.get("assignee", {}).get("displayName") if fields.get("assignee") else "Unassigned"
                                    reporter = fields.get("reporter", {}).get("displayName") if fields.get("reporter") else "Unknown"
                                    issues_list.append(
                                        f"- {key}: {summary} (Status: {status}, Assignee: {assignee}, Priority: {priority}, Reporter: {reporter})"
                                    )

                                directory_text = "[LIVE JIRA DATA] Active Issues in Project test-space-01 (TS0):\n" + "\n".join(issues_list)

                                jira_chunks.append({
                                    "id": "jira-project-directory",
                                    "chunk_text": directory_text,
                                    "document_id": "jira-project-directory",
                                    "filename": "jira-project-directory.txt",
                                    "chunk_index": 0,
                                    "page_number": 1,
                                    "section": "Jira Project Ticket Directory",
                                    "relevance_score": 1.0
                                })
                    except Exception as e:
                        print(f"Jira real-time project list lookup failed: {str(e)}")

        chunks = jira_chunks + chunks

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
    if document_id.startswith("jira-") and JIRA_URL:
        # For real-time lookup citations
        issue_key = document_id.replace("jira-", "")
        clean_jira_url = JIRA_URL.rstrip('/')
        jira_issue_url = f"{clean_jira_url}/browse/{issue_key}"
        return Response(
            content=f"Redirecting to Jira issue: {jira_issue_url}",
            status_code=200,
            headers={"X-Source-URL": jira_issue_url}
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(f"{DOCUMENT_SERVICE}/documents/{document_id}/download")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Document not found")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="Document download failed")

    headers = {}
    content_disposition = resp.headers.get("content-disposition", "")
    if content_disposition:
        headers["Content-Disposition"] = content_disposition

    # For synced database citations with jira-*.txt filenames
    if "jira-" in content_disposition and JIRA_URL:
        # Extract issue key from content-disposition (e.g. filename="jira-TS0-1.txt")
        match = re.search(r'jira-([A-Za-z0-9-]+)', content_disposition)
        if match:
            issue_key = match.group(1)
            # Remove trailing .txt if captured
            if issue_key.endswith(".txt"):
                issue_key = issue_key[:-4]
            clean_jira_url = JIRA_URL.rstrip('/')
            jira_issue_url = f"{clean_jira_url}/browse/{issue_key}"
            return Response(
                content=f"Redirecting to Jira issue: {jira_issue_url}",
                status_code=200,
                headers={"X-Source-URL": jira_issue_url}
            )

    source_url = resp.headers.get("x-source-url")
    if source_url:
        headers["X-Source-URL"] = source_url

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
        headers=headers,
    )


@app.get("/api/v1/services/{service_name}/logs")
async def get_service_logs(
    service_name: str,
    limit: int = 100,
    token_payload: dict = Depends(validate_token),
):
    """Retrieve stdout/stderr logs of a specific backend service container."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view service logs")

    valid_services = [
        "api-gateway", "document-service", "chunking-service", "embedding-service",
        "retrieval-service", "llm-service", "citation-service", "explanation-service",
        "confidence-service", "feedback-service", "audit-service", "keycloak",
        "postgres", "minio", "qdrant", "ollama", "frontend"
    ]
    if service_name not in valid_services:
        raise HTTPException(status_code=400, detail=f"Invalid service name: {service_name}")

    container_name = f"myrepo-{service_name}-1"

    try:
        transport = httpx.AsyncHTTPTransport(uds="/var/run/docker.sock")
        async with httpx.AsyncClient(transport=transport) as client:
            url = f"http://localhost/containers/{container_name}/logs?stdout=true&stderr=true&tail={limit}"
            resp = await client.get(url, timeout=10.0)
            
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Container {container_name} not found")
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Docker API error: {resp.status_code} - {resp.text}")

            raw_bytes = resp.content
            output = []
            idx = 0
            n = len(raw_bytes)
            while idx + 8 <= n:
                stream_type = raw_bytes[idx]
                size = int.from_bytes(raw_bytes[idx+4:idx+8], byteorder="big")
                idx += 8
                if idx + size <= n:
                    payload = raw_bytes[idx:idx+size]
                    line = payload.decode("utf-8", errors="replace")
                    output.append(line)
                    idx += size
                else:
                    break

            if not output and raw_bytes:
                logs_text = raw_bytes.decode("utf-8", errors="replace")
            else:
                logs_text = "".join(output)

            return {"service": service_name, "logs": logs_text}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query Docker socket: {str(e)}")


@app.post("/api/v1/onboard-user")
async def onboard_user(
    req: OnboardUserRequest,
    token_payload: dict = Depends(validate_token),
):
    """Onboard a new user directly in Keycloak (Admin only)."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can onboard users")

    # Connect to Keycloak Admin REST API to create the user
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Get Keycloak Admin token
        try:
            token_resp = await client.post(
                f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
                data={
                    "client_id": "admin-cli",
                    "grant_type": "password",
                    "username": "admin",
                    "password": "admin123"
                }
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to authenticate with Keycloak admin client")
            admin_token = token_resp.json()["access_token"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Keycloak Admin authentication error: {str(e)}")

        # 2. Create User
        first_name = req.first_name if req.first_name else req.username
        last_name = req.last_name if req.last_name else req.username
        user_payload = {
            "username": req.username,
            "email": req.email,
            "enabled": True,
            "emailVerified": True,
            "firstName": first_name,
            "lastName": last_name,
            "credentials": [{
                "type": "password",
                "value": req.password,
                "temporary": False
            }]
        }
        
        create_resp = await client.post(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=user_payload
        )
        
        if create_resp.status_code == 409:
            raise HTTPException(status_code=400, detail="Username or email already exists")
        if create_resp.status_code != 201:
            raise HTTPException(status_code=500, detail=f"Failed to create user in Keycloak: {create_resp.text}")

        # 3. Retrieve User ID from Location header
        location = create_resp.headers.get("Location")
        if not location:
            # Fallback: search for user by username
            search_resp = await client.get(
                f"{KEYCLOAK_URL}/admin/realms/ragnarok/users?username={req.username}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if search_resp.status_code != 200 or not search_resp.json():
                raise HTTPException(status_code=500, detail="User created but could not retrieve details")
            user_id = search_resp.json()[0]["id"]
        else:
            user_id = location.split("/")[-1]

        # 4. Get Realm Roles from Keycloak to find the target role metadata
        roles_resp = await client.get(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/roles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if roles_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to retrieve Keycloak realm roles")
        
        roles = roles_resp.json()
        target_role = next((r for r in roles if r["name"] == req.role), None)
        if not target_role:
            raise HTTPException(status_code=400, detail=f"Target role '{req.role}' not found in Keycloak")

        # 5. Map Role to User
        role_map_resp = await client.post(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/users/{user_id}/role-mappings/realm",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=[target_role]
        )
        if role_map_resp.status_code != 204 and role_map_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to assign role to user")

        # If admin is requested, we map both "admin" and "user" roles (Keycloak standard)
        if req.role == "admin":
            user_role = next((r for r in roles if r["name"] == "user"), None)
            if user_role:
                await client.post(
                    f"{KEYCLOAK_URL}/admin/realms/ragnarok/users/{user_id}/role-mappings/realm",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    json=[user_role]
                )

    return {"status": "success", "message": f"User '{req.username}' onboarded successfully with role '{req.role}'"}


@app.get("/api/v1/users")
async def list_users(
    token_payload: dict = Depends(validate_token),
):
    """Retrieve all users in the realm with roles (Admin only)."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can list users")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get admin token
        try:
            token_resp = await client.post(
                f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
                data={
                    "client_id": "admin-cli",
                    "grant_type": "password",
                    "username": "admin",
                    "password": "admin123"
                }
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to authenticate with Keycloak admin client")
            admin_token = token_resp.json()["access_token"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Keycloak Admin authentication error: {str(e)}")

        # Fetch all users
        users_resp = await client.get(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if users_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to retrieve users from Keycloak")

        users = users_resp.json()

        async def fetch_user_roles(u):
            try:
                roles_resp = await client.get(
                    f"{KEYCLOAK_URL}/admin/realms/ragnarok/users/{u['id']}/role-mappings/realm/composite",
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
                if roles_resp.status_code == 200:
                    role_names = [r["name"] for r in roles_resp.json()]
                    if "admin" in role_names:
                        u["role"] = "admin"
                    elif "user" in role_names:
                        u["role"] = "user"
                    else:
                        u["role"] = "none"
                else:
                    u["role"] = "unknown"
            except Exception:
                u["role"] = "unknown"

        await asyncio.gather(*(fetch_user_roles(u) for u in users))

        # Return formatted users list
        formatted_users = []
        for u in users:
            formatted_users.append({
                "id": u.get("id"),
                "username": u.get("username"),
                "email": u.get("email", ""),
                "first_name": u.get("firstName", ""),
                "last_name": u.get("lastName", ""),
                "role": u.get("role", "user"),
                "enabled": u.get("enabled", True),
                "created_timestamp": u.get("createdTimestamp")
            })

        return formatted_users


@app.put("/api/v1/users/{user_id}/password")
async def update_user_password(
    user_id: str,
    req: UpdatePasswordRequest,
    token_payload: dict = Depends(validate_token),
):
    """Update password for a user (Admin only)."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update passwords")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get admin token
        try:
            token_resp = await client.post(
                f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
                data={
                    "client_id": "admin-cli",
                    "grant_type": "password",
                    "username": "admin",
                    "password": "admin123"
                }
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to authenticate with Keycloak admin client")
            admin_token = token_resp.json()["access_token"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Keycloak Admin authentication error: {str(e)}")

        # Reset user password in Keycloak
        reset_payload = {
            "type": "password",
            "value": req.password,
            "temporary": False
        }
        reset_resp = await client.put(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/users/{user_id}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=reset_payload
        )
        if reset_resp.status_code != 204:
            raise HTTPException(status_code=500, detail=f"Failed to reset password in Keycloak: {reset_resp.text}")

    return {"status": "success", "message": "User password updated successfully"}


@app.delete("/api/v1/users/{user_id}")
async def delete_user(
    user_id: str,
    token_payload: dict = Depends(validate_token),
):
    """Delete a user from the realm (Admin only)."""
    current_user = extract_user_info(token_payload)
    if current_user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")

    # Safety Check: Prevent self-deletion
    if current_user["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get admin token
        try:
            token_resp = await client.post(
                f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
                data={
                    "client_id": "admin-cli",
                    "grant_type": "password",
                    "username": "admin",
                    "password": "admin123"
                }
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to authenticate with Keycloak admin client")
            admin_token = token_resp.json()["access_token"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Keycloak Admin authentication error: {str(e)}")

        # Fetch user details first to check username
        user_resp = await client.get(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=404, detail="User not found in Keycloak")

        user_data = user_resp.json()
        if user_data.get("username") == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete default admin account")

        # Delete user
        delete_resp = await client.delete(
            f"{KEYCLOAK_URL}/admin/realms/ragnarok/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if delete_resp.status_code != 204:
            raise HTTPException(status_code=500, detail=f"Failed to delete user in Keycloak: {delete_resp.text}")

    return {"status": "success", "message": "User deleted successfully"}


@app.post("/api/v1/jira/sync")
async def sync_jira_tickets(
    req: Optional[JiraSyncRequest] = None,
    token_payload: dict = Depends(validate_token),
):
    """Sync tickets from Jira using JQL and load them semantically (Admin only)."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can sync Jira tickets")

    if not JIRA_URL:
        raise HTTPException(status_code=400, detail="Jira integration is not configured")

    jql_query = req.jql if req and req.jql else JIRA_SYNC_JQL
    jira_headers = get_jira_headers()
    clean_jira_url = JIRA_URL.rstrip('/')

    # 1. Fetch issues from Jira
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            search_url = f"{clean_jira_url}/rest/api/3/search/jql"
            params = {
                "jql": jql_query,
                "fields": "summary,description,status,priority,assignee,reporter,comment,created",
                "maxResults": 50
            }
            resp = await client.get(search_url, headers=jira_headers, params=params)

            # Fallback to older GET /search if /search/jql is 404 or 410
            if resp.status_code in (404, 410):
                search_url = f"{clean_jira_url}/rest/api/3/search"
                resp = await client.get(search_url, headers=jira_headers, params=params)

            # Fallback to api/2 if api/3 fails with 404 or 410
            if resp.status_code in (404, 410):
                search_url = f"{clean_jira_url}/rest/api/2/search"
                resp = await client.get(search_url, headers=jira_headers, params=params)

            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Jira API search failed: {resp.status_code} - {resp.text}")

            data = resp.json()
            issues = data.get("issues", [])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error connecting to Jira: {str(e)}")

        if not issues:
            return {"status": "success", "message": "No issues found matching JQL.", "count": 0}

        # 2. Formulate and Ingest each issue
        synced_count = 0
        errors = []

        for issue in issues:
            key = issue.get("key")
            fields = issue.get("fields", {})
            summary = fields.get("summary", "No Summary")

            # Extract description
            desc_field = fields.get("description")
            description = ""
            if desc_field:
                if isinstance(desc_field, dict) and "content" in desc_field:
                    description = extract_adf_text(desc_field)
                else:
                    description = str(desc_field)

            status = fields.get("status", {}).get("name", "Unknown")
            priority = fields.get("priority", {}).get("name", "None")
            assignee = fields.get("assignee", {}).get("displayName") if fields.get("assignee") else "Unassigned"
            reporter = fields.get("reporter", {}).get("displayName") if fields.get("reporter") else "Unknown"
            created = fields.get("created", "Unknown")

            # Extract comments
            comments_data = fields.get("comment", {}).get("comments", [])
            comments_text = ""
            for c in comments_data[:5]:
                author = c.get("author", {}).get("displayName", "User")
                body = c.get("body")
                comment_str = ""
                if body:
                    if isinstance(body, dict) and "content" in body:
                        comment_str = extract_adf_text(body)
                    else:
                        comment_str = str(body)
                comments_text += f"\n- *{author}*: {comment_str}"

            # Construct markdown document
            ticket_md = f"""# Jira Ticket: {key}
**Summary:** {summary}
**Status:** {status}
**Priority:** {priority}
**Assignee:** {assignee}
**Reporter:** {reporter}
**Created:** {created}

## Description:
{description}

## Comments:
{comments_text if comments_text else "No comments."}
"""
            filename = f"jira-{key}.txt"
            content_bytes = ticket_md.encode("utf-8")

            try:
                files = {"file": (filename, content_bytes, "text/plain")}
                doc_resp = await client.post(
                    f"{DOCUMENT_SERVICE}/upload",
                    files=files,
                    data={
                        "uploaded_by": user["username"],
                        "department": "engineering",
                        "access_level": "basic",
                    },
                )
                if doc_resp.status_code != 200:
                    errors.append(f"Upload failed for {key}: {doc_resp.text}")
                    continue
                doc_data = doc_resp.json()
                document_id = doc_data["document_id"]

                # Chunk the document
                chunk_resp = await client.post(
                    f"{CHUNKING_SERVICE}/chunk",
                    json={
                        "document_id": document_id,
                        "minio_path": doc_data["minio_path"],
                        "filename": filename,
                    },
                )
                if chunk_resp.status_code != 200:
                    errors.append(f"Chunking failed for {key}: {chunk_resp.text}")
                    continue
                chunk_data = chunk_resp.json()

                # Embed the chunks
                embed_resp = await client.post(
                    f"{EMBEDDING_SERVICE}/embed",
                    json={
                        "document_id": document_id,
                        "filename": filename,
                        "chunks": chunk_data.get("chunks", []),
                    },
                )
                if embed_resp.status_code != 200:
                    errors.append(f"Embedding failed for {key}: {embed_resp.text}")
                    continue

                synced_count += 1
            except Exception as ex:
                errors.append(f"Error processing {key}: {str(ex)}")

    return {
        "status": "success",
        "message": f"Successfully synced {synced_count} Jira issues.",
        "count": synced_count,
        "errors": errors
    }


@app.get("/api/v1/jira/live-issues")
async def get_jira_live_issues(
    jql: Optional[str] = "project = 'TS0'",
    token_payload: dict = Depends(validate_token),
):
    """Fetch issues from Jira in real-time without syncing to DB (Admin only)."""
    user = extract_user_info(token_payload)
    if user["access_level"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view live Jira issues")

    if not JIRA_URL:
        raise HTTPException(status_code=400, detail="Jira integration is not configured")

    jql_query = jql if jql else "project = 'TS0'"
    jira_headers = get_jira_headers()
    clean_jira_url = JIRA_URL.rstrip('/')

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # 1. Fetch issues using /rest/api/3/search/jql
            search_url = f"{clean_jira_url}/rest/api/3/search/jql"
            params = {
                "jql": jql_query,
                "fields": "summary,status,priority,assignee,reporter,created",
                "maxResults": 50
            }
            resp = await client.get(search_url, headers=jira_headers, params=params)

            # Fallback to GET /search if search/jql is 404 or 410
            if resp.status_code in (404, 410):
                search_url = f"{clean_jira_url}/rest/api/3/search"
                resp = await client.get(search_url, headers=jira_headers, params=params)

            # Fallback to api/2 if v3 fails
            if resp.status_code in (404, 410):
                search_url = f"{clean_jira_url}/rest/api/2/search"
                resp = await client.get(search_url, headers=jira_headers, params=params)

            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Jira API search failed: {resp.status_code} - {resp.text}")

            data = resp.json()
            issues = data.get("issues", [])
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error connecting to Jira: {str(e)}")

        # 2. Format list of issues
        live_issues = []
        for issue in issues:
            key = issue.get("key")
            fields = issue.get("fields", {})
            summary = fields.get("summary", "No Summary")
            status = fields.get("status", {}).get("name", "Unknown")
            priority = fields.get("priority", {}).get("name", "None")
            assignee = fields.get("assignee", {}).get("displayName") if fields.get("assignee") else "Unassigned"
            reporter = fields.get("reporter", {}).get("displayName") if fields.get("reporter") else "Unknown"
            created = fields.get("created", "Unknown")

            live_issues.append({
                "key": key,
                "summary": summary,
                "status": status,
                "priority": priority,
                "assignee": assignee,
                "reporter": reporter,
                "created": created
            })

        return live_issues

