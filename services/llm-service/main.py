"""RAGnarok LLM Service - prompt building and OpenAI integration for grounded answer generation."""

import os
import logging

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RAGnarok LLM Service", version="1.0.0")
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
OPENAI_PROJECT = os.getenv("OPENAI_PROJECT")
OPENAI_ORG = os.getenv("OPENAI_ORG")
PRIMARY_MODEL = os.getenv("PRIMARY_MODEL", "gpt-4o-mini")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "gpt-3.5-turbo")
OPENAI_TIMEOUT_SECONDS = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "120"))
OPENAI_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "256"))
OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.3"))

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


def openai_headers() -> dict:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    if OPENAI_PROJECT:
        headers["OpenAI-Project"] = OPENAI_PROJECT
    if OPENAI_ORG:
        headers["OpenAI-Organization"] = OPENAI_ORG
    return headers


def extract_answer(data: dict) -> str:
    choices = data.get("choices", [])
    if not choices:
        return ""

    message = choices[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "llm-service",
        "provider": "openai",
        "model": PRIMARY_MODEL,
        "configured": bool(OPENAI_API_KEY),
    }


@app.post("/generate")
async def generate(req: GenerateRequest):
    """Generate an answer using OpenAI with the provided context chunks."""
    prompt = build_prompt(req.query, req.chunks)

    if not OPENAI_API_KEY:
        return {
            "answer": "OPENAI_API_KEY is not configured. Please set the API key in environment variables.",
            "model_used": "none",
            "error": "OPENAI_API_KEY missing",
        }

    models_to_try = [PRIMARY_MODEL]
    if FALLBACK_MODEL != PRIMARY_MODEL:
        models_to_try.append(FALLBACK_MODEL)

    async with httpx.AsyncClient(timeout=OPENAI_TIMEOUT_SECONDS) as client:
        for model in models_to_try:
            try:
                logger.info(f"Trying OpenAI model: {model}")
                response = await client.post(
                    f"{OPENAI_API_BASE}/chat/completions",
                    headers=openai_headers(),
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": OPENAI_TEMPERATURE,
                        "max_tokens": OPENAI_MAX_TOKENS,
                    },
                )

                if response.status_code != 200:
                    logger.warning(
                        f"OpenAI model {model} failed with {response.status_code}: {response.text[:300]}"
                    )
                    continue

                data = response.json()
                answer = extract_answer(data)
                if not answer:
                    logger.warning(f"OpenAI model {model} returned empty response")
                    continue

                usage = data.get("usage", {})
                return {
                    "answer": answer,
                    "model_used": model,
                    "eval_count": usage.get("total_tokens", 0),
                    "eval_duration": 0,
                }
            except httpx.HTTPError as e:
                logger.error(f"OpenAI request failed for model {model}: {e}", exc_info=True)
            except ValueError as e:
                logger.error(f"Failed to parse OpenAI response for model {model}: {e}", exc_info=True)

    return {
        "answer": "I apologize, but I'm unable to generate an answer at this time. "
                  "The OpenAI LLM service is temporarily unavailable. Please check your API key and quota.",
        "model_used": "none",
        "error": "Both primary and fallback OpenAI models unavailable",
    }
