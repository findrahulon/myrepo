"""RAGnarok Retrieval Service — semantic search over Qdrant with RBAC filtering."""

import os
import logging
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient

app = FastAPI(title="RAGnarok Retrieval Service", version="1.0.0")
logger = logging.getLogger(__name__)

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "enterprise_knowledge")
MODEL_NAME = "BAAI/bge-small-en-v1.5"

# RBAC access hierarchy
ACCESS_HIERARCHY = {
    "basic": 1,
    "standard": 2,
    "elevated": 3,
    "extended": 4,
    "full": 5,
    "admin": 5,
    "user": 2,
}

model: Optional[SentenceTransformer] = None
qdrant: Optional[QdrantClient] = None


@app.on_event("startup")
async def startup():
    global model, qdrant
    logger.info(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5
    access_level: str = "basic"
    filters: Optional[dict] = None


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "retrieval-service"}


@app.post("/retrieve")
async def retrieve(req: RetrieveRequest):
    """Embed query and search Qdrant for relevant chunks."""
    # Generate query embedding
    query_embedding = model.encode(req.query, normalize_embeddings=True).tolist()

    # Search Qdrant
    try:
        results = qdrant.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_embedding,
            limit=req.top_k * 2,  # Fetch more for RBAC filtering
        )
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return {"chunks": [], "total_found": 0}

    # RBAC filtering — filter chunks based on access level
    user_level = ACCESS_HIERARCHY.get(req.access_level, 1)
    filtered_chunks = []
    for result in results:
        chunk_access = result.payload.get("access_level", "basic")
        chunk_level = ACCESS_HIERARCHY.get(chunk_access, 1)
        if user_level >= chunk_level:
            filtered_chunks.append({
                "id": str(result.id),
                "chunk_text": result.payload.get("chunk_text", ""),
                "document_id": result.payload.get("document_id", ""),
                "chunk_index": result.payload.get("chunk_index", 0),
                "page_number": result.payload.get("page_number", 1),
                "section": result.payload.get("section", ""),
                "relevance_score": round(result.score, 4),
            })
        if len(filtered_chunks) >= req.top_k:
            break

    return {
        "chunks": filtered_chunks,
        "total_found": len(filtered_chunks),
        "query": req.query,
    }
