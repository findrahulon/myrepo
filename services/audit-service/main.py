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
    user_id: str
    username: Optional[str] = None
    query_text: str
    response_text: Optional[str] = None
    chunks_retrieved: Optional[list] = None
    confidence_score: Optional[float] = None
    confidence_level: Optional[str] = None
    latency_ms: Optional[int] = None
    model_used: Optional[str] = None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "audit-service"}


@app.post("/log")
async def create_log(req: AuditLogRequest):
    """Log a query and its response to PostgreSQL."""
    log_id = str(uuid.uuid4())
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO audit_logs (id, user_id, username, query_text, response_text,
               chunks_retrieved, confidence_score, confidence_level, latency_ms, model_used)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (log_id, req.user_id, req.username, req.query_text, req.response_text,
             json.dumps(req.chunks_retrieved or []), req.confidence_score,
             req.confidence_level, req.latency_ms, req.model_used),
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
                      confidence_score, confidence_level, latency_ms, model_used, created_at
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
                    "created_at": row[9].isoformat() if row[9] else None,
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
                COUNT(CASE WHEN confidence_level = 'LOW' THEN 1 END) as low_confidence
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
        }
    finally:
        conn.close()
