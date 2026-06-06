"""RAGnarok Feedback Service — collects user ratings, comments, and corrections."""

import os
import uuid

import psycopg2
from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="RAGnarok Feedback Service", version="1.0.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ragnarok:ragnarok_secret@localhost:5432/ragnarok")


def get_db():
    return psycopg2.connect(DATABASE_URL)


class FeedbackRequest(BaseModel):
    query_id: Optional[str] = None
    user_id: str
    query_text: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    correction: Optional[str] = None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "feedback-service"}


@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    """Store user feedback in PostgreSQL."""
    feedback_id = str(uuid.uuid4())
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO feedback (id, query_id, user_id, query_text, rating, comment, correction)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (feedback_id, req.query_id, req.user_id, req.query_text,
             req.rating, req.comment, req.correction),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "status": "success",
        "feedback_id": feedback_id,
        "message": "Feedback submitted successfully",
    }


@app.get("/feedback")
async def list_feedback():
    """List all feedback entries."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, query_id, user_id, query_text, rating, comment, correction, created_at
               FROM feedback ORDER BY created_at DESC LIMIT 100"""
        )
        rows = cur.fetchall()
        return {
            "feedback": [
                {
                    "id": str(row[0]),
                    "query_id": str(row[1]) if row[1] else None,
                    "user_id": row[2],
                    "query_text": row[3],
                    "rating": row[4],
                    "comment": row[5],
                    "correction": row[6],
                    "created_at": row[7].isoformat() if row[7] else None,
                }
                for row in rows
            ]
        }
    finally:
        conn.close()


@app.get("/feedback/stats")
async def feedback_stats():
    """Summarize feedback quality signals for the admin dashboard."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                COUNT(*) as total_feedback,
                AVG(rating) as avg_rating,
                COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive,
                COUNT(CASE WHEN rating <= 2 THEN 1 END) as negative,
                COUNT(CASE WHEN correction IS NOT NULL AND correction <> '' THEN 1 END) as corrections
            FROM feedback
        """)
        row = cur.fetchone()

        cur.execute("""
            SELECT COALESCE(query_text, 'Unknown query') as query_text,
                   COUNT(*) as feedback_count,
                   AVG(rating) as avg_rating,
                   MIN(created_at) as first_seen,
                   MAX(created_at) as last_seen
            FROM feedback
            GROUP BY COALESCE(query_text, 'Unknown query')
            HAVING AVG(rating) <= 2.5 OR COUNT(*) >= 2
            ORDER BY AVG(rating) ASC, COUNT(*) DESC
            LIMIT 10
        """)
        worst_rows = cur.fetchall()

        cur.execute("""
            SELECT DATE(created_at) as day,
                   COUNT(*) as feedback_count,
                   AVG(rating) as avg_rating
            FROM feedback
            GROUP BY DATE(created_at)
            ORDER BY day DESC
            LIMIT 14
        """)
        trend_rows = cur.fetchall()

        return {
            "total_feedback": row[0],
            "avg_rating": round(row[1], 2) if row[1] else 0,
            "positive": row[2],
            "negative": row[3],
            "corrections": row[4],
            "worst_queries": [
                {
                    "query_text": item[0],
                    "feedback_count": item[1],
                    "avg_rating": round(item[2], 2) if item[2] else 0,
                    "first_seen": item[3].isoformat() if item[3] else None,
                    "last_seen": item[4].isoformat() if item[4] else None,
                }
                for item in worst_rows
            ],
            "satisfaction_trend": [
                {
                    "date": item[0].isoformat() if item[0] else None,
                    "feedback_count": item[1],
                    "avg_rating": round(item[2], 2) if item[2] else 0,
                }
                for item in trend_rows
            ],
        }
    finally:
        conn.close()
