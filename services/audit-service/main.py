"""RAGnarok Audit & Query Logging Service — logs queries, responses, and latency metrics."""

import os
import uuid
import json
from typing import Optional

import psycopg2
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RAGnarok Audit Service", version="1.0.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ragnarok:ragnarok_secret@localhost:5432/ragnarok")


def get_db():
    return psycopg2.connect(DATABASE_URL)


class AuditLogRequest(BaseModel):
    request_id: Optional[str] = None
    user_id: str
    username: Optional[str] = None
    query_text: str
    response_text: Optional[str] = None
    chunks_retrieved: Optional[list] = None
    confidence_score: Optional[float] = None
    confidence_level: Optional[str] = None
    latency_ms: Optional[int] = None
    model_used: Optional[str] = None


class EscalationRequest(BaseModel):
    query_id: str
    reason: Optional[str] = None
    requested_by: Optional[str] = None


class ResolveEscalationRequest(BaseModel):
    resolution: Optional[str] = None


@app.on_event("startup")
async def startup():
    """Keep existing dev volumes compatible with the assessment features."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS escalation_status VARCHAR(20) DEFAULT 'NONE'")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS escalation_reason TEXT")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS escalation_requested_by VARCHAR(255)")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS escalation_resolution TEXT")
        conn.commit()
    finally:
        conn.close()


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "audit-service"}


@app.post("/log")
async def create_log(req: AuditLogRequest):
    """Log a query and its response to PostgreSQL."""
    log_id = req.request_id or str(uuid.uuid4())
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO audit_logs (id, user_id, username, query_text, response_text,
               chunks_retrieved, confidence_score, confidence_level, latency_ms, model_used,
               escalation_status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (log_id, req.user_id, req.username, req.query_text, req.response_text,
             json.dumps(req.chunks_retrieved or []), req.confidence_score,
             req.confidence_level, req.latency_ms, req.model_used,
             "PENDING" if req.confidence_level == "LOW" else "NONE"),
        )
        conn.commit()
    finally:
        conn.close()

    return {"status": "logged", "log_id": log_id}


@app.get("/logs")
async def get_logs(limit: int = 50):
    """Retrieve recent audit logs."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, user_id, username, query_text, response_text,
                      confidence_score, confidence_level, latency_ms, model_used,
                      escalation_status, created_at
               FROM audit_logs ORDER BY created_at DESC LIMIT %s""",
            (limit,),
        )
        rows = cur.fetchall()
        return {
            "logs": [
                {
                    "id": str(row[0]),
                    "user_id": row[1],
                    "username": row[2],
                    "query_text": row[3],
                    "response_text": (row[4] or "")[:500],
                    "confidence_score": row[5],
                    "confidence_level": row[6],
                    "latency_ms": row[7],
                    "model_used": row[8],
                    "escalation_status": row[9],
                    "created_at": row[10].isoformat() if row[10] else None,
                }
                for row in rows
            ],
            "total": len(rows),
        }
    finally:
        conn.close()


@app.get("/logs/stats")
async def get_stats():
    """Get query statistics."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                COUNT(*) as total_queries,
                AVG(latency_ms) as avg_latency,
                AVG(confidence_score) as avg_confidence,
                COUNT(CASE WHEN confidence_level = 'HIGH' THEN 1 END) as high_confidence,
                COUNT(CASE WHEN confidence_level = 'MEDIUM' THEN 1 END) as medium_confidence,
                COUNT(CASE WHEN confidence_level = 'LOW' THEN 1 END) as low_confidence,
                COUNT(CASE WHEN escalation_status = 'PENDING' THEN 1 END) as pending_escalations,
                COUNT(CASE WHEN escalation_status = 'RESOLVED' THEN 1 END) as resolved_escalations
            FROM audit_logs
        """)
        row = cur.fetchone()
        return {
            "total_queries": row[0],
            "avg_latency_ms": round(row[1], 2) if row[1] else 0,
            "avg_confidence": round(row[2], 4) if row[2] else 0,
            "confidence_distribution": {
                "HIGH": row[3],
                "MEDIUM": row[4],
                "LOW": row[5],
            },
            "escalations": {
                "PENDING": row[6],
                "RESOLVED": row[7],
            },
        }
    finally:
        conn.close()


@app.post("/escalations")
async def create_escalation(req: EscalationRequest):
    """Mark a query for human review."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE audit_logs
               SET escalation_status = 'PENDING',
                   escalation_reason = %s,
                   escalation_requested_by = %s,
                   escalated_at = COALESCE(escalated_at, NOW())
               WHERE id = %s
               RETURNING id""",
            (req.reason or "Manual human review requested", req.requested_by, req.query_id),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                """INSERT INTO audit_logs (id, user_id, username, query_text, escalation_status,
                   escalation_reason, escalation_requested_by, escalated_at)
                   VALUES (%s, %s, %s, %s, 'PENDING', %s, %s, NOW())""",
                (req.query_id, req.requested_by or "unknown", req.requested_by,
                 "Escalated from chat response", req.reason or "Manual human review requested",
                 req.requested_by),
            )
        conn.commit()
    finally:
        conn.close()

    return {"status": "PENDING", "query_id": req.query_id}


@app.get("/escalations")
async def list_escalations(status: str = "PENDING", limit: int = 50):
    """Return escalated queries for admin review."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, username, query_text, response_text, confidence_score,
                      confidence_level, escalation_reason, escalation_requested_by,
                      escalated_at, resolved_at, escalation_resolution
               FROM audit_logs
               WHERE escalation_status = %s
               ORDER BY COALESCE(escalated_at, created_at) DESC
               LIMIT %s""",
            (status, limit),
        )
        rows = cur.fetchall()
        return {
            "escalations": [
                {
                    "id": str(row[0]),
                    "username": row[1],
                    "query_text": row[2],
                    "response_text": (row[3] or "")[:500],
                    "confidence_score": row[4],
                    "confidence_level": row[5],
                    "reason": row[6],
                    "requested_by": row[7],
                    "escalated_at": row[8].isoformat() if row[8] else None,
                    "resolved_at": row[9].isoformat() if row[9] else None,
                    "resolution": row[10],
                }
                for row in rows
            ]
        }
    finally:
        conn.close()


@app.post("/escalations/{query_id}/resolve")
async def resolve_escalation(query_id: str, req: ResolveEscalationRequest):
    """Mark an escalated query as resolved."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE audit_logs
               SET escalation_status = 'RESOLVED',
                   resolved_at = NOW(),
                   escalation_resolution = %s
               WHERE id = %s""",
            (req.resolution or "Resolved", query_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"status": "RESOLVED", "query_id": query_id}
