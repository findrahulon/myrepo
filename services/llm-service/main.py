"""RAGnarok LLM Service — prompt building and Ollama integration for grounded answer generation."""

import os
import logging

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RAGnarok LLM Service", version="1.0.0")
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
PRIMARY_MODEL = os.getenv("PRIMARY_MODEL", "neural-chat")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "neural-chat")

SYSTEM_PROMPT = """You are RAGnarok, an enterprise knowledge assistant. Your task is to provide
accurate, well-structured answers based ONLY on the provided context documents.

Rules:
1. Only use information from the provided context chunks.
2. If the context doesn't contain enough information, say so clearly.
3. Include inline citations using [1], [2], etc. referencing the source chunks.
4. Be concise but thorough.
5. If multiple sources agree, mention the agreement.
6. Never fabricate information not present in the context."""


def build_prompt(query: str, chunks: list[dict]) -> str:
    """Build a prompt with context chunks for the LLM."""
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        source_info = f"[Source {i}]"
        if chunk.get("page_number"):
            source_info += f" (Page {chunk['page_number']})"
        if chunk.get("document_id"):
            source_info += f" (Doc: {chunk['document_id'][:8]})"
        context_parts.append(f"{source_info}\n{chunk.get('chunk_text', '')}")

    context = "\n\n---\n\n".join(context_parts)

    return f"""Context Documents:
{context}

Question: {query}

Please provide a comprehensive answer based on the context above. Use inline citations [1], [2], etc."""


class GenerateRequest(BaseModel):
    query: str
    chunks: list[dict]


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "llm-service"}


@app.post("/generate")
async def generate(req: GenerateRequest):
    """Generate an answer using Ollama with the provided context chunks."""
    prompt = build_prompt(req.query, req.chunks)
    
    logger.info(f"Attempting to connect to Ollama at {OLLAMA_BASE_URL}")
    
    # Increased timeout to 600s (10 min) for slow CPU-based inference
    async with httpx.AsyncClient(timeout=600.0) as client:
        # Try primary model first
        try:
            logger.info(f"Trying primary model: {PRIMARY_MODEL}")
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": PRIMARY_MODEL,
                    "prompt": prompt,
                    "system": SYSTEM_PROMPT,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_p": 0.9,
                        "num_predict": 256,
                        "num_ctx": 1024,
                        "num_batch": 4,
                        "num_gpu": 0,
                        "num_thread": 4,
                    },
                },
            )
            logger.info(f"Primary model response status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "answer": data.get("response", ""),
                    "model_used": PRIMARY_MODEL,
                    "eval_count": data.get("eval_count", 0),
                    "eval_duration": data.get("eval_duration", 0),
                }
            else:
                logger.warning(f"Primary model returned status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.error(f"Primary model failed: {type(e).__name__}: {e}", exc_info=True)

        # Try fallback model
        try:
            logger.info(f"Trying fallback model: {FALLBACK_MODEL}")
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": FALLBACK_MODEL,
                    "prompt": prompt,
                    "system": SYSTEM_PROMPT,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_p": 0.9,
                        "num_predict": 256,
                        "num_ctx": 1024,
                        "num_batch": 4,
                        "num_gpu": 0,
                        "num_thread": 4,
                    },
                },
            )
            logger.info(f"Fallback model response status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "answer": data.get("response", ""),
                    "model_used": FALLBACK_MODEL,
                    "eval_count": data.get("eval_count", 0),
                    "eval_duration": data.get("eval_duration", 0),
                }
            else:
                logger.warning(f"Fallback model returned status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.error(f"Fallback model also failed: {type(e).__name__}: {e}", exc_info=True)

    # If both models fail, return a helpful message
    return {
        "answer": "I apologize, but I'm unable to generate an answer at this time. "
                  "The LLM service is temporarily unavailable. Please ensure Ollama is "
                  "running and a model (llama2) is pulled.",
        "model_used": "none",
        "error": "Both primary and fallback models unavailable",
    }
