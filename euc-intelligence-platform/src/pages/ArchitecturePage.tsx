import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/Card'
import { Badge } from '../components/Badge'
import {
  Layers,
  GitBranch,
  Cpu,
  Database,
  Zap,
  Network,
  ArrowDown,
  CheckCircle2,
} from 'lucide-react'

const pipelineSteps = [
  {
    name: 'Upload & Fingerprint',
    description: 'Accept workbooks, compute content hash for change detection. Skip re-processing unchanged files.',
    tech: ['openpyxl', 'hashlib', 'MinIO/S3'],
    icon: Layers,
  },
  {
    name: 'Deep Parsing & AST Extraction',
    description: 'Parse every sheet: extract formulas into ASTs, detect patterns (VLOOKUP chains, circular refs, volatile functions). Extract VBA module source.',
    tech: ['openpyxl', 'formulas (AST lib)', 'oletools'],
    icon: GitBranch,
  },
  {
    name: 'Tiered AI Summarization',
    description: 'Bottom-up: sheet-level summaries → workbook-level synthesis → portfolio-level narrative. Each tier builds on the previous for accuracy.',
    tech: ['GPT-4 / Claude', 'Structured output', 'JSON schema'],
    icon: Cpu,
  },
  {
    name: 'Hybrid Embedding Generation',
    description: 'Generate two embedding types: (1) Semantic — from AI summaries and cell content, (2) Structural — from formula AST fingerprints and sheet topology.',
    tech: ['BGE-large-en-v1.5', 'Custom structural encoder', 'FAISS'],
    icon: Database,
  },
  {
    name: 'Multi-Signal Similarity',
    description: 'Combine semantic similarity (cosine), structural similarity (Jaccard on AST patterns), and data-flow overlap into a unified score.',
    tech: ['FAISS', 'scipy', 'Custom weighted scorer'],
    icon: Network,
  },
  {
    name: 'Lineage & Dependency Graph',
    description: 'Build a directed graph of data flows: which cells reference which sheets/workbooks. Enables impact analysis and true dependency mapping.',
    tech: ['NetworkX', 'pgvector', 'Neo4j (optional)'],
    icon: GitBranch,
  },
  {
    name: 'Roadmap Generation',
    description: 'AI generates migration recommendations based on complexity score, overlap groups, formula risk, and target architecture patterns.',
    tech: ['GPT-4 / Claude', 'Rule engine', 'Template library'],
    icon: Zap,
  },
]

const architectureDecisions = [
  {
    decision: 'Non-Agentic Deterministic Pipeline',
    rationale: 'Predictable, auditable, debuggable. Each stage has defined inputs/outputs. No autonomous decision-making — AI is invoked at fixed points.',
    alternative: 'Agentic approach would add flexibility but reduce reproducibility and auditability — not suitable for regulated environments.',
  },
  {
    decision: 'Formula AST Analysis (not just text matching)',
    rationale: 'Text similarity misses that SUM(A1:A10) and SUM(B1:B10) are structurally identical. AST parsing captures formula logic independent of cell references.',
    alternative: 'Simple regex/text matching would miss structural equivalence; pure AI analysis would be expensive and inconsistent.',
  },
  {
    decision: 'Tiered Bottom-Up Summarization',
    rationale: 'Single-pass workbook summarization hallucinates. Bottom-up (sheet → workbook → portfolio) grounds each level in concrete data from the level below.',
    alternative: 'Single-pass is faster but less accurate. Top-down misses sheet-level nuance.',
  },
  {
    decision: 'Hybrid Similarity (Structural + Semantic)',
    rationale: 'Semantic similarity alone groups "risk reports" together even if they calculate completely different things. Structural similarity catches formula-level duplication.',
    alternative: 'Pure embedding similarity has ~60% precision for true functional overlap. Hybrid approach reaches ~85%.',
  },
  {
    decision: 'Fingerprint-Based Incremental Processing',
    rationale: 'Enterprise EUC portfolios have 100+ workbooks. Re-analyzing everything on each upload is wasteful. Content hashing enables incremental updates.',
    alternative: 'Full re-processing is simpler but O(n) cost per upload vs O(1) for unchanged files.',
  },
  {
    decision: 'Data Lineage Graph',
    rationale: 'External links and cross-sheet references create hidden dependencies. A graph model enables "impact of change" analysis and true consolidation planning.',
    alternative: 'Flat overlap detection misses transitive dependencies (A → B → C). Graph captures the full chain.',
  },
]

