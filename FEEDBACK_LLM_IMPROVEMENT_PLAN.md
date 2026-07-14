# Plan: Integrate User Feedback into LLM Improvement Pipeline

**Document Version:** 1.0  
**Created:** July 14, 2026  
**Status:** Planning Phase  

---

## Executive Summary

This document outlines a comprehensive strategy to integrate user feedback into the RAGnarok LLM system to improve response quality over time. The system will collect user corrections, ratings, and comments; analyze them to identify patterns and weak queries; generate fine-tuning datasets; and dynamically adjust LLM behavior based on feedback insights.

The implementation requires changes across 6 components: database schema, feedback-service (enrichment & analysis), llm-service (dynamic adjustment), a new fine-tuning-service, api-gateway (orchestration), and docker-compose configuration.

---

## 1. Current State Analysis

### 1.1 Existing Feedback System

The RAGnarok system currently has:

- **Feedback Collection** (`feedback-service`, port 8009)
  - Collects user ratings (1-5 scale)
  - Stores optional comments and corrections
  - Stores query_id, user_id, query_text, created_at
  
- **Database Schema** (`init-scripts/01-init.sql`)
  - `feedback` table: id, query_id, user_id, query_text, rating, comment, correction, created_at
  - No correlation with LLM response data
  - No links to chunks used or confidence scores

- **Feedback Endpoints** (feedback-service)
  - `POST /feedback` — submit feedback
  - `GET /feedback` — list all feedback
  - `GET /feedback/stats` — summary statistics

### 1.2 LLM System Components

- **LLM Service** (`llm-service`, port 8005)
  - Uses Ollama backend (llama3.1:8b or qwen3:8b)
  - Hard-coded SYSTEM_PROMPT with fixed rules
  - Fixed temperature (0.3), num_predict (128)
  - No awareness of past feedback or corrections
  - No dynamic prompt modification

- **API Gateway** (`api-gateway`, port 8000)
  - Orchestrates full RAG pipeline
  - Calls retrieval → LLM → citation → explanation → confidence → audit
  - Logs to audit_logs table (not linked to feedback)

### 1.3 Gaps

1. Feedback data lacks response context (answer, chunks, confidence, model)
2. No analysis of feedback patterns or failure modes
3. LLM system is static — no adaptation based on user corrections
4. No mechanism to generate training data from corrections
5. Audit logs and feedback are separate (no correlation)
6. No triggering mechanism to retry failed queries or adjust parameters

---

## 2. Proposed Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Feedback Loop                      │
└─────────────────────────────────────────────────────────────┘

1. User submits feedback on LLM response
   ↓
2. API Gateway enriches feedback with audit data
   ↓
3. Feedback Service analyzes patterns
   ↓
4. Fine-Tuning Service generates training data
   ├─→ Store JSONL for batch fine-tuning
   └─→ Inject corrections into LLM prompt (in-context learning)
   ↓
5. LLM Service adjusts behavior
   ├─→ Dynamic system prompt
   ├─→ Temperature/parameter adjustment
   └─→ Context injection for known failures
   ↓
6. Next query uses improved parameters & context
```

---

## 3. Detailed Implementation Steps

### Step 1: Enhance Database Schema

**Files:** `init-scripts/01-init.sql`

**Changes:**

Add new columns to `feedback` table to correlate with audit data:
```sql
ALTER TABLE feedback ADD COLUMN (
    response_text TEXT,
    chunks_used JSONB,
    confidence_score FLOAT,
    confidence_level VARCHAR(20),
    model_used VARCHAR(100),
    latency_ms INTEGER,
    feedback_quality FLOAT DEFAULT 0.5,  -- 0.0-1.0 weighting
    is_correction BOOLEAN DEFAULT FALSE,
    action_taken VARCHAR(50) DEFAULT 'none'  -- none, retry, retrain
);
```

Create new `feedback_analysis` table for insights:
```sql
CREATE TABLE feedback_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_date DATE NOT NULL,
    total_feedback_count INTEGER,
    avg_rating FLOAT,
    low_rating_count INTEGER,  -- rating <= 2
    correction_count INTEGER,
    correction_rate FLOAT,
    most_problematic_queries JSONB,
    confidence_mismatch_count INTEGER,  -- high confidence but low rating
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE correction_training_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feedback_id UUID NOT NULL REFERENCES feedback(id),
    query_text TEXT NOT NULL,
    original_answer TEXT,
    corrected_answer TEXT,
    chunks_context JSONB,
    quality_score FLOAT,
    used_in_training BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Step 2: Enhance Feedback Service

