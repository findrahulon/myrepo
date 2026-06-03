import keycloak from './keycloak';
import type { QueryResponse, Document } from '../types';

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
