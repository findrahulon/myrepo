export interface Citation {
  index: number;
  document_id: string;
  doc_title: string;
  section: string;
  page: number;
  chunk_index: number;
  relevance_score: number;
  snippet: string;
}

export interface ConfidenceBreakdown {
  retrieval_relevance: number;
  context_coverage: number;
  answer_coherence: number;
  source_agreement: number;
}

export interface Confidence {
  overall: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: ConfidenceBreakdown;
}

export interface Explanation {
  summary: string;
  reasoning_steps: string[];
  sources_analyzed: number;
  chunks_used: number;
  avg_relevance: number;
  model_used: string;
}

export interface QueryResponse {
  status: string;
  data: {
    answer: string;
    citations: Citation[];
    confidence: Confidence;
    explanation: Explanation;
  };
  meta: {
    request_id: string;
    latency_ms: number;
    model_used: string;
  };
}

export interface Document {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  department: string;
  access_level: string;
  uploaded_by: string;
  chunk_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Citation[];
  confidence?: Confidence;
  explanation?: Explanation;
  meta?: {
    request_id: string;
    latency_ms: number;
    model_used: string;
  };
}

export interface AuditStats {
  total_queries: number;
  avg_latency_ms: number;
  avg_confidence: number;
  confidence_distribution: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  escalations: {
    PENDING: number;
    RESOLVED: number;
  };
}

export interface AuditLog {
  id: string;
  username?: string;
  query_text: string;
  response_text: string;
  confidence_score?: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  latency_ms?: number;
  model_used?: string;
  escalation_status?: 'NONE' | 'PENDING' | 'RESOLVED';
  created_at?: string;
}

export interface Escalation {
  id: string;
  username?: string;
  query_text: string;
  response_text: string;
  confidence_score?: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  reason?: string;
  requested_by?: string;
  escalated_at?: string;
  resolved_at?: string;
  resolution?: string;
}

export interface FeedbackStats {
  total_feedback: number;
  avg_rating: number;
  positive: number;
  negative: number;
  corrections: number;
  worst_queries: Array<{
    query_text: string;
    feedback_count: number;
    avg_rating: number;
    first_seen?: string;
    last_seen?: string;
  }>;
  satisfaction_trend: Array<{
    date?: string;
    feedback_count: number;
    avg_rating: number;
  }>;
}