**Files:** `services/feedback-service/main.py`

**Changes:**

1. **Update FeedbackRequest model** to accept more context:
```python
class FeedbackRequest(BaseModel):
    query_id: Optional[str] = None
    user_id: str
    query_text: Optional[str] = None
    response_text: Optional[str] = None  # NEW
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    correction: Optional[str] = None
    chunks_used: Optional[list] = None  # NEW
    confidence_score: Optional[float] = None  # NEW
    confidence_level: Optional[str] = None  # NEW
    model_used: Optional[str] = None  # NEW
    latency_ms: Optional[int] = None  # NEW
```

2. **Add feedback enrichment endpoint**:
```python
@app.post("/feedback/analyze")
async def analyze_feedback_patterns():
    """Analyze feedback to identify improvement opportunities."""
    # Identify queries with avg_rating <= 2
    # Find high correction rates
    # Detect confidence-rating mismatches
    # Return insights for fine-tuning
```

3. **Add endpoint to generate training data**:
```python
@app.post("/feedback/extract-training-data")
async def extract_training_data(quality_threshold: float = 0.6):
    """Extract high-quality corrections as training examples."""
    # Query corrections with rating <= 2
    # Validate quality (comments suggest real correction)
    # Format as JSONL (query, original, corrected, context)
    # Store in correction_training_data table
    # Return file path or data
```

4. **Add analytics endpoints**:
```python
@app.get("/feedback/insights")
async def get_feedback_insights(days: int = 7):
    """Get insights about failure modes and patterns."""
    # Return most problematic queries
    # Confidence vs rating mismatches
    # Correction trends
```

### Step 3: Create Fine-Tuning Service (NEW)

**Files:** `services/fine-tuning-service/main.py` (new), `requirements.txt`, `Dockerfile`

**Responsibilities:**

1. Consume training data from feedback-service
2. Generate Ollama-compatible fine-tuning format
3. Manage fine-tuning jobs (batch training)
4. Store trained model artifacts
5. Provide prompt templates based on corrections

**Key endpoints:**

```python
@app.post("/generate-training-data")
async def generate_training_data(min_quality: float = 0.5):
    """Format corrections as training examples for Ollama."""

@app.post("/prepare-finetuning-job")
async def prepare_job(model_name: str = "llama3.1:8b"):
    """Stage training data for fine-tuning."""

@app.post("/inject-corrections")
async def inject_corrections_into_prompt(query: str, limit: int = 3):
    """Find and inject similar past corrections into system prompt."""

@app.get("/finetuning-status")
async def get_status():
    """Report on pending/completed fine-tuning jobs."""
```

### Step 4: Modify LLM Service for Dynamic Adjustment

**Files:** `services/llm-service/main.py`

**Changes:**

1. **Make SYSTEM_PROMPT dynamic**:
```python
async def build_dynamic_system_prompt(query: str, feedback_insights: dict = None) -> str:
    """Build system prompt with injected corrections and patterns."""
    base_prompt = """You are RAGnarok, an enterprise knowledge assistant..."""
    
    if feedback_insights:
        if feedback_insights.get('similar_corrections'):
            base_prompt += "\n\nPAST CORRECTIONS FOR SIMILAR QUERIES:\n"
            for correction in feedback_insights['similar_corrections'][:3]:
                base_prompt += f"- For '{correction['original_query']}': {correction['hint']}\n"
    
    return base_prompt
```

