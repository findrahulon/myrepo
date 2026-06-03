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
