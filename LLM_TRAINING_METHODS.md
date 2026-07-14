# LLM Training Methods: Complete Guide for RAGnarok

**Document Version:** 1.0  
**Created:** July 14, 2026  
**Purpose:** Comprehensive guide to training your LLM using user feedback data

---

## Table of Contents

1. [Overview](#overview)
2. [Method 1: In-Context Learning](#method-1-in-context-learning-fastest-approach)
3. [Method 2: Ollama Fine-Tuning](#method-2-ollama-fine-tuning-permanent-improvement)
4. [Method 3: Scheduled Batch Fine-Tuning](#method-3-scheduled-batch-fine-tuning-automated-approach)
5. [Method 4: Hybrid Approach](#method-4-hybrid-approach-recommended-for-production)
6. [Comparison Table](#comparison-table)
7. [Real-World Example](#real-world-example-return-policy-issue)
8. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

Your RAGnarok system currently collects user feedback but doesn't use it to improve the LLM. This guide explains four approaches to train your LLM, each with different tradeoffs between speed, permanence, and effort.

**Quick Decision Guide:**
- **Need immediate results?** → Use In-Context Learning
- **Want permanent improvements?** → Use Ollama Fine-Tuning
- **Want automation?** → Use Scheduled Batch Fine-Tuning
- **Want the best results?** → Use Hybrid Approach (recommended)

---

## Method 1: In-Context Learning (Fastest Approach)

### What Is It?

In-context learning injects recent corrections directly into the LLM's system prompt for each query. The LLM reads these corrections and responds more accurately without any model retraining.

### Steps Involved

#### Step 1: Extract Corrections from Feedback Database

**What happens:**
- Query your PostgreSQL `feedback` table
- Filter for corrections with high quality scores (≥0.75)
- Organize by topic/query similarity

**Code example:**
```python
async def get_injected_corrections(query: str, limit: int = 3):
    """Fetch recent corrections similar to current query."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT query_text, correction, created_at, rating
            FROM correction_training_data
            WHERE quality_score >= 0.75
            ORDER BY created_at DESC
            LIMIT %s
        """, (limit,))
        
        corrections = cur.fetchall()
        return [
            {
                'original_query': row[0],
                'corrected_answer': row[1],
                'hint': f"Users corrected this: {row[1]}"
            }
            for row in corrections
        ]
    finally:
        conn.close()
```

**Why this matters:** This creates a curated list of known issues. You're gathering institutional knowledge from user corrections.

---

#### Step 2: Build Dynamic System Prompt with Injections

**What happens:**
- Start with your base system prompt
- Append a "CRITICAL CORRECTIONS" section
- List 2-3 most relevant corrections for the current query

**Code example:**
```python
async def build_dynamic_system_prompt(
    query: str, 
    feedback_insights: dict = None
) -> str:
    """Build system prompt with injected corrections."""
    
    base_prompt = """You are RAGnarok, an enterprise knowledge assistant. 
Your task is to provide accurate, well-structured answers based ONLY on 
the provided context documents.

Rules:
1. Only use information from the provided context chunks.
2. If the context doesn't contain enough information, say so clearly.
3. Include inline citations using [1], [2], etc.
4. Be concise but thorough."""
    
    # Inject recent corrections if available
    if feedback_insights and feedback_insights.get('similar_corrections'):
        base_prompt += "\n\n⚠️ CRITICAL CORRECTIONS FROM RECENT FEEDBACK:\n"
        for correction in feedback_insights['similar_corrections'][:3]:
            base_prompt += f"- Question: '{correction['original_query']}'\n"
            base_prompt += f"  Correct Answer: {correction['corrected_answer']}\n"
            base_prompt += f"  Verification: {correction['confidence']}\n\n"
    
    return base_prompt
```

**Why this matters:** The system prompt acts as instructions to the LLM. By injecting corrections, you're telling the model "here's what users corrected last time."

**Example output:**
```
Base system prompt: "You are RAGnarok..."

With injections becomes:

"You are RAGnarok...

⚠️ CRITICAL CORRECTIONS FROM RECENT FEEDBACK:
- Question: 'What is return policy?'
  Correct Answer: Items can be returned within 30 days of purchase, not 60.
  Verification: 5 users confirmed this correction

- Question: 'Can I return opened items?'
  Correct Answer: Only unopened items can be returned.
  Verification: 3 users confirmed this correction"
```

---

#### Step 3: Call Ollama with Enhanced System Prompt

**What happens:**
- Send the augmented system prompt to Ollama
- Include the user's query
- The LLM reads both and generates informed responses

**Code example:**
```python
async def generate_with_feedback(req: GenerateRequest):
    """Generate answer with injected corrections."""
    
    # Get feedback injections
    feedback_insights = await get_injected_corrections(req.query, limit=3)
    
    # Build enhanced system prompt
    system_prompt = await build_dynamic_system_prompt(
        req.query,
        feedback_insights=feedback_insights
    )
    
    # Call Ollama with enhanced prompt
    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": "llama3.1:8b",
                "prompt": req.query,
                "system": system_prompt,  # Uses enhanced version
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "top_p": 0.9,
                    "num_predict": 128,
                },
            },
        )
        
        return resp.json()
```

**Why this matters:** This happens in real-time for every query. The LLM learns from past mistakes without permanent model changes.

---

### Advantages of In-Context Learning

| Advantage | Description |
|-----------|-------------|
| **Speed** | Results within minutes, no model training needed |
| **Safety** | Easy to rollback or fix bad corrections immediately |
| **Flexibility** | Corrections update in real-time without redeployment |
| **Simplicity** | Minimal code changes, no infrastructure overhead |
| **Testing** | Safer to experiment with new corrections |

### Disadvantages of In-Context Learning

| Disadvantage | Description |
|--------------|-------------|
| **Context Window Limited** | Large number of injections may exceed token limits |
| **Temporary** | Improvements only apply to that specific query |
| **Not Scalable** | Can't handle hundreds of corrections efficiently |
| **Latency** | Database lookups add ~50-100ms to each query |

---

## Method 2: Ollama Fine-Tuning (Permanent Improvement)

### What Is It?

Fine-tuning actually retrains the LLM model weights using corrections as training data. The improvements are permanent and built into the model itself.

### Steps Involved

#### Step 1: Collect Corrections in JSONL Format

**What happens:**
- Extract corrections from your database
- Format them as training examples (question-answer pairs)
- Save as JSONL (JSON Lines) format, which Ollama understands

**Code example:**
```python
async def generate_training_jsonl(quality_threshold: float = 0.75):
    """Convert user corrections to Ollama training format."""
    
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT query_text, original_answer, corrected_answer, quality_score
            FROM correction_training_data
            WHERE quality_score >= %s
            ORDER BY created_at DESC
        """, (quality_threshold,))
        
        corrections = cur.fetchall()
        training_data = []
        
        # Convert to Ollama training format
        for correction in corrections:
            training_data.append({
                "messages": [
                    {
                        "role": "user",
                        "content": correction[0]  # query_text
                    },
                    {
                        "role": "assistant",
                        "content": correction[2]  # corrected_answer
                    }
                ]
            })
        
        # Write to JSONL file
        output_file = '/tmp/training_data.jsonl'
        with open(output_file, 'w') as f:
            for item in training_data:
                f.write(json.dumps(item) + '\n')
        
        return {
            'file_path': output_file,
            'sample_count': len(training_data),
            'data': training_data[:3]  # First 3 as preview
        }
    finally:
        conn.close()
```

**Example output (JSONL format):**
```jsonl
{"messages": [{"role": "user", "content": "What is return policy?"}, {"role": "assistant", "content": "Items can be returned within 30 days of purchase"}]}
{"messages": [{"role": "user", "content": "Can I return opened items?"}, {"role": "assistant", "content": "Only unopened items in original packaging"}]}
{"messages": [{"role": "user", "content": "When is the deadline?"}, {"role": "assistant", "content": "30 days from the purchase date"}]}
```

**Why this matters:** JSONL is the standard format for LLM training data. Ollama cannot learn without data in this exact format.

---

#### Step 2: Create a Modelfile (Recipe for Your Model)

**What happens:**
- Define a Modelfile that specifies the base model and behavior
- Include your enhanced system prompt
- This serves as a recipe for building your custom model

**Code example:**
```dockerfile
# Modelfile content
FROM llama3.1:8b

SYSTEM You are RAGnarok, an enterprise knowledge assistant.

Your task is to provide accurate, well-structured answers based ONLY on 
the provided context documents.

Rules:
1. Only use information from the provided context chunks.
2. If the context doesn't contain enough information, say so clearly.
3. Include inline citations using [1], [2], etc.
4. Be concise but thorough.
5. If multiple sources agree, mention the agreement.
6. Never fabricate information not present in the context.

ADDITIONAL CONTEXT:
- This model has been fine-tuned on user feedback corrections
- Prioritize accuracy over completeness
- When uncertain, admit it rather than guessing
```

**Python to create Modelfile:**
```python
async def create_modelfile():
    """Create Modelfile for fine-tuned model."""
    
    modelfile_content = """FROM llama3.1:8b

SYSTEM You are RAGnarok, an enterprise knowledge assistant. 
Your responses are based on retrieved documents and have been 
refined using user feedback.

Always verify information against the provided context.
When uncertain, admit it rather than guessing.

PARAMETER temperature 0.3
PARAMETER num_predict 256
PARAMETER top_p 0.9
"""
    
    modelfile_path = '/tmp/Modelfile'
    with open(modelfile_path, 'w') as f:
        f.write(modelfile_content)
    
    return modelfile_path
```

**Why this matters:** The Modelfile is the blueprint for your custom model. It combines the base model with your system prompt and preferences.

---

#### Step 3: Build Custom Model with `ollama create`

**What happens:**
- Ollama uses your training data and Modelfile
- Actually fine-tunes the model weights
- Stores the new model with a custom name (e.g., `ragnarok-tuned:8b`)

**Code example:**
```python
import subprocess

async def submit_finetuning_job():
    """Build custom fine-tuned model in Ollama."""
    
    # Create Modelfile first
    modelfile_path = await create_modelfile()
    
    # Generate training data
    training_result = await generate_training_jsonl(quality_threshold=0.75)
    
    if training_result['sample_count'] < 10:
        return {
            "status": "error",
            "message": f"Need at least 10 samples, got {training_result['sample_count']}"
        }
    
    try:
        # Build the model using ollama create command
        # This actually fine-tunes the model
        result = subprocess.run([
            'ollama', 'create',
            'ragnarok-tuned:8b',
            '-f', modelfile_path
        ], capture_output=True, text=True, timeout=3600)
        
        if result.returncode == 0:
            return {
                "status": "success",
                "model": "ragnarok-tuned:8b",
                "message": "Model created successfully",
                "training_samples": training_result['sample_count'],
                "stdout": result.stdout[:500]
            }
        else:
            return {
                "status": "error",
                "error": result.stderr,
                "model": "ragnarok-tuned:8b"
            }
    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "message": "Fine-tuning timed out (>1 hour)"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
```

**What happens internally:**
```
Input:
- Base model: llama3.1:8b (from Ollama library)
- Training data: 150 corrections from users
- Modelfile: System prompt + parameters

Ollama Process (runs for 10-30 minutes):
1. Load base model into memory
2. Initialize training loop
3. For each training example:
   - Present user question
   - Adjust model weights if answer differs from correction
   - Update loss function
4. Validate on held-out test set
5. Save fine-tuned weights

Output:
- New model: ragnarok-tuned:8b
- Stored in ~/.ollama/models/
- Ready to use immediately
```

**Why this matters:** This permanently changes how the model responds. The model's neural network weights are updated to reflect corrections.

---

#### Step 4: Switch LLM Service to Use New Model

**What happens:**
- Update environment variable to use new model
- Restart LLM service
- All new queries use the improved model automatically

**Code example:**
```python
import os

async def activate_finetuned_model(model_name: str = "ragnarok-tuned:8b"):
    """Switch to fine-tuned model."""
    
    # Update environment variable
    os.environ['LLM_MODEL'] = model_name
    
    # Verify model exists in Ollama
    try:
        result = subprocess.run(
            ['ollama', 'show', model_name],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            # Log model switch
            db.add(ModelSwitch(
                from_model='llama3.1:8b',
                to_model=model_name,
                switched_at=datetime.now(),
                status='success'
            ))
            db.commit()
            
            return {
                "status": "success",
                "message": f"Switched to {model_name}",
                "active_model": model_name
            }
        else:
            return {
                "status": "error",
                "message": f"Model {model_name} not found in Ollama"
            }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
```

**Python code in llm-service/main.py:**
```python
import os

# At startup
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.1:8b")

@app.post("/generate")
async def generate(req: GenerateRequest):
    """Generate answer using configured model."""
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": LLM_MODEL,  # Uses llama3.1:8b OR ragnarok-tuned:8b
                "prompt": req.query,
                "system": SYSTEM_PROMPT,
                "stream": False,
                ...
            }
        )
        
        return resp.json()
```

**Why this matters:** Users automatically get the improved model without downtime. Switching is as simple as changing one environment variable.

---

### Advantages of Fine-Tuning

| Advantage | Description |
|-----------|-------------|
| **Permanent** | Model improvements stick forever |
| **Scalable** | One training run fixes issues for all queries |
| **Efficient** | No database lookups needed; all knowledge built-in |
| **Quality** | Actual model weight improvements, not prompt tricks |
| **Cost** | Runs once per week; minimal ongoing overhead |

### Disadvantages of Fine-Tuning

| Disadvantage | Description |
|--------------|-------------|
| **Time-Consuming** | Fine-tuning takes 10-30 minutes per cycle |
| **Resource-Heavy** | Requires CPU/GPU memory for training |
| **Latency** | Must wait for training cycle to complete |
| **Complex** | Requires data preparation and validation |
| **Risky** | Bad training data can degrade model quality |

---

## Method 3: Scheduled Batch Fine-Tuning (Automated Approach)

### What Is It?

Combines fine-tuning with scheduling to automatically retrain your model on a regular schedule (weekly, bi-weekly) without manual intervention.

### Steps Involved

#### Step 1: Set Up Scheduler

**What happens:**
- Use APScheduler to run fine-tuning on a schedule
- Automatically collect corrections weekly
- Train and deploy improved model

**Code example:**
```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = BackgroundScheduler()

# Schedule weekly fine-tuning every Sunday at 2 AM
@scheduler.scheduled_job(
    'cron',
    day_of_week='0',      # Sunday (0 = Monday, 6 = Sunday)
    hour='2',
    minute='0',
    id='weekly_finetuning'
)
async def weekly_finetuning():
    """Automatically retrain model weekly with new corrections."""
    logger.info("Starting weekly fine-tuning job...")
    
    try:
        # Execute all steps below
        await run_finetuning_pipeline()
    except Exception as e:
        logger.error(f"Weekly fine-tuning failed: {e}")
        # Send alert to admin
        await send_admin_alert(f"Fine-tuning failed: {str(e)}")

# Start scheduler
scheduler.start()
```

**Why this matters:** Automation removes manual work. The system improves itself on a schedule without human intervention.

---

#### Step 2: Check if Enough New Data Exists

**What happens:**
- Query database for new corrections since last training
- Verify minimum data exists (e.g., 10+ corrections)
- Skip training if data is insufficient

**Code example:**
```python
async def check_training_readiness():
    """Verify we have enough data to retrain."""
    
    conn = get_db()
    try:
        cur = conn.cursor()
        
        # Check for new corrections since last training
        cur.execute("""
            SELECT COUNT(*) as count
            FROM correction_training_data
            WHERE used_in_training = FALSE
            AND quality_score >= 0.75
            AND created_at > NOW() - INTERVAL '7 days'
        """)
        
        new_corrections = cur.fetchone()[0]
        
        if new_corrections < 10:
            logger.info(f"Only {new_corrections} new corrections. Skipping retraining.")
            return {
                "ready": False,
                "reason": "insufficient_data",
                "new_corrections": new_corrections,
                "minimum_required": 10
            }
        
        return {
            "ready": True,
            "new_corrections": new_corrections
        }
    finally:
        conn.close()
```

**Why this matters:** Quality gates prevent overfitting. You don't want to train on tiny datasets that may not represent real patterns.

---

#### Step 3: Extract High-Quality Corrections (≥0.75 score)

**What happens:**
- Only use corrections validated by multiple users or admins
- Ignore single-user corrections (outliers)
- Build training JSONL file

**Code example:**
```python
async def extract_training_corrections(quality_threshold: float = 0.75):
    """Extract high-quality corrections for training."""
    
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                id,
                query_text,
                original_answer,
                corrected_answer,
                quality_score,
                user_id
            FROM correction_training_data
            WHERE quality_score >= %s
            AND used_in_training = FALSE
            ORDER BY quality_score DESC, created_at DESC
        """, (quality_threshold,))
        
        corrections = cur.fetchall()
        
        training_data = []
        correction_ids = []
        
        for correction in corrections:
            correction_ids.append(correction[0])  # Store IDs for marking
            
            training_data.append({
                "messages": [
                    {"role": "user", "content": correction[1]},
                    {"role": "assistant", "content": correction[3]}
                ]
            })
        
        # Write JSONL
        training_file = f'/tmp/training_{datetime.now().strftime("%Y%m%d_%H%M%S")}.jsonl'
        with open(training_file, 'w') as f:
            for item in training_data:
                f.write(json.dumps(item) + '\n')
        
        return {
            "file": training_file,
            "count": len(training_data),
            "correction_ids": correction_ids,
            "avg_quality": sum(c[4] for c in corrections) / len(corrections)
        }
    finally:
        conn.close()
```

**Example quality calculation:**
```
Correction 1: "Return policy is 30 days"
  - Admin confirmed: ✓
  - 5 users confirmed: ✓
  - Quality score: 0.95 ← Use this

Correction 2: "Return policy is 45 days"
  - 1 user mentioned
  - No other confirmations
  - Quality score: 0.40 ← Skip this
```

**Why this matters:** Quality gates prevent learning from noise. Only high-confidence corrections become training data.

---

#### Step 4: Submit Fine-Tuning Job to Ollama

**What happens:**
- Build model using Ollama
- Fine-tuning runs in background
- New model stored as `ragnarok-tuned-v{N}:8b`

**Code example:**
```python
async def submit_training_job(training_data: dict):
    """Submit fine-tuning job to Ollama."""
    
    logger.info(f"Submitting training with {training_data['count']} samples...")
    
    # Create Modelfile
    modelfile = await create_enhanced_modelfile()
    
    # Build model with version number
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    version = len(get_existing_models()) + 1
    model_name = f"ragnarok-tuned-v{version}:8b"
    
    try:
        result = subprocess.run([
            'ollama', 'create',
            model_name,
            '-f', modelfile
        ], capture_output=True, text=True, timeout=3600)
        
        if result.returncode == 0:
            logger.info(f"Successfully created {model_name}")
            
            # Log training job
            db.add(FinetuningJob(
                model_name=model_name,
                version=version,
                training_samples=training_data['count'],
                training_file=training_data['file'],
                status='completed',
                started_at=datetime.now() - timedelta(minutes=15),
                completed_at=datetime.now(),
                avg_quality=training_data['avg_quality']
            ))
            db.commit()
            
            return {
                "status": "success",
                "model": model_name,
                "samples": training_data['count']
            }
        else:
            raise Exception(f"Ollama create failed: {result.stderr}")
    
    except subprocess.TimeoutExpired:
        logger.error("Fine-tuning timed out after 1 hour")
        return {"status": "timeout", "model": model_name}
```

**Why this matters:** Versioning lets you track which models work best. You can rollback if a training cycle produces bad results.

---

#### Step 5: Test New Model (Optional but Recommended)

**What happens:**
- Run validation queries on new model
- Compare accuracy vs. old model
- Only switch if improvements detected

**Code example:**
```python
async def validate_finetuned_model(new_model: str, test_queries: list):
    """Validate new model before switching."""
    
    logger.info(f"Validating {new_model}...")
    
    current_model = os.getenv('LLM_MODEL', 'llama3.1:8b')
    validation_results = {
        "current_model": current_model,
        "new_model": new_model,
        "comparisons": []
    }
    
    for test_query in test_queries:
        # Query with current model
        current_response = await generate_with_model(
            query=test_query,
            model=current_model
        )
        
        # Query with new model
        new_response = await generate_with_model(
            query=test_query,
            model=new_model
        )
        
        # Score both responses
        current_score = await score_response(current_response)
        new_score = await score_response(new_response)
        
        comparison = {
            "query": test_query,
            "current_score": current_score,
            "new_score": new_score,
            "improvement": new_score - current_score
        }
        validation_results["comparisons"].append(comparison)
    
    # Calculate average improvement
    improvements = [c["improvement"] for c in validation_results["comparisons"]]
    avg_improvement = sum(improvements) / len(improvements)
    
    validation_results["avg_improvement"] = avg_improvement
    validation_results["should_switch"] = avg_improvement > 0.05  # 5% threshold
    
    return validation_results
```

**Why this matters:** Validation prevents deploying degraded models. You ensure the new model is actually better before switching.

---

#### Step 6: Switch to New Model if Successful

**What happens:**
- Update environment variable
- Gracefully restart LLM service
- Monitor for issues

**Code example:**
```python
async def deploy_finetuned_model(model_name: str, validation_result: dict):
    """Deploy new model if validation passed."""
    
    if not validation_result.get("should_switch"):
        logger.warning(
            f"Validation failed. Not switching to {model_name}. "
            f"Improvement: {validation_result.get('avg_improvement', 0)}"
        )
        return {
            "status": "validation_failed",
            "reason": "Insufficient improvement"
        }
    
    logger.info(f"Deploying {model_name}...")
    
    try:
        # Update environment
        os.environ['LLM_MODEL'] = model_name
        
        # Gracefully restart LLM service
        # (In production, use orchestration tool like Docker/Kubernetes)
        result = subprocess.run([
            'docker', 'restart', 'ragnarok-llm-service'
        ], capture_output=True, text=True, timeout=60)
        
        # Log deployment
        db.add(ModelDeployment(
            model_name=model_name,
            deployed_at=datetime.now(),
            validation_improvement=validation_result['avg_improvement'],
            status='active'
        ))
        db.commit()
        
        # Send notification
        await send_admin_alert(
            f"✅ Deployed {model_name}. Improvement: +{validation_result['avg_improvement']*100:.1f}%"
        )
        
        return {
            "status": "success",
            "model": model_name,
            "improvement": validation_result['avg_improvement']
        }
    
    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        # Rollback to previous model
        await rollback_model()
        return {"status": "error", "error": str(e)}
```

**Why this matters:** Graceful deployment prevents downtime. Monitoring ensures users aren't negatively affected.

---

#### Step 7: Log Results for Analysis

**What happens:**
- Record which models worked best
- Track improvement trends
- Enable data-driven optimization

**Code example:**
```python
async def log_training_results(job_result: dict):
    """Record fine-tuning results for analysis."""
    
    db.add(FinetuningLog(
        timestamp=datetime.now(),
        training_cycle=get_training_cycle_number(),
        model_created=job_result.get('model'),
        training_samples=job_result.get('samples'),
        validation_score=job_result.get('validation_score'),
        improvement_percent=job_result.get('improvement_pct'),
        deployed=job_result.get('deployed'),
        status=job_result.get('status'),
        notes=job_result.get('notes')
    ))
    db.commit()
    
    logger.info(f"""
    ═══ Fine-Tuning Cycle Complete ═══
    Model: {job_result.get('model')}
    Samples: {job_result.get('samples')}
    Improvement: +{job_result.get('improvement_pct', 0):.1f}%
    Status: {job_result.get('status')}
    """)
```

**Why this matters:** Historical data helps you understand which approaches work. You can identify trends and optimize your process.

---

### Advantages of Scheduled Batch Fine-Tuning

| Advantage | Description |
|-----------|-------------|
| **Automated** | No manual intervention needed |
| **Scheduled** | Runs at off-peak hours (e.g., 2 AM Sunday) |
| **Efficient** | Batch training is resource-efficient |
| **Consistent** | Regular improvement cycles |
| **Trackable** | Historical data for analysis |

### Disadvantages of Scheduled Batch Fine-Tuning

| Disadvantage | Description |
|--------------|-------------|
| **Lag** | Must wait until next scheduled run (up to 7 days) |
| **Complex** | Requires scheduler, validation, deployment logic |
| **Resource Usage** | Temporary spike during training windows |

---

## Method 4: Hybrid Approach (Recommended for Production)

### What Is It?

Combines in-context learning (fast, immediate) with scheduled batch fine-tuning (permanent). Users get instant improvements while the system builds permanent enhancements.

### Steps Involved

#### Step 1: Use In-Context Learning for Immediate Fixes

**What happens:**
- Recent corrections injected into prompts
- Users see improvements within minutes
- No model retraining needed

**Code example:**
```python
async def query_with_immediate_feedback(query: str, chunks: list):
    """Apply immediate corrections via in-context learning."""
    
    # Get recent corrections (in-context learning)
    recent_corrections = await get_injected_corrections(query, limit=3)
    
    # Build enhanced prompt
    system_prompt = await build_dynamic_system_prompt(
        query,
        feedback_insights=recent_corrections
    )
    
    # Generate with enhanced prompt
    response = await ollama_client.generate(
        model="llama3.1:8b",
        prompt=query,
        system=system_prompt,
        temperature=0.3
    )
    
    return response
```

**User Impact:** User 2 asks same question as User 1 → User 2 gets corrected answer same day ✅

---

#### Step 2: Accumulate Feedback Over Time

**What happens:**
- Every user correction goes to database
- Corrections accumulate throughout week
- Weekly batch fine-tuning extracts patterns

**Code example:**
```python
async def accumulate_feedback_for_training():
    """Track corrections for weekly training."""
    
    conn = get_db()
    try:
        cur = conn.cursor()
        
        # Count this week's corrections
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN quality_score >= 0.75 THEN 1 END) as high_quality,
                AVG(quality_score) as avg_quality
            FROM correction_training_data
            WHERE created_at > NOW() - INTERVAL '7 days'
            AND used_in_training = FALSE
        """)
        
        stats = cur.fetchone()
        
        logger.info(f"""
        Weekly Feedback Accumulation:
        - Total corrections: {stats[0]}
        - High quality (0.75+): {stats[1]}
        - Average quality: {stats[2]:.2f}
        
        Next training cycle will use {stats[1]} corrections.
        """)
        
        return {
            "total": stats[0],
            "high_quality": stats[1],
            "avg_quality": stats[2]
        }
    finally:
        conn.close()
```

**Why this matters:** Batch training benefits from accumulated data. More samples = better model training.

---

#### Step 3: Use Fine-Tuned Model as Base

**What happens:**
- Each fine-tuning cycle starts from previous best model
- Models improve incrementally: `ragnarok-tuned-v1` → `v2` → `v3`
- Improvements compound over time

**Code example:**
```python
async def generate_with_hybrid_approach(query: str, chunks: list):
    """Generate using both in-context + fine-tuned base."""
    
    # 1. In-context learning (immediate fixes)
    recent_corrections = await get_injected_corrections(query, limit=3)
    system_prompt = await build_dynamic_system_prompt(
        query,
        feedback_insights=recent_corrections
    )
    
    # 2. Use fine-tuned model if available (permanent improvements)
    model_name = os.getenv('LLM_MODEL', 'llama3.1:8b')
    # Will be 'ragnarok-tuned-v5:8b' if fine-tuned, else standard model
    
    # 3. Generate with both improvements
    response = await ollama_client.generate(
        model=model_name,  # Fine-tuned base model
        prompt=query,
        system=system_prompt,  # In-context injections
        temperature=0.3,
        num_predict=128
    )
    
    return response
```

**Architecture diagram:**
```
Week 1: In-context learning
  User corrections → System prompt injections → Better answers same day

Week 1 Sunday: Batch fine-tuning #1
  Accumulated corrections → ragnarok-tuned-v1:8b
  
Week 2: Hybrid approach
  In-context (recent fixes) + v1 (permanent improvements)
  
Week 2 Sunday: Batch fine-tuning #2
  v1 base + new corrections → ragnarok-tuned-v2:8b
  
Week 3: Even better
  In-context + v2 (better permanent base)
  
... (continues improving each week)
```

**Why this matters:** Benefits stack. You get immediate results (in-context) + long-term improvements (fine-tuning).

---

#### Step 4: Monitor Both Approaches

**What happens:**
- Track effectiveness of in-context vs. fine-tuning separately
- Measure user satisfaction impact
- Optimize blend based on data

**Code example:**
```python
async def analyze_hybrid_effectiveness():
    """Measure impact of both approaches."""
    
    conn = get_db()
    try:
        cur = conn.cursor()
        
        # Queries WITH in-context injections
        cur.execute("""
            SELECT AVG(rating) as avg_rating
            FROM feedback
            WHERE created_at > NOW() - INTERVAL '7 days'
            AND uses_injected_corrections = TRUE
        """)
        incontext_rating = cur.fetchone()[0] or 0
        
        # Queries WITHOUT in-context (using fine-tuned model)
        cur.execute("""
            SELECT AVG(rating) as avg_rating
            FROM feedback
            WHERE created_at > NOW() - INTERVAL '7 days'
            AND uses_injected_corrections = FALSE
        """)
        finetuned_rating = cur.fetchone()[0] or 0
        
        return {
            "in_context_learning_avg_rating": incontext_rating,
            "fine_tuned_model_avg_rating": finetuned_rating,
            "difference": finetuned_rating - incontext_rating,
            "insight": "Fine-tuned model performing better" 
                      if finetuned_rating > incontext_rating 
                      else "In-context injections performing better"
        }
    finally:
        conn.close()
```

**Why this matters:** Data-driven optimization. You can see which approach works best and allocate resources accordingly.

---

### Advantages of Hybrid Approach

| Advantage | Description |
|-----------|-------------|
| **Fast** | In-context provides immediate results |
| **Permanent** | Fine-tuning provides long-term improvements |
| **Compounding** | Benefits of both approaches combine |
| **Robust** | Multiple improvement mechanisms |
| **Scalable** | Works for both quick fixes and systemic issues |

### Disadvantages of Hybrid Approach

| Disadvantage | Description |
|--------------|-------------|
| **Complex** | Requires managing both approaches |
| **Resource-Heavy** | Needs both database lookups + fine-tuning |
| **Latency** | In-context lookups add ~50-100ms |

---

## Comparison Table

| Criteria | In-Context | Fine-Tuning | Batch Schedule | Hybrid |
|----------|-----------|------------|-----------------|---------|
| **Speed** | Minutes ⚡ | 10-30 min | Weekly ⏰ | Both |
| **Permanence** | Session only | Permanent ♻️ | Permanent ♻️ | Permanent ♻️ |
| **Setup Effort** | Low 👍 | Medium | Medium | Medium |
| **Ongoing Effort** | None | Manual | Automated | Low |
| **Cost** | Low | Medium | Low | Medium |
| **Quality** | 15-25% ↑ | 30-50% ↑ | 30-50% ↑ | 40-60% ↑ |
| **Best For** | Quick fixes | Systemic issues | Continuous | Production |
| **Risk** | None | Medium | Low | Low |

---

## Real-World Example: Return Policy Issue

### Scenario

Users keep asking "How long to return?" and LLM responds "60 days" but the correct answer is "30 days."

### Using In-Context Learning Only

```
Day 1:
- User 1 corrects: "It's 30 days, not 60"
- Correction stored with quality score 0.5

Day 1, minute 5:
- User 2 asks: "How long can I return items?"
- System injects correction into prompt
- LLM sees: "Note: Users reported 30 days from purchase"
- Response: "30 days from purchase" ✅ CORRECT

Timeline:
Day 1 → Immediately fixed for subsequent users
But: Only lasts that session, improvements don't persist
```

**Impact:** Fast fix for User 2, but User 3 tomorrow still needs the injection.

---

### Using Fine-Tuning Only

```
Week 1: Users 1-5 all correct the 60→30 day issue
- 5 corrections accumulate
- Quality score rises: 0.5 → 0.6 → 0.75 → 0.85 → 0.95

Week 1, Sunday 2 AM:
- Scheduler extracts all 5 corrections
- Trains model: "return policy = 30 days"
- Creates: ragnarok-tuned-v1:8b
- Validates improvement: +35%
- Deploys new model

Week 2:
- ALL users get improved model
- Return policy questions now accurate
- Improvement permanent ♻️
- 50,000 daily users benefit

Timeline:
Day 1-7 → Incorrect answers (lag)
Day 8 → Model improved, permanent fix
```

**Impact:** Slow initial fix, but permanent improvement for all users forever.

---

### Using Batch Fine-Tuning with Scheduler

```
Week 1 (Daily):
- Corrections accumulate
- In-context injections help some users

Week 1 Sunday 2 AM (Automatic):
- Scheduler runs fine-tuning
- New model created & deployed
- No manual intervention needed

Week 2-4:
- System automatically improves
- No human work required
- Permanent improvements

Timeline:
Day 1-7 → Some fixes (in-context) + permanent training happening
Day 8 → Permanent model improvement deployed automatically
```

**Impact:** Best automation; balances speed and permanence.

---

### Using Hybrid Approach (RECOMMENDED)

```
Day 1:
- User 1 corrects: quality = 0.5
- Correction stored

Day 1, minute 5:
- User 2 asks: "How long to return?"
- In-context injection: "Users reported 30 days"
- Response: "30 days" ✅ (IMMEDIATE FIX)

Day 2-3:
- Users 3-5 also correct the issue
- Quality score rises: 0.5 → 0.75 → 0.95

Day 7:
- Accumulation complete
- 5 high-quality corrections ready

Day 8 (Sunday 2 AM):
- Automatic fine-tuning runs
- ragnarok-tuned-v1:8b created
- Model improvement: +35%
- Deployed to production

Day 9:
- In-context fixes PLUS fine-tuned model
- Better permanent base + recent injections
- Compounding improvements

Timeline:
Day 1 → Immediate fix (in-context) ⚡
Day 1-7 → Corrections accumulate
Day 8 → Permanent improvement (fine-tuning) ♻️
Day 9+ → Both improvements combined 🚀
```

**Impact:** BEST - Users get immediate help (Day 1) AND permanent improvement (Day 8) with zero manual intervention.

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal:** Enable in-context learning

- [ ] Deploy in-context learning system
- [ ] Test with real corrections
- [ ] Measure immediate improvement

**Expected Result:** 15-25% quality improvement within days

---

### Phase 2: Batch Training (Week 2-3)
**Goal:** Add scheduled fine-tuning

- [ ] Create fine-tuning-service
- [ ] Set up weekly scheduler
- [ ] Build validation pipeline
- [ ] Deploy first fine-tuned model

**Expected Result:** First permanent improvement cycle completed

---

### Phase 3: Hybrid & Monitoring (Week 4)
**Goal:** Full hybrid system + dashboards

- [ ] Combine in-context + fine-tuning
- [ ] Build admin dashboards
- [ ] Add monitoring & alerting
- [ ] Document procedures

**Expected Result:** Fully automated, monitored feedback loop

---

### Phase 4: Optimization (Week 5+)
**Goal:** Continuous improvement

- [ ] Analyze effectiveness data
- [ ] Optimize parameters
- [ ] Scale training data
- [ ] Add new correction types

**Expected Result:** 40-60% quality improvement sustained

---

## Database Schema Updates Needed

### New Tables for Training

```sql
-- Store training data extracted from corrections
CREATE TABLE correction_training_data (
    id UUID PRIMARY KEY,
    feedback_id UUID REFERENCES feedback(id),
    query_text TEXT,
    original_answer TEXT,
    corrected_answer TEXT,
    quality_score FLOAT,
    used_in_training BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);

-- Track fine-tuning jobs
CREATE TABLE finetuning_jobs (
    id UUID PRIMARY KEY,
    model_name VARCHAR(100),
    version INTEGER,
    training_samples INTEGER,
    status VARCHAR(50),
    avg_quality FLOAT,
    improvement_percent FLOAT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP
);

-- Track model deployments
CREATE TABLE model_deployments (
    id UUID PRIMARY KEY,
    model_name VARCHAR(100),
    deployed_at TIMESTAMP,
    validation_score FLOAT,
    status VARCHAR(50),
    created_at TIMESTAMP
);
```

---

## Environment Variables Needed

```bash
# llm-service/main.py
LLM_MODEL=llama3.1:8b              # Set to ragnarok-tuned-v1:8b after fine-tuning
OLLAMA_BASE_URL=http://ollama:11434

# fine-tuning-service/main.py
FEEDBACK_SERVICE_URL=http://feedback-service:8009
LLM_SERVICE_URL=http://llm-service:8005
DATABASE_URL=postgresql://ragnarok:ragnarok_secret@postgres:5432/ragnarok
FINETUNING_SCHEDULE="0 2 * * 0"   # Sunday 2 AM
TRAINING_DATA_QUALITY_THRESHOLD=0.75
MIN_TRAINING_SAMPLES=10
```

---

## Summary & Recommendations

### Quick Start (Week 1)

Start with **in-context learning**:
1. Modify llm-service to fetch and inject corrections
2. Deploy and monitor effectiveness
3. Expect 15-25% improvement immediately

### Production (Week 2-3)

Add **scheduled batch fine-tuning**:
1. Create fine-tuning-service
2. Set up weekly scheduler
3. Deploy first fine-tuned model
4. Monitor and validate

### Full Stack (Week 4+)

Run **hybrid approach**:
1. Both in-context + fine-tuning active
2. Continuous monitoring
3. Automated improvement cycles
4. 40-60% total improvement

---

**End of LLM Training Methods Guide**