2. **Accept dynamic parameters**:
```python
class GenerateRequest(BaseModel):
    query: str
    chunks: list[dict]
    feedback_context: Optional[dict] = None  # NEW
    dynamic_temperature: Optional[float] = None  # NEW
    dynamic_num_predict: Optional[int] = None  # NEW
```

3. **Adjust parameters based on confidence**:
```python
async def generate(req: GenerateRequest):
    temperature = req.dynamic_temperature or 0.3
    num_predict = req.dynamic_num_predict or 128
    
    # If low-confidence query, be more careful
    if req.feedback_context and req.feedback_context.get('prev_low_confidence'):
        temperature = 0.1  # More deterministic
        num_predict = 256  # More detailed response
    
    # Make request to Ollama with adjusted parameters
```

### Step 5: Update API Gateway for Feedback Integration

**Files:** `services/api-gateway/main.py`

**Changes:**

1. **Enrich feedback submission** in `submit_feedback` endpoint:
```python
@app.post("/api/v1/feedback")
async def submit_feedback(req: FeedbackRequest, token_payload: dict = Depends(validate_token)):
    """Submit feedback with full context from audit logs."""
    
    # Link feedback to audit logs
    audit_record = find_audit_record(req.query_id)  # NEW
    
    enriched_req = FeedbackRequest(
        **req.dict(),
        response_text=audit_record.get('response_text'),
        chunks_used=audit_record.get('chunks_retrieved'),
        confidence_score=audit_record.get('confidence_score'),
        model_used=audit_record.get('model_used'),
        latency_ms=audit_record.get('latency_ms')
    )
    
    # Submit enriched feedback
    feedback_resp = await client.post(
        f"{FEEDBACK_SERVICE}/feedback",
        json=enriched_req.dict()
    )
    
    return feedback_resp.json()
```

2. **Add feedback-informed query endpoint**:
```python
@app.post("/api/v1/query-improved")
async def query_with_feedback(req: QueryRequest, token_payload: dict = Depends(validate_token)):
    """Query endpoint that uses feedback insights to improve response."""
    
    # Get feedback insights for similar queries
    insights = await client.get(
        f"{FEEDBACK_SERVICE}/feedback/insights?days=30"
    )
    
    # Get correction injections
    corrections = await client.post(
        f"{FINE_TUNING_SERVICE}/inject-corrections",
        json={"query": req.query, "limit": 3}
    )
    
    # Proceed with standard query but pass feedback context to LLM
    feedback_context = {
        'similar_corrections': corrections.get('injections'),
        'prev_low_confidence': check_if_similar_query_failed(req.query, insights)
    }
    
    # ... rest of RAG pipeline with feedback_context passed to llm-service
```

3. **Trigger analysis after feedback**:
```python
# After feedback is submitted
if negative_feedback:  # rating <= 2
    # Trigger analysis asynchronously
    await client.post(f"{FEEDBACK_SERVICE}/feedback/analyze")
```

### Step 6: Update Docker Compose

**Files:** `docker-compose.yml`

**Changes:**

Add new fine-tuning-service:
```yaml
fine-tuning-service:
  build: ./services/fine-tuning-service
  ports:
    - "8011:8011"
  environment:
    FEEDBACK_SERVICE_URL: http://feedback-service:8009
    LLM_SERVICE_URL: http://llm-service:8005
    OLLAMA_BASE_URL: http://ollama:11434
    DATABASE_URL: postgresql://ragnarok:ragnarok_secret@postgres:5432/ragnarok
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - ragnarok
```

Update api-gateway environment:
```yaml
api-gateway:
  # ...existing...
  environment:
    # ...existing...
    FINE_TUNING_SERVICE_URL: http://fine-tuning-service:8011
```

---

## 4. Implementation Phases

### Phase 1: Data Foundation (Week 1)
- [ ] Create enhanced database schema
- [ ] Update feedback-service to capture full context
- [ ] Create feedback analysis endpoints
- [ ] Update API gateway to enrich feedback

**Outcome:** Feedback data now includes response context and audit correlation.

