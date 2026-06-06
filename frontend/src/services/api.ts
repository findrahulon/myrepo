import keycloak from './keycloak';
import type { AuditLog, AuditStats, Escalation, FeedbackStats, QueryResponse, Document, ServiceHealthReport, URLIngestResponse } from '../types';

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
  const documentWindow = window.open('', '_blank');
  
  if (documentWindow) {
    try {
      documentWindow.document.write(`
        <html>
          <head>
            <title>Loading Document...</title>
            <style>
              body {
                margin: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background-color: #0f172a;
                color: #e2e8f0;
                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              }
              .loader {
                border: 3px solid #334155;
                border-top: 3px solid #3b82f6;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                animation: spin 1s linear infinite;
                margin-bottom: 12px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="loader"></div>
            <div>Loading document...</div>
          </body>
        </html>
      `);
      documentWindow.document.close();
    } catch (e) {
      // Ignore errors if document writing is restricted
    }
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/documents/${documentId}/download`, { headers });
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    const sourceUrl = response.headers.get('X-Source-URL');
    if (sourceUrl) {
      if (documentWindow && !documentWindow.closed) {
        try {
          documentWindow.opener = null;
        } catch (e) {}
        documentWindow.location.href = sourceUrl;
      } else {
        const newWin = window.open(sourceUrl, '_blank');
        if (newWin) {
          try {
            newWin.opener = null;
          } catch (e) {}
        }
      }
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    if (documentWindow && !documentWindow.closed) {
      try {
        documentWindow.opener = null;
      } catch (e) {
        // Ignore if read-only
      }
      documentWindow.location.href = url;
    } else {
      const newWin = window.open(url, '_blank');
      if (newWin) {
        try {
          newWin.opener = null;
        } catch (e) {
          // Ignore
        }
      }
    }
    
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (documentWindow && !documentWindow.closed) {
      documentWindow.close();
    }
    throw err;
  }
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

export async function ingestURL(
  url: string,
  department = 'general',
  accessLevel = 'basic'
): Promise<URLIngestResponse['data']> {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE}/ingest-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url,
      department,
      access_level: accessLevel,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ingestion failed: ${response.statusText} - ${errorText}`);
  }
  const data: URLIngestResponse = await response.json();
  return data.data;
}
