"""RAGnarok Embedding Service — generates embeddings using BGE model and stores in Qdrant."""

import os
import logging
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, CollectionStatus
)

app = FastAPI(title="RAGnarok Embedding Service", version="1.0.0")
logger = logging.getLogger(__name__)

QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "enterprise_knowledge")
MODEL_NAME = "BAAI/bge-small-en-v1.5"
VECTOR_DIM = 384

model: Optional[SentenceTransformer] = None
qdrant: Optional[QdrantClient] = None


@app.on_event("startup")
async def startup():
    global qdrant
    logger.info("Initializing Qdrant client")
    qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Create collection if not exists
    collections = qdrant.get_collections().collections
    exists = any(c.name == COLLECTION_NAME for c in collections)
    if not exists:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        logger.info(f"Created Qdrant collection: {COLLECTION_NAME}")
    
    logger.info("Embedding model will be lazy-loaded on first request")


async def ensure_model_loaded():
    global model
    if model is None:
        logger.info(f"Lazy-loading embedding model: {MODEL_NAME}")
        model = SentenceTransformer(MODEL_NAME)
        logger.info("Embedding model loaded successfully")
    return model


class EmbedRequest(BaseModel):
    document_id: str
    filename: str = ""
    chunks: list[dict]


class EmbedTextRequest(BaseModel):
    text: str


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "embedding-service"}


@app.post("/embed")
async def embed_chunks(req: EmbedRequest):
    """Generate embeddings for chunks and store in Qdrant."""
    await ensure_model_loaded()
    
    if not req.chunks:
        return {"vectors_stored": 0}

    texts = [c["chunk_text"] for c in req.chunks]
    embeddings = model.encode(texts, normalize_embeddings=True).tolist()

    points = []
    for i, (chunk, embedding) in enumerate(zip(req.chunks, embeddings)):
        point_id = chunk.get("id", f"{req.document_id}_{i}")
        points.append(
            PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "document_id": req.document_id,
                    "filename": req.filename,
                    "chunk_text": chunk["chunk_text"],
                    "chunk_index": chunk.get("chunk_index", i),
                    "page_number": chunk.get("page_number", 1),
                    "section": chunk.get("section", ""),
                    "token_count": chunk.get("token_count", 0),
                },
            )
        )

    # Upsert in batches of 100
    batch_size = 100
    for j in range(0, len(points), batch_size):
        batch = points[j:j + batch_size]
        qdrant.upsert(collection_name=COLLECTION_NAME, points=batch)

    return {"vectors_stored": len(points), "document_id": req.document_id}


@app.post("/embed-query")
async def embed_query(req: EmbedTextRequest):
    """Generate embedding for a single query text."""
    await ensure_model_loaded()
    embedding = model.encode(req.text, normalize_embeddings=True).tolist()
    return {"embedding": embedding}