### Phase 2: Analysis & Extraction (Week 2)
- [ ] Implement feedback pattern analysis
- [ ] Build training data extraction logic
- [ ] Create correction_training_data population
- [ ] Add insights endpoints

**Outcome:** System can identify problematic queries and extract training data.

### Phase 3: Fine-Tuning Service (Week 3)
- [ ] Scaffold fine-tuning-service
- [ ] Implement Ollama fine-tuning integration
- [ ] Build correction injection logic
- [ ] Add training job management

**Outcome:** Fine-tuning pipeline ready for batch training.

### Phase 4: Dynamic LLM Adjustment (Week 4)
- [ ] Modify llm-service for dynamic prompts
- [ ] Implement parameter adjustment logic
- [ ] Add feedback-context acceptance
- [ ] Test with injected corrections

**Outcome:** LLM responds dynamically to feedback patterns.

### Phase 5: Integration & Optimization (Week 5)
- [ ] Create improved-query endpoints in API gateway
- [ ] Implement feedback-triggered workflows
- [ ] Add monitoring and metrics
- [ ] Performance tuning

**Outcome:** Full feedback loop operational and monitored.

### Phase 6: Ollama Fine-Tuning (Optional, Week 6+)
- [ ] Implement actual fine-tuning job submission
- [ ] Model versioning strategy
- [ ] Automated retraining on schedule
- [ ] Fallback to standard model if needed

**Outcome:** System can perform actual model fine-tuning with user corrections.

---

## 5. Data Flow Example

**Scenario:** User asks "What is our return policy?" and gets a response marked as incorrect (rating = 1, correction = "Only valid within 30 days of purchase, not 60").

### Step 1: Feedback Collection
```
POST /api/v1/feedback
{
  "query_id": "req-123",
  "query_text": "What is our return policy?",
  "response_text": "Returns accepted for 60 days...",
  "rating": 1,
  "correction": "Only valid within 30 days of purchase",
  "chunks_used": [...audit data...],
  "confidence_score": 0.85,
  "model_used": "llama3.1:8b"
}
```

### Step 2: Enrichment & Storage
```
- Feedback service stores enriched record
- Triggers POST /feedback/analyze
```

### Step 3: Pattern Analysis
```
Analysis identifies:
- 5 similar queries in past 7 days
- 4 of them also marked as wrong (same issue)
- Confidence score: 0.82 avg (high but low ratings)
- Pattern: "Return policy period incorrect"
```

### Step 4: Training Data Extraction
```
Creates correction entry:
{
  "query": "What is our return policy?",
  "original_answer": "Returns accepted for 60 days...",
  "corrected_answer": "Returns accepted for 30 days of purchase",
  "context": "Return policy corrections",
  "quality_score": 0.95  # Multiple confirmations
}
```

### Step 5: Prompt Injection
```
Fine-tuning service creates injection:
"CRITICAL: Users report return policy is 30 days, not 60.
If asked about returns, verify: 30 days from purchase date."

Next time similar query comes, system prompt includes this hint.
```

### Step 6: Dynamic Response
```
Next user asks: "When can I return items?"

LLM receives injected hint in system prompt
→ Responds with: "Items can be returned within 30 days of purchase"
→ Higher quality response
→ User satisfaction improves
```

---

## 6. Key Design Decisions

### 6.1 Feedback Quality Weighting

**Option A:** All corrections weighted equally (simple)
**Option B:** Weight by user role (admin 2x, manager 1.5x, user 1x) — **RECOMMENDED**
**Option C:** Weight by correction consensus (if 3+ users report same issue, boost weight)

**Recommendation:** Start with B. Multiple confirmations trigger higher weighting automatically.

### 6.2 Fine-Tuning Strategy

**Option A:** Batch fine-tuning (weekly retraining with accumulated corrections)
**Option B:** In-context learning only (inject corrections into system prompt)
**Option C:** Hybrid (both strategies)