const techStack = [
  {
    layer: 'Frontend',
    choices: [
      { name: 'React + TypeScript', reason: 'Component reuse, type safety, enterprise standard' },
      { name: 'Tailwind CSS', reason: 'Utility-first, consistent design tokens, fast iteration' },
      { name: 'Recharts', reason: 'Lightweight charting for complexity/similarity visualizations' },
      { name: 'React Router', reason: 'SPA navigation without full page reloads' },
    ],
  },
  {
    layer: 'Backend',
    choices: [
      { name: 'FastAPI (Python)', reason: 'Async, auto-docs, Pydantic validation, ML ecosystem access' },
      { name: 'Celery + Redis', reason: 'Background task queue for long-running workbook analysis' },
      { name: 'PostgreSQL', reason: 'Relational data (workbook metadata, audit) + pgvector for embeddings' },
      { name: 'MinIO / S3', reason: 'Object storage for uploaded workbooks and extracted artifacts' },
    ],
  },
  {
    layer: 'AI / ML',
    choices: [
      { name: 'GPT-4 / Claude (pluggable)', reason: 'Best-in-class summarization; provider-agnostic interface' },
      { name: 'BGE-large-en-v1.5', reason: 'High-quality embeddings, runs locally, no API dependency' },
      { name: 'FAISS', reason: 'Fast similarity search at scale (1000+ workbooks)' },
      { name: 'formulas (Python lib)', reason: 'Excel formula → AST parsing for structural analysis' },
    ],
  },
  {
    layer: 'Infrastructure',
    choices: [
      { name: 'Docker Compose', reason: 'Single-command local development setup' },
      { name: 'Kubernetes (prod)', reason: 'Horizontal scaling for parallel workbook processing' },
      { name: 'Prometheus + Grafana', reason: 'Pipeline observability and processing metrics' },
    ],
  },
]

export function ArchitecturePage() {
  return (
    <div>
      <PageHeader
        title="System Architecture"
        description="Recommended architecture, technology decisions, and processing pipeline design for the EUC Intelligence Platform."
      />

      <Card className="mb-6">
        <CardHeader
          title="Design Philosophy"
          subtitle="Key principles guiding the architecture"
        />
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              title: 'Deterministic & Auditable',
              desc: 'Every AI invocation has defined inputs/outputs. Results are reproducible. Full audit trail for regulated environments.',
            },
            {
              title: 'Incremental & Scalable',
              desc: 'Process only what changed. Fingerprint-based caching. Horizontally scalable pipeline stages for 1000+ workbook portfolios.',
            },
            {
              title: 'Pluggable AI Layer',
              desc: 'Provider-agnostic AI interface. Swap GPT ↔ Claude ↔ local models without pipeline changes. Structured output schemas enforce consistency.',
            },
          ].map((p) => (
            <div key={p.title} className="p-4 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-semibold mb-1">{p.title}</h4>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Processing Pipeline"
          subtitle="Deterministic workflow — AI invoked at predefined stages"
        />
        <div className="space-y-0">
          {pipelineSteps.map((step, i) => (
            <div key={step.name}>
              <div className="flex items-start gap-4 p-4 border border-[var(--color-border)] rounded-lg">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <step.icon size={16} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      Stage {i + 1}
                    </span>
                    <h4 className="text-sm font-semibold">{step.name}</h4>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-2">
                    {step.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {step.tech.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 rounded font-mono text-slate-600">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {i < pipelineSteps.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown size={16} className="text-slate-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Key Architecture Decisions"
          subtitle="Why this approach — and what alternatives were considered"
        />
        <div className="space-y-3">
          {architectureDecisions.map((ad) => (
            <div key={ad.decision} className="p-4 border border-[var(--color-border)] rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <h4 className="text-sm font-semibold">{ad.decision}</h4>
              </div>
              <p className="text-xs text-[var(--color-text)] leading-relaxed mb-1.5">
                {ad.rationale}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] italic">
                Alternative considered: {ad.alternative}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Technology Stack" subtitle="Recommended tools and libraries per layer" />
        <div className="space-y-4">
          {techStack.map((layer) => (
            <div key={layer.layer}>
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                {layer.layer}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {layer.choices.map((choice) => (
                  <div key={choice.name} className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                    <Badge variant="info">{choice.name}</Badge>
                    <span className="text-xs text-[var(--color-text-muted)]">{choice.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
