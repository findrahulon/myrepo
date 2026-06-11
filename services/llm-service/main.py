"""RAGnarok LLM Service — prompt building and Ollama integration for grounded answer generation."""

import os
import logging

import httpx
import tiktoken
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RAGnarok LLM Service", version="1.0.0")
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
PRIMARY_MODEL = os.getenv("PRIMARY_MODEL", "llama3.1:8b")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "qwen3:8b")

SYSTEM_PROMPT = """You are RAGnarok, an enterprise knowledge assistant. Your task is to provide
accurate, well-structured answers based ONLY on the provided context documents.

Rules:
1. Only use information from the provided context chunks.
2. If the context doesn't contain enough information, say so clearly.
3. Include inline citations using [1], [2], etc. referencing the source chunks.
4. Be concise but thorough.
5. If multiple sources agree, mention the agreement.
6. Never fabricate information not present in the context."""

NUM_CTX = 4096
MAX_PROMPT_TOKENS = NUM_CTX - 512  # Reserve 512 tokens for generation


def _count_tokens(text: str) -> int:
    """Approximate token count using cl100k_base tokenizer."""
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return len(text) // 4  # Rough fallback


def build_prompt(query: str, chunks: list[dict]) -> str:
    """Build a prompt with context chunks for the LLM, truncating if needed to fit context window."""
    # Build the suffix (query + instructions) first so we know how much room context gets
    suffix = f"\n\nQuestion: {query}\n\nPlease provide a comprehensive answer based on the context above. Use inline citations [1], [2], etc."
    system_tokens = _count_tokens(SYSTEM_PROMPT)
    suffix_tokens = _count_tokens(suffix)
    available_tokens = MAX_PROMPT_TOKENS - system_tokens - suffix_tokens - 50  # 50-token safety margin

    context_parts = []
    used_tokens = 0
    for i, chunk in enumerate(chunks, 1):
        source_info = f"[Source {i}]"
        if chunk.get("page_number"):
            source_info += f" (Page {chunk['page_number']})"
        if chunk.get("document_id"):
            source_info += f" (Doc: {chunk['document_id'][:8]})"
        part = f"{source_info}\n{chunk.get('chunk_text', '')}"
        part_tokens = _count_tokens(part)
        if used_tokens + part_tokens > available_tokens:
            logger.warning(f"Truncating context at chunk {i}/{len(chunks)}: "
                           f"{used_tokens + part_tokens} tokens would exceed {available_tokens} available")
            break
        context_parts.append(part)
        used_tokens += part_tokens

    context = "\n\n---\n\n".join(context_parts)
    prompt = f"""Context Documents:\n{context}{suffix}"""

    total_tokens = _count_tokens(prompt) + system_tokens
    logger.info(f"Prompt built: {len(context_parts)}/{len(chunks)} chunks, ~{total_tokens} tokens (limit {NUM_CTX})")
    return prompt


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
    
    # Increased timeout to 300s (5 min) for swapping on 8GB RAM
    async with httpx.AsyncClient(timeout=300.0) as client:
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
                        "num_predict": 512,
                        "num_ctx": NUM_CTX,
                        "num_batch": 32,
                        "num_gpu": 0,
                        "num_thread": 2,
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
                        "num_predict": 512,
                        "num_ctx": NUM_CTX,
                        "num_batch": 32,
                        "num_gpu": 0,
                        "num_thread": 2,
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
                  "running and a model (phi, orca-mini, llama2) is pulled.",
        "model_used": "none",
        "error": "Both primary and fallback models unavailable",
    }