**Recommendation:** Start with B for speed and immediate results. Move to A/C for production scale. Hybrid works best: B for quick adaptation, A for model improvement.

### 6.3 Triggering Improvement Logic

**Option A:** Re-prompt LLM with different temperature when feedback is negative
**Option B:** Only collect for batch analysis (no immediate retry)
**Option C:** Adaptive retry logic (low confidence + negative feedback = retry with adjusted params)

**Recommendation:** C. Immediate retry on low-confidence + negative feedback. Longer feedback patterns inform fine-tuning.

### 6.4 Correction Validation

Should system require consensus before using corrections?
- Single correction: Quality score = 0.5
- 2+ identical corrections: Quality score = 0.75
- 5+ identical corrections: Quality score = 0.95

**Recommendation:** Yes. Set training data extraction threshold at 0.75+ to avoid learning from outliers.

---

## 7. Monitoring & Metrics

### Key Metrics to Track

1. **Feedback Quality**
   - Average rating trend (target: ≥4.0)
   - Correction rate (what % of feedback includes corrections)
   - Consensus level (multiple users confirming same issue)

2. **System Improvement**
   - Rating trend over time (before/after feedback integration)
   - Confidence-rating alignment (high confidence = high ratings)
   - Latency impact of feedback enrichment

3. **Fine-Tuning Impact**
   - Queries affected by injected corrections (success rate)
   - Model fine-tuning accuracy (if using batch training)
   - User satisfaction on "improved" queries

### Dashboard Endpoints

```python
@app.get("/admin/feedback-dashboard")
async def dashboard():
    """Return metrics for admin dashboard."""
    return {
        "avg_rating_7d": ...,
        "correction_rate": ...,
        "most_problematic_queries": [...],
        "improvement_metrics": {...},
    }
```

---

## 8. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Malicious feedback skews LLM | High | Weight by user role; require consensus; manual review of high-impact corrections |
| Performance degradation (enrichment adds latency) | Medium | Async feedback processing; cache insights; optimize queries |
| Fine-tuning fails on Ollama | Medium | Graceful fallback to standard model; versioning strategy; rollback plan |
| Feedback loop creates bad patterns | Medium | Quality validation; diversity checks; regular human review |
| Privacy: storing user corrections | Medium | Anonymize training data; RBAC on insights; audit access logs |

---

## 9. Success Criteria

- [ ] User feedback collection captures full context (response, chunks, confidence, model)
- [ ] Feedback analysis identifies top 10 problematic queries within 24 hours
- [ ] Correction injection improves ratings on similar queries by ≥15%
- [ ] Fine-tuning service can process 100+ corrections per week
- [ ] Dynamic prompts reduce latency by <5%
- [ ] 90%+ of injected corrections improve or maintain response quality

---

## 10. Future Enhancements

1. **Automatic Correction Extraction** — Use NLP to extract corrections from free-text comments
2. **User Feedback Clustering** — Group similar corrections automatically
3. **Confidence-Based Retry** — Automatically retry low-confidence queries with modified params
4. **Model Versioning** — Track which fine-tuned model version produced best results
5. **A/B Testing** — Compare standard vs. fine-tuned models on test queries
6. **Explanation Improvement** — Use feedback to improve explanation-service accuracy
7. **Citation Validation** — Track if users find cited sources helpful (new feedback type)

---

## Appendix: File Changes Summary

| File | Changes |
|------|---------|
| `init-scripts/01-init.sql` | Add feedback columns, create analysis tables |
| `services/feedback-service/main.py` | Add enrichment, analysis, training data extraction endpoints |
| `services/llm-service/main.py` | Dynamic prompts, parameter adjustment, feedback context acceptance |
| `services/api-gateway/main.py` | Feedback enrichment, feedback-informed query endpoint |
| `docker-compose.yml` | Add fine-tuning-service container |
| `services/fine-tuning-service/main.py` | New service for training data management |
| `services/fine-tuning-service/requirements.txt` | New service dependencies |
| `services/fine-tuning-service/Dockerfile` | New service container definition |

---

**End of Plan**

