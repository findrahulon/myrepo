"""RAGnarok Chunking Service — splits documents into 500-token chunks with 100-token overlap."""

import os
import io
import uuid
from typing import Optional

import psycopg2
import tiktoken
from fastapi import FastAPI
from pydantic import BaseModel
from minio import Minio

app = FastAPI(title="RAGnarok Chunking Service", version="1.0.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ragnarok:ragnarok_secret@localhost:5432/ragnarok")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "ragnarok-documents")

CHUNK_SIZE = 500   # tokens
CHUNK_OVERLAP = 100  # tokens

encoding = tiktoken.get_encoding("cl100k_base")


def get_minio_client():
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )


def get_db():
    return psycopg2.connect(DATABASE_URL)


def extract_text_from_pdf(content: bytes) -> list[dict]:
    """Extract text from PDF, returning list of {page, text}."""
    from PyPDF2 import PdfReader
    reader = PdfReader(io.BytesIO(content))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"page": i + 1, "text": text})
    return pages


def extract_text_from_docx(content: bytes) -> list[dict]:
    """Extract text from DOCX."""
    from docx import Document
    doc = Document(io.BytesIO(content))
    pages = []
    current_text = []
    for para in doc.paragraphs:
        current_text.append(para.text)
    full_text = "\n".join(current_text)
    # Approximate pages by splitting every ~3000 chars
    for i in range(0, len(full_text), 3000):
        segment = full_text[i:i + 3000]
        if segment.strip():
            pages.append({"page": (i // 3000) + 1, "text": segment})
    return pages


def chunk_text(text: str, page_number: int = 1) -> list[dict]:
    """Split text into chunks of CHUNK_SIZE tokens with CHUNK_OVERLAP overlap."""
    tokens = encoding.encode(text)
    chunks = []
    start = 0
    idx = 0
    while start < len(tokens):
        end = min(start + CHUNK_SIZE, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append({
            "chunk_index": idx,
            "chunk_text": chunk_text,
            "page_number": page_number,
            "token_count": len(chunk_tokens),
        })
        idx += 1
        start += CHUNK_SIZE - CHUNK_OVERLAP
        if end >= len(tokens):
            break
    return chunks


class ChunkRequest(BaseModel):
    document_id: str
    minio_path: str
    filename: str


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "chunking-service"}


@app.post("/chunk")
async def chunk_document(req: ChunkRequest):
    """Download document from MinIO, extract text, chunk, and store in PostgreSQL."""
    # Download from MinIO
    client = get_minio_client()
    response = client.get_object(MINIO_BUCKET, req.minio_path)
    content = response.read()
    response.close()

    # Extract text based on file type
    ext = req.filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        pages = extract_text_from_pdf(content)
    elif ext in ("docx", "doc"):
        pages = extract_text_from_docx(content)
    elif ext == "txt":
        pages = [{"page": 1, "text": content.decode("utf-8", errors="replace")}]
    else:
        return {"error": f"Unsupported file type: {ext}", "chunks": [], "chunk_count": 0}

    # Chunk all pages
    all_chunks = []
    global_idx = 0
    for page_data in pages:
        page_chunks = chunk_text(page_data["text"], page_data["page"])
        for c in page_chunks:
            c["chunk_index"] = global_idx
            global_idx += 1
        all_chunks.extend(page_chunks)

    # Store chunks in PostgreSQL
    conn = get_db()
    try:
        cur = conn.cursor()
        for chunk in all_chunks:
            chunk_id = str(uuid.uuid4())
            chunk["id"] = chunk_id
            cur.execute(
                """INSERT INTO chunks (id, document_id, chunk_text, chunk_index,
                   page_number, token_count)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (chunk_id, req.document_id, chunk["chunk_text"],
                 chunk["chunk_index"], chunk["page_number"], chunk["token_count"]),
            )
        # Update document status and chunk count
        cur.execute(
            "UPDATE documents SET status = 'chunked', chunk_count = %s WHERE id = %s",
            (len(all_chunks), req.document_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "document_id": req.document_id,
        "chunk_count": len(all_chunks),
        "chunks": all_chunks,
    }
