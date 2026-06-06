"""RAGnarok Document Service — handles file upload to MinIO and metadata storage."""

import os
import uuid
from datetime import datetime
from io import BytesIO

import psycopg2
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Response
from minio import Minio

app = FastAPI(title="RAGnarok Document Service", version="1.0.0")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "ragnarok-documents")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ragnarok:ragnarok_secret@localhost:5432/ragnarok")


def get_minio_client():
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )


def get_db():
    return psycopg2.connect(DATABASE_URL)


def get_media_type(file_type: str) -> str:
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain; charset=utf-8",
    }.get(file_type, "application/octet-stream")


def content_disposition(filename: str) -> str:
    safe_filename = filename.replace("\\", "_").replace('"', '\\"')
    return f'inline; filename="{safe_filename}"'


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "document-service"}


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    uploaded_by: str = Form("anonymous"),
    department: str = Form("general"),
    access_level: str = Form("basic"),
):
    """Upload a document to MinIO and store metadata in PostgreSQL."""
    doc_id = str(uuid.uuid4())
    filename = file.filename or "unknown"
    file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"

    if file_ext not in ("pdf", "docx", "doc", "txt"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")

    content = await file.read()
    file_size = len(content)
    minio_path = f"documents/{doc_id}/{filename}"

    # Upload to MinIO
    client = get_minio_client()
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)

    client.put_object(
        MINIO_BUCKET,
        minio_path,
        BytesIO(content),
        length=file_size,
        content_type=file.content_type or "application/octet-stream",
    )

    # Store metadata in PostgreSQL
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO documents (id, filename, file_type, file_size, minio_path,
               uploaded_by, department, access_level, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'uploaded')""",
            (doc_id, filename, file_ext, file_size, minio_path,
             uploaded_by, department, access_level),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "document_id": doc_id,
        "filename": filename,
        "file_size": file_size,
        "minio_path": minio_path,
        "status": "uploaded",
    }


@app.get("/documents")
async def list_documents():
    """List all documents."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, filename, file_type, file_size, status, department,
                      access_level, uploaded_by, chunk_count, created_at
               FROM documents ORDER BY created_at DESC"""
        )
        rows = cur.fetchall()
        documents = []
        for row in rows:
            documents.append({
                "id": str(row[0]),
                "filename": row[1],
                "file_type": row[2],
                "file_size": row[3],
                "status": row[4],
                "department": row[5],
                "access_level": row[6],
                "uploaded_by": row[7],
                "chunk_count": row[8],
                "created_at": row[9].isoformat() if row[9] else None,
            })
        return {"documents": documents}
    finally:
        conn.close()


@app.get("/documents/{document_id}/download")
async def download_document(document_id: str):
    """Return the original uploaded document bytes."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT minio_path, filename, file_type FROM documents WHERE id = %s", (document_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        minio_path, filename, file_type = row
    finally:
        conn.close()

    client = get_minio_client()
    response = client.get_object(MINIO_BUCKET, minio_path)
    try:
        content = response.read()
    finally:
        response.close()
        response.release_conn()

    return Response(
        content=content,
        media_type=get_media_type(file_type),
        headers={"Content-Disposition": content_disposition(filename)},
    )
