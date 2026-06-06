import keycloak from './keycloak';
import type { AuditLog, AuditStats, Escalation, FeedbackStats, QueryResponse, Document, ServiceHealthReport } from '../types';

const API_BASE = '/api/v1';

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (keycloak.token) {
    // Refresh token if it expires within 30 seconds
    try {
      await keycloak.updateToken(30);
    } catch {
      // Token refresh failed; continue with existing token
    }
    headers['Authorization'] = `Bearer ${keycloak.token}`;
  }
  return headers;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (keycloak.token) {
    try {
      await keycloak.updateToken(30);
    } catch {
      // Token refresh failed; continue with existing token
    }
    headers['Authorization'] = `Bearer ${keycloak.token}`;
  }
  return headers;
}

export async function sendQuery(query: string): Promise<QueryResponse> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`Query failed: ${response.statusText}`);
  }
  return response.json();
}

export async function uploadDocument(
  file: File,
  department: string = 'general',
  accessLevel: string = 'basic'
): Promise<{ document_id: string; filename: string; chunks_created: number }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('department', department);
  formData.append('access_level', accessLevel);

  const authHeaders: Record<string, string> = {};
  if (keycloak.token) {
    try {
      await keycloak.updateToken(30);
    } catch {
      // continue
    }
    authHeaders['Authorization'] = `Bearer ${keycloak.token}`;
  }

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: authHeaders,
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }
  const data = await response.json();
  return data.data;
}

export async function listDocuments(): Promise<Document[]> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/documents`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to list documents: ${response.statusText}`);
  }
  const data = await response.json();
  return data.documents || [];
}

export async function viewDocument(documentId: string): Promise<void> {
  const documentWindow = window.open('', '_blank', 'noopener,noreferrer');
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/documents/${documentId}/download`, { headers });
  if (!response.ok) {
    documentWindow?.close();
    throw new Error(`Failed to open document: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (documentWindow) {
    documentWindow.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function submitFeedback(
  queryId: string | undefined,
  queryText: string | undefined,
  rating: number,
  comment?: string,
  correction?: string
): Promise<void> {
  const headers = await getHeaders();
  await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query_id: queryId,
      query_text: queryText,
      rating,
      comment,
      correction,
    }),
  });
}

export async function requestEscalation(queryId: string, reason?: string): Promise<void> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/escalations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query_id: queryId, reason }),
  });
  if (!response.ok) {
    throw new Error(`Escalation failed: ${response.statusText}`);
  }
}

export async function getAuditStats(): Promise<AuditStats> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/logs/stats`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to load audit stats: ${response.statusText}`);
  }
  return response.json();
}

export async function getAuditLogs(limit = 50): Promise<AuditLog[]> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/logs?limit=${limit}`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to load audit logs: ${response.statusText}`);
  }
  const data = await response.json();
  return data.logs || [];
}

export async function getEscalations(status = 'PENDING'): Promise<Escalation[]> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/escalations?status=${status}`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to load escalations: ${response.statusText}`);
  }
  const data = await response.json();
  return data.escalations || [];
}

export async function resolveEscalation(queryId: string, resolution = 'Reviewed by admin'): Promise<void> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/escalations/${queryId}/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ resolution }),
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve escalation: ${response.statusText}`);
  }
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/feedback/stats`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to load feedback stats: ${response.statusText}`);
  }
  return response.json();
}

export async function getServicesHealth(): Promise<ServiceHealthReport> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/services/health`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to load service health: ${response.statusText}`);
  }
  return response.json();
}
