"""RAGnarok Citation Engine — generates inline citations with source document references."""

import re
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="RAGnarok Citation Service", version="1.0.0")


class CiteRequest(BaseModel):
    answer: str
    chunks: list[dict]


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "citation-service"}


@app.post("/cite")
async def generate_citations(req: CiteRequest):
    """Generate citation metadata from the answer and source chunks."""
    citations = []
    cited_answer = req.answer

    # Extract existing citation references [1], [2], etc. from the answer
    citation_refs = set(re.findall(r'\[(\d+)\]', req.answer))

    for i, chunk in enumerate(req.chunks):
        idx = i + 1
        citation = {
            "index": idx,
            "document_id": chunk.get("document_id", ""),
            "doc_title": f"Document {chunk.get('document_id', 'unknown')[:8]}",
            "section": chunk.get("section", ""),
            "page": chunk.get("page_number", 1),
            "chunk_index": chunk.get("chunk_index", 0),
            "relevance_score": chunk.get("relevance_score", 0.0),
            "snippet": chunk.get("chunk_text", "")[:200],
        }
        citations.append(citation)

    # If the LLM didn't include citations, add them to the end
    if not citation_refs and req.chunks:
        source_refs = " ".join(f"[{i+1}]" for i in range(len(req.chunks)))
        cited_answer = f"{req.answer}\n\nSources: {source_refs}"

    return {
        "cited_answer": cited_answer,
        "citations": citations,
        "citation_count": len(citations),
    }
