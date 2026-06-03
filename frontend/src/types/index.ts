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
