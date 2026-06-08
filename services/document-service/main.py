"""RAGnarok Document Service — handles file upload to MinIO and metadata storage."""

import os
import uuid
from datetime import datetime
from io import BytesIO

import json
import psycopg2
import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel
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
        "url": "text/plain; charset=utf-8",
    }.get(file_type, "application/octet-stream")


def content_disposition(filename: str) -> str:
    safe_filename = filename.replace("\\", "_").replace('"', '\\"')
    return f'inline; filename="{safe_filename}"'


class URLIngestInput(BaseModel):
    url: str
    uploaded_by: str = "anonymous"
    department: str = "general"
    access_level: str = "basic"


def clean_html(html_content: str) -> tuple[str, str]:
    soup = BeautifulSoup(html_content, "html.parser")
    title = "Webpage"
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    
    # Remove script and style elements
    for element in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
        element.decompose()
        
    text = soup.get_text(separator="\n")
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text_content = "\n".join(chunk for chunk in chunks if chunk)
    return title, text_content


def sanitize_filename(name: str) -> str:
    sanitized = "".join(c for c in name if c.isalnum() or c in (" ", "-", "_")).strip()
    sanitized = sanitized.replace(" ", "_")[:100]
    return sanitized or "webpage"


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "document-service"}


@app.post("/url")
async def ingest_url(req: URLIngestInput):
    """Fetch URL content, clean it, upload to MinIO, and store metadata in PostgreSQL."""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            resp = await client.get(req.url, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to fetch URL: HTTP {resp.status_code}")
            html = resp.text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching URL: {str(e)}")

    title, text_content = clean_html(html)
    safe_title = sanitize_filename(title)
    filename = f"{safe_title}.txt"
    content_bytes = text_content.encode("utf-8")
    file_size = len(content_bytes)

    doc_id = str(uuid.uuid4())
    minio_path = f"documents/{doc_id}/{filename}"

    # Upload to MinIO
    client = get_minio_client()
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)

    client.put_object(
        MINIO_BUCKET,
        minio_path,
        BytesIO(content_bytes),
        length=file_size,
        content_type="text/plain; charset=utf-8",
    )

    # Store metadata in PostgreSQL
    metadata_json = json.dumps({"source_url": req.url})
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO documents (id, filename, file_type, file_size, minio_path,
               uploaded_by, department, access_level, status, metadata)
               VALUES (%s, %s, 'url', %s, %s, %s, %s, %s, 'uploaded', %s)""",
            (doc_id, filename, file_size, minio_path,
             req.uploaded_by, req.department, req.access_level, metadata_json),
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
        cur.execute("SELECT minio_path, filename, file_type, metadata FROM documents WHERE id = %s", (document_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        minio_path, filename, file_type, metadata = row
    finally:
        conn.close()

    client = get_minio_client()
    response = client.get_object(MINIO_BUCKET, minio_path)
    try:
        content = response.read()
    finally:
        response.close()
        response.release_conn()

    headers = {"Content-Disposition": content_disposition(filename)}
    if metadata:
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        if isinstance(metadata, dict) and "source_url" in metadata:
            headers["X-Source-URL"] = metadata["source_url"]

    return Response(
        content=content,
        media_type=get_media_type(file_type),
        headers=headers,
    )
