import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  ExpandLess,
  ExpandMore,
  Refresh,
  TaskAlt,
  TrendingDown,
  TrendingFlat,
  TrendingUp,
  Warning,
  WifiOff,
} from '@mui/icons-material';
import {
  getAuditLogs,
  getAuditStats,
  getEscalations,
  getFeedbackStats,
  getServicesHealth,
  resolveEscalation,
  getServiceLogs,
} from '../services/api';
import type {
  AuditLog,
  AuditStats,
  Escalation,
  FeedbackStats,
  ServiceHealth,
  ServiceHealthReport,
} from '../types';

const percent = (value: number) => `${Math.round(value * 100)}%`;

// ─── Satisfaction Trend Sparkline (pure SVG) ──────────────────────────────
interface TrendPoint { date?: string; feedback_count: number; avg_rating: number; }

const SatisfactionSparkline: React.FC<{ data: TrendPoint[] }> = ({ data }) => {
  if (!data.length) return <Typography variant="body2" color="text.secondary">No trend data yet.</Typography>;
  const sorted = [...data].reverse();
  const W = 100; const H = 48; const barW = Math.max(2, (W / sorted.length) - 1);
  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {[1, 2, 3, 4].map((r) => (
          <line key={r} x1={0} x2={W} y1={H - (r / 5) * H} y2={H - (r / 5) * H} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
        ))}
        {sorted.map((pt, i) => {
          const x = i * (W / sorted.length);
          const barH = (pt.avg_rating / 5) * H;
          const color = pt.avg_rating >= 4 ? '#4caf50' : pt.avg_rating >= 3 ? '#ff9800' : '#f44336';
          return (
            <Tooltip key={i} title={`${pt.date ?? ''}: ${pt.avg_rating.toFixed(1)}/5 (${pt.feedback_count} reviews)`}>
              <rect x={x + 0.5} y={H - barH} width={barW} height={barH} fill={color} rx={1} />
            </Tooltip>
          );
        })}
      </svg>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" color="text.disabled">{sorted[0]?.date ?? ''}</Typography>
        <Typography variant="caption" color="text.disabled">{sorted[sorted.length - 1]?.date ?? ''}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.75, flexWrap: 'wrap' }}>
        {[{ label: '≥ 4/5', color: '#4caf50' }, { label: '3–4/5', color: '#ff9800' }, { label: '< 3/5', color: '#f44336' }].map(({ label, color }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ─── Latency Bands ────────────────────────────────────────────────────────
const LatencyBands: React.FC<{ logs: AuditLog[] }> = ({ logs }) => {
  if (!logs.length) return null;
  const lat = logs.map(l => l.latency_ms ?? 0);
  const total = lat.length;
  const bands = [
    { label: '< 1 s (fast)', count: lat.filter(ms => ms < 1000).length, color: 'success' as const },
    { label: '1–5 s (normal)', count: lat.filter(ms => ms >= 1000 && ms < 5000).length, color: 'warning' as const },
    { label: '> 5 s (slow)', count: lat.filter(ms => ms >= 5000).length, color: 'error' as const },
  ];
  return (
    <Box>
      {bands.map(({ label, count, color }) => (
        <Box key={label} sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption">{label}</Typography>
            <Typography variant="caption">{count}</Typography>
          </Box>
          <LinearProgress variant="determinate" value={(count / total) * 100} color={color} />
        </Box>
      ))}
    </Box>
  );
};

// ─── Expandable Log Row ───────────────────────────────────────────────────
const LogRow: React.FC<{ log: AuditLog }> = ({ log }) => {
  const [open, setOpen] = useState(false);
  const confidencePct = log.confidence_score ? percent(log.confidence_score) : log.confidence_level ?? '—';
  const statusColor = log.escalation_status === 'PENDING' ? 'warning' as const : log.escalation_status === 'RESOLVED' ? 'success' as const : 'default' as const;
  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <TableCell sx={{ pr: 0, width: 32 }}>
          <IconButton size="small">{open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}</IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{log.query_text}</Typography>
          {log.created_at && <Typography variant="caption" color="text.disabled">{new Date(log.created_at).toLocaleString()}</Typography>}
        </TableCell>
        <TableCell>
          <Chip label={confidencePct} size="small" color={log.confidence_level === 'HIGH' ? 'success' : log.confidence_level === 'MEDIUM' ? 'warning' : 'error'} variant="outlined" />
        </TableCell>
        <TableCell>{log.latency_ms != null ? `${log.latency_ms} ms` : '—'}</TableCell>
        <TableCell><Chip label={log.escalation_status ?? 'NONE'} size="small" color={statusColor} variant="outlined" /></TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ m: 1, p: 1.5, bgcolor: 'background.default', borderRadius: 1, borderLeft: '3px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Response</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', color: 'text.secondary' }}>{log.response_text || 'No response stored.'}</Typography>
              {log.model_used && <Box sx={{ mt: 1 }}><Chip label={`Model: ${log.model_used}`} size="small" variant="outlined" /></Box>}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ─── Trend Icon ───────────────────────────────────────────────────────────
const TrendIcon: React.FC<{ trend: number }> = ({ trend }) =>
  trend > 0.1 ? <TrendingUp fontSize="small" color="success" /> :
  trend < -0.1 ? <TrendingDown fontSize="small" color="error" /> :
  <TrendingFlat fontSize="small" color="disabled" />;

// ─── Service Health Card ──────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  Core: '#7c4dff', ML: '#0288d1', Processing: '#00897b',
  Storage: '#f57c00', Data: '#6d4c41', Auth: '#e91e63',
};

const StatusIcon: React.FC<{ status: ServiceHealth['status'] }> = ({ status }) => {
  if (status === 'UP') return <CheckCircle sx={{ color: '#4caf50', fontSize: 20 }} />;
  if (status === 'DOWN') return <WifiOff sx={{ color: '#f44336', fontSize: 20 }} />;
  return <Warning sx={{ color: '#ff9800', fontSize: 20 }} />;
};

const ServiceCard: React.FC<{ svc: ServiceHealth }> = ({ svc }) => {
  const borderColor = svc.status === 'UP' ? '#4caf50' : svc.status === 'DOWN' ? '#f44336' : '#ff9800';
  const roleColor = ROLE_COLORS[svc.role] ?? '#888';
  return (
    <Paper
      sx={{
        p: 2,
        borderLeft: `4px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.15s',
        '&:hover': { transform: 'translateY(-2px)' },
      }}
    >
      {/* Role badge */}
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <Chip label={svc.role} size="small" sx={{ bgcolor: roleColor, color: '#fff', fontSize: 10, height: 18 }} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
        <StatusIcon status={svc.status} />
        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
          {svc.name}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          label={svc.status}
          size="small"
          color={svc.status === 'UP' ? 'success' : svc.status === 'DOWN' ? 'error' : 'warning'}
          variant="outlined"
        />
        <Typography variant="caption" color="text.secondary">
          {svc.latency_ms} ms
        </Typography>
      </Box>

      {svc.status !== 'UP' && (
        <Typography variant="caption" color="error.main" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
          {svc.detail}
        </Typography>
      )}
    </Paper>
  );
};

// ─── Services Tab ─────────────────────────────────────────────────────────
const ServicesTab: React.FC = () => {
  const [report, setReport] = useState<ServiceHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const data = await getServicesHealth();
      setReport(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth(true);
    // Auto-refresh every 10 seconds
    intervalRef.current = setInterval(() => fetchHealth(false), 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const { up = 0, down = 0, degraded = 0, total = 0 } = report?.summary ?? {};
  const allGood = down === 0 && degraded === 0;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
          Service Health
        </Typography>
        {lastRefresh && (
          <Typography variant="caption" color="text.disabled">
            Last checked: {lastRefresh.toLocaleTimeString()}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          Auto-refreshes every 10 s
        </Typography>
        <Button size="small" startIcon={loading ? <CircularProgress size={12} /> : <Refresh />} variant="outlined" onClick={() => fetchHealth(true)} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary bar */}
      {report && (
        <Alert
          severity={allGood ? 'success' : down > 0 ? 'error' : 'warning'}
          icon={allGood ? <CheckCircle /> : down > 0 ? <ErrorIcon /> : <Warning />}
          sx={{ mb: 2 }}
        >
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>{allGood ? `All ${total} services are UP` : `${down} service(s) DOWN, ${degraded} degraded`}</strong>
            <Chip label={`${up} UP`} size="small" color="success" />
            {degraded > 0 && <Chip label={`${degraded} DEGRADED`} size="small" color="warning" />}
            {down > 0 && <Chip label={`${down} DOWN`} size="small" color="error" />}
          </Box>
        </Alert>
      )}

      {/* Loading skeleton */}
      {loading && !report && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 2 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Paper key={i} sx={{ p: 2, height: 90 }}>
              <LinearProgress sx={{ borderRadius: 1 }} />
            </Paper>
          ))}
        </Box>
      )}

      {/* Service cards grouped by role */}
      {report && Object.entries(
        report.services.reduce<Record<string, ServiceHealth[]>>((acc, svc) => {
          (acc[svc.role] = acc[svc.role] ?? []).push(svc);
          return acc;
        }, {})
      ).map(([role, svcs]) => (
        <Box key={role} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: ROLE_COLORS[role] ?? '#888' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
              {role}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
            {svcs.map(svc => <ServiceCard key={svc.name} svc={svc} />)}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

// ─── Service Logs Tab ──────────────────────────────────────────────────────
const SERVICES_LIST = [
  { id: 'api-gateway', name: 'API Gateway (core)' },
  { id: 'document-service', name: 'Document Service (core)' },
  { id: 'chunking-service', name: 'Chunking Service (core)' },
  { id: 'embedding-service', name: 'Embedding Service (ML)' },
  { id: 'retrieval-service', name: 'Retrieval Service (ML)' },
  { id: 'llm-service', name: 'LLM Service (ML)' },
  { id: 'citation-service', name: 'Citation Service (core)' },
  { id: 'explanation-service', name: 'Explanation Service (core)' },
  { id: 'confidence-service', name: 'Confidence Service (core)' },
  { id: 'feedback-service', name: 'Feedback Service (core)' },
  { id: 'audit-service', name: 'Audit Service (core)' },
  { id: 'keycloak', name: 'Keycloak (auth)' },
  { id: 'postgres', name: 'Postgres (db)' },
  { id: 'minio', name: 'MinIO (storage)' },
  { id: 'qdrant', name: 'Qdrant (vector DB)' },
  { id: 'ollama', name: 'Ollama (LLM backend)' },
  { id: 'frontend', name: 'Frontend (web)' }
];

const ServiceLogsTab: React.FC = () => {
  const [selectedService, setSelectedService] = useState('api-gateway');
  const [limit, setLimit] = useState(200);
  const [logsText, setLogsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const fetchLogs = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const data = await getServiceLogs(selectedService, limit);
      setLogsText(data.logs);
      if (consoleRef.current) {
        setTimeout(() => {
          if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
          }
        }, 50);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
  }, [selectedService, limit]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchLogs(false), 5000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, selectedService, limit]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logsText);
  };

  const renderLogLines = () => {
    if (!logsText) return <Box sx={{ color: 'text.disabled', fontStyle: 'italic' }}>No logs found</Box>;

    return logsText.split('\n').map((line, idx) => {
      let color = '#e2e8f0';
      let fontWeight = 'normal';

      if (line.toUpperCase().includes('ERROR') || line.toUpperCase().includes('CRITICAL') || line.toUpperCase().includes('FAIL')) {
        color = '#f87171';
        fontWeight = 'bold';
      } else if (line.toUpperCase().includes('WARN') || line.toUpperCase().includes('WARNING')) {
        color = '#fbbf24';
        fontWeight = 'bold';
      } else if (line.toUpperCase().includes('INFO')) {
        color = '#60a5fa';
      } else if (line.toUpperCase().includes('DEBUG')) {
        color = '#9ca3af';
      }

      return (
        <div key={idx} style={{ color, fontWeight, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.4' }}>
          {line}
        </div>
      );
    });
  };

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="service-select-label">Select Service</InputLabel>
          <Select
            labelId="service-select-label"
            value={selectedService}
            label="Select Service"
            onChange={(e) => setSelectedService(e.target.value)}
          >
            {SERVICES_LIST.map((svc) => (
              <MenuItem key={svc.id} value={svc.id}>
                {svc.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="limit-select-label">Lines Tail</InputLabel>
          <Select
            labelId="limit-select-label"
            value={limit}
            label="Lines Tail"
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <MenuItem value={50}>50 lines</MenuItem>
            <MenuItem value={100}>100 lines</MenuItem>
            <MenuItem value={200}>200 lines</MenuItem>
            <MenuItem value={500}>500 lines</MenuItem>
            <MenuItem value={1000}>1000 lines</MenuItem>
          </Select>
        </FormControl>

        <Button
          size="small"
          startIcon={loading ? <CircularProgress size={12} /> : <Refresh />}
          variant="outlined"
          onClick={() => fetchLogs(true)}
          disabled={loading}
        >
          Refresh
        </Button>

        <FormControlLabel
          control={
            <Checkbox
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              color="primary"
              size="small"
            />
          }
          label={<Typography variant="body2">Auto-refresh (5s)</Typography>}
        />

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="outlined"
          color="secondary"
          onClick={handleCopy}
          disabled={!logsText}
        >
          Copy Logs
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper
        ref={consoleRef}
        elevation={3}
        sx={{
          flex: 1,
          bgcolor: '#090d16',
          p: 2,
          overflowY: 'auto',
          minHeight: '400px',
          border: '1px solid #1e293b',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ flex: 1 }}>
          {renderLogLines()}
        </Box>
      </Paper>
    </Box>
  );
};


// ─── Main Dashboard ───────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [auditStats, feedback, auditLogs, pendingEscalations] = await Promise.all([
        getAuditStats(),
        getFeedbackStats(),
        getAuditLogs(25),
        getEscalations('PENDING'),
      ]);
      setStats(auditStats);
      setFeedbackStats(feedback);
      setLogs(auditLogs);
      setEscalations(pendingEscalations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const handleResolve = async (queryId: string) => {
    await resolveEscalation(queryId);
    await loadDashboard();
  };

  const trendSlope = (() => {
    const t = feedbackStats?.satisfaction_trend ?? [];
    if (t.length < 2) return 0;
    return (t[0].avg_rating - t[t.length - 1].avg_rating) * -1;
  })();

  if (loading && !stats && tab === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top-level tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3, pt: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Metrics" />
          <Tab label="Services" />
          <Tab label="Service Logs" />
        </Tabs>
      </Box>

      {/* Metrics tab */}
      {tab === 0 && (
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>Admin Metrics</Typography>
            <Button startIcon={<Refresh />} variant="outlined" size="small" onClick={loadDashboard} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* KPI cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1.5, mb: 2 }}>
            {[
              { label: 'Total Queries', value: stats?.total_queries ?? 0 },
              { label: 'Avg Confidence', value: percent(stats?.avg_confidence ?? 0) },
              { label: 'Avg Latency', value: `${Math.round(stats?.avg_latency_ms ?? 0)} ms` },
              { label: 'Pending Reviews', value: stats?.escalations?.PENDING ?? 0 },
              { label: 'Avg Rating', value: `${feedbackStats?.avg_rating ?? 0} / 5` },
              { label: 'Total Feedback', value: feedbackStats?.total_feedback ?? 0 },
            ].map(({ label, value }) => (
              <Paper key={label} sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
              </Paper>
            ))}
          </Box>

          {/* Charts row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2, mb: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Confidence Distribution</Typography>
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => {
                const count = stats?.confidence_distribution?.[level] ?? 0;
                const total = Math.max(stats?.total_queries ?? 0, 1);
                return (
                  <Box key={level} sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption">{level}</Typography>
                      <Typography variant="caption">{count} ({Math.round((count / total) * 100)}%)</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={(count / total) * 100} color={level === 'HIGH' ? 'success' : level === 'MEDIUM' ? 'warning' : 'error'} />
                  </Box>
                );
              })}
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Latency Distribution (last {logs.length} queries)</Typography>
              <LatencyBands logs={logs} />
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Feedback Signals</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                <Chip label={`${feedbackStats?.total_feedback ?? 0} total`} size="small" />
                <Chip label={`${feedbackStats?.positive ?? 0} positive`} color="success" variant="outlined" size="small" />
                <Chip label={`${feedbackStats?.negative ?? 0} negative`} color="error" variant="outlined" size="small" />
                <Chip label={`${feedbackStats?.corrections ?? 0} corrections`} color="warning" variant="outlined" size="small" />
              </Box>
              <Divider sx={{ mb: 1 }} />
              <Typography variant="caption" color="text.secondary">Worst performing queries</Typography>
              {(feedbackStats?.worst_queries ?? []).slice(0, 4).map((item, i) => (
                <Box key={i} sx={{ mt: 0.75, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Chip label={`${item.avg_rating.toFixed(1)}/5`} size="small" color={item.avg_rating < 2 ? 'error' : 'warning'} variant="outlined" />
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>{item.query_text}</Typography>
                </Box>
              ))}
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>Satisfaction Trend (14 days)</Typography>
                <TrendIcon trend={trendSlope} />
              </Box>
              <SatisfactionSparkline data={feedbackStats?.satisfaction_trend ?? []} />
            </Paper>
          </Box>

          {/* Pending escalations */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Pending Human Reviews
              {escalations.length > 0 && <Chip label={escalations.length} size="small" color="warning" sx={{ ml: 1 }} />}
            </Typography>
            {escalations.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No pending escalations.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Query</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Requested By</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {escalations.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{item.query_text}</Typography></TableCell>
                      <TableCell>{item.confidence_score ? percent(item.confidence_score) : item.confidence_level ?? '—'}</TableCell>
                      <TableCell>{item.requested_by || item.username || 'unknown'}</TableCell>
                      <TableCell><Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 160, display: 'block' }}>{item.reason ?? '—'}</Typography></TableCell>
                      <TableCell align="right">
                        <Button size="small" startIcon={<TaskAlt />} onClick={() => handleResolve(item.id)}>Resolve</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          {/* Recent query logs */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Recent Query Logs
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>(click a row to expand)</Typography>
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32 }} />
                  <TableCell>Query</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell>Latency</TableCell>
                  <TableCell>Escalation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log) => <LogRow key={log.id} log={log} />)}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* Services tab */}
      {tab === 1 && <Box sx={{ flex: 1, overflow: 'auto' }}><ServicesTab /></Box>}

      {/* Service Logs tab */}
      {tab === 2 && <Box sx={{ flex: 1, overflow: 'hidden' }}><ServiceLogsTab /></Box>}
    </Box>
  );
};

export default AdminDashboard;
