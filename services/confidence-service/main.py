"""RAGnarok Confidence Service — calculates confidence scores for generated answers."""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RAGnarok Confidence Service", version="1.0.0")

# Confidence weights from LLD
WEIGHTS = {
    "retrieval_relevance": 0.35,
    "context_coverage": 0.25,
    "answer_coherence": 0.20,
    "source_agreement": 0.20,
}


class ScoreRequest(BaseModel):
    query: str
    answer: str
    chunks: list[dict]


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "confidence-service"}


@app.post("/score")
async def calculate_confidence(req: ScoreRequest):
    """Calculate multi-signal confidence score for the generated answer."""
    if not req.chunks:
        return {
            "overall": 0.0,
            "level": "LOW",
            "breakdown": {
                "retrieval_relevance": 0.0,
                "context_coverage": 0.0,
                "answer_coherence": 0.0,
                "source_agreement": 0.0,
            },
        }

    # 1. Retrieval relevance — average of chunk relevance scores
    relevance_scores = [c.get("relevance_score", 0) for c in req.chunks]
    retrieval_relevance = sum(relevance_scores) / len(relevance_scores) if relevance_scores else 0

    # 2. Context coverage — ratio of chunks with meaningful content
    non_empty_chunks = sum(1 for c in req.chunks if len(c.get("chunk_text", "")) > 50)
    context_coverage = non_empty_chunks / len(req.chunks) if req.chunks else 0

    # 3. Answer coherence — based on answer length and structure
    answer_len = len(req.answer)
    if answer_len > 100:
        answer_coherence = min(1.0, answer_len / 500)
    elif answer_len > 20:
        answer_coherence = 0.5
    else:
        answer_coherence = 0.2

    # Check if answer contains citations (indicates grounding)
    import re
    citation_count = len(re.findall(r'\[\d+\]', req.answer))
    if citation_count > 0:
        answer_coherence = min(1.0, answer_coherence + 0.2)

    # 4. Source agreement — based on diversity and consistency of sources
    doc_ids = set(c.get("document_id", "") for c in req.chunks)
    if len(doc_ids) > 1:
        source_agreement = min(1.0, 0.6 + (len(doc_ids) * 0.1))
    elif len(doc_ids) == 1:
        source_agreement = 0.7
    else:
        source_agreement = 0.3

    # Calculate weighted overall score
    overall = (
        retrieval_relevance * WEIGHTS["retrieval_relevance"]
        + context_coverage * WEIGHTS["context_coverage"]
        + answer_coherence * WEIGHTS["answer_coherence"]
        + source_agreement * WEIGHTS["source_agreement"]
    )
    overall = round(min(1.0, max(0.0, overall)), 4)

    # Determine confidence level
    if overall >= 0.8:
        level = "HIGH"
    elif overall >= 0.5:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "overall": overall,
        "level": level,
        "breakdown": {
            "retrieval_relevance": round(retrieval_relevance, 4),
            "context_coverage": round(context_coverage, 4),
            "answer_coherence": round(answer_coherence, 4),
            "source_agreement": round(source_agreement, 4),
        },
    }
