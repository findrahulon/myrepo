import React, { useEffect, useState } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Refresh,
  TaskAlt,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
} from '@mui/icons-material';
import {
  getAuditLogs,
  getAuditStats,
  getEscalations,
  getFeedbackStats,
  resolveEscalation,
} from '../services/api';
import type { AuditLog, AuditStats, Escalation, FeedbackStats } from '../types';

const percent = (value: number) => `${Math.round(value * 100)}%`;

// ─── Satisfaction Trend Sparkline (pure SVG) ───────────────────────────────
interface TrendPoint {
  date?: string;
  feedback_count: number;
  avg_rating: number;
}

const SatisfactionSparkline: React.FC<{ data: TrendPoint[] }> = ({ data }) => {
  if (!data.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No trend data yet.
      </Typography>
    );
  }

  const sorted = [...data].reverse(); // oldest first
  const W = 100;
  const H = 48;
  const barW = Math.max(2, (W / sorted.length) - 1);
  const maxRating = 5;

  return (
    <Box>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label="Satisfaction trend chart"
      >
        {/* Rating grid lines at 1, 2, 3, 4 */}
        {[1, 2, 3, 4].map((r) => {
          const y = H - (r / maxRating) * H;
          return (
            <line
              key={r}
              x1={0}
              x2={W}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Bars */}
        {sorted.map((pt, i) => {
          const x = i * (W / sorted.length);
          const barH = (pt.avg_rating / maxRating) * H;
          const y = H - barH;
          const color =
            pt.avg_rating >= 4
              ? '#4caf50'
              : pt.avg_rating >= 3
              ? '#ff9800'
              : '#f44336';
          return (
            <Tooltip
              key={i}
              title={`${pt.date ?? 'Unknown'}: ${pt.avg_rating.toFixed(1)}/5 (${pt.feedback_count} reviews)`}
            >
              <rect
                x={x + 0.5}
                y={y}
                width={barW}
                height={barH}
                fill={color}
                rx={1}
                style={{ cursor: 'default' }}
              />
            </Tooltip>
          );
        })}
      </svg>

      {/* X-axis labels — first and last date */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" color="text.disabled">
          {sorted[0]?.date ?? ''}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {sorted[sorted.length - 1]?.date ?? ''}
        </Typography>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.75, flexWrap: 'wrap' }}>
        {[
          { label: '≥ 4/5', color: '#4caf50' },
          { label: '3–4/5', color: '#ff9800' },
          { label: '< 3/5', color: '#f44336' },
        ].map(({ label, color }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ─── Latency Band Visual ───────────────────────────────────────────────────
const LatencyBands: React.FC<{ logs: AuditLog[] }> = ({ logs }) => {
  if (!logs.length) return null;
  const latencies = logs.map((l) => l.latency_ms ?? 0);
  const fast = latencies.filter((ms) => ms < 1000).length;
  const mid = latencies.filter((ms) => ms >= 1000 && ms < 5000).length;
  const slow = latencies.filter((ms) => ms >= 5000).length;
  const total = latencies.length;

  return (
    <Box>
      {[
        { label: '< 1 s (fast)', count: fast, color: 'success' as const },
        { label: '1–5 s (normal)', count: mid, color: 'warning' as const },
        { label: '> 5 s (slow)', count: slow, color: 'error' as const },
      ].map(({ label, count, color }) => (
        <Box key={label} sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption">{label}</Typography>
            <Typography variant="caption">{count}</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(count / total) * 100}
            color={color}
          />
        </Box>
      ))}
    </Box>
  );
};

// ─── Expandable Log Row ────────────────────────────────────────────────────
const LogRow: React.FC<{ log: AuditLog }> = ({ log }) => {
  const [open, setOpen] = useState(false);

  const confidencePct = log.confidence_score
    ? percent(log.confidence_score)
    : log.confidence_level ?? '—';

  const statusColor =
    log.escalation_status === 'PENDING'
      ? ('warning' as const)
      : log.escalation_status === 'RESOLVED'
      ? ('success' as const)
      : ('default' as const);

  return (
    <>
      <TableRow
        hover
        sx={{ cursor: 'pointer', '& td': { verticalAlign: 'middle' } }}
        onClick={() => setOpen(!open)}
      >
        <TableCell sx={{ pr: 0, width: 32 }}>
          <IconButton size="small">
            {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>
            {log.query_text}
          </Typography>
          {log.created_at && (
            <Typography variant="caption" color="text.disabled">
              {new Date(log.created_at).toLocaleString()}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          <Chip
            label={confidencePct}
            size="small"
            color={
              log.confidence_level === 'HIGH'
                ? 'success'
                : log.confidence_level === 'MEDIUM'
                ? 'warning'
                : 'error'
            }
            variant="outlined"
          />
        </TableCell>
        <TableCell>{log.latency_ms != null ? `${log.latency_ms} ms` : '—'}</TableCell>
        <TableCell>
          <Chip
            label={log.escalation_status ?? 'NONE'}
            size="small"
            color={statusColor}
            variant="outlined"
          />
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box
              sx={{
                m: 1,
                p: 1.5,
                bgcolor: 'background.default',
                borderRadius: 1,
                borderLeft: '3px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Response
              </Typography>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, whiteSpace: 'pre-wrap', color: 'text.secondary' }}
              >
                {log.response_text || 'No response stored.'}
              </Typography>
              {log.model_used && (
                <Box sx={{ mt: 1 }}>
                  <Chip label={`Model: ${log.model_used}`} size="small" variant="outlined" />
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ─── Trend Icon ────────────────────────────────────────────────────────────
const TrendIcon: React.FC<{ trend: number }> = ({ trend }) => {
  if (trend > 0.1) return <TrendingUp fontSize="small" color="success" />;
  if (trend < -0.1) return <TrendingDown fontSize="small" color="error" />;
  return <TrendingFlat fontSize="small" color="disabled" />;
};

// ─── Main Dashboard ────────────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
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

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleResolve = async (queryId: string) => {
    await resolveEscalation(queryId);
    await loadDashboard();
  };

  // Compute satisfaction trend slope for the trend icon
  const trendSlope = (() => {
    const t = feedbackStats?.satisfaction_trend ?? [];
    if (t.length < 2) return 0;
    return (t[0].avg_rating - t[t.length - 1].avg_rating) * -1; // newest first → invert
  })();

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          Admin Metrics
        </Typography>
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

        {/* Confidence distribution */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Confidence Distribution
          </Typography>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => {
            const count = stats?.confidence_distribution?.[level] ?? 0;
            const total = Math.max(stats?.total_queries ?? 0, 1);
            return (
              <Box key={level} sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption">{level}</Typography>
                  <Typography variant="caption">{count} ({Math.round((count / total) * 100)}%)</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(count / total) * 100}
                  color={level === 'HIGH' ? 'success' : level === 'MEDIUM' ? 'warning' : 'error'}
                />
              </Box>
            );
          })}
        </Paper>

        {/* Latency bands */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Latency Distribution (last {logs.length} queries)
          </Typography>
          <LatencyBands logs={logs} />
        </Paper>

        {/* Feedback signals + worst queries */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Feedback Signals
          </Typography>
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
              <Chip
                label={`${item.avg_rating.toFixed(1)}/5`}
                size="small"
                color={item.avg_rating < 2 ? 'error' : 'warning'}
                variant="outlined"
              />
              <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                {item.query_text}
              </Typography>
            </Box>
          ))}
        </Paper>

        {/* Satisfaction trend sparkline */}
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              Satisfaction Trend (14 days)
            </Typography>
            <TrendIcon trend={trendSlope} />
          </Box>
          <SatisfactionSparkline data={feedbackStats?.satisfaction_trend ?? []} />
        </Paper>
      </Box>

      {/* Pending escalations */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Pending Human Reviews
          {escalations.length > 0 && (
            <Chip label={escalations.length} size="small" color="warning" sx={{ ml: 1 }} />
          )}
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
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {item.query_text}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {item.confidence_score ? percent(item.confidence_score) : item.confidence_level ?? '—'}
                  </TableCell>
                  <TableCell>{item.requested_by || item.username || 'unknown'}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 160, display: 'block' }}>
                      {item.reason ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<TaskAlt />} onClick={() => handleResolve(item.id)}>
                      Resolve
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Recent query logs — expandable rows */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Recent Query Logs
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            (click a row to expand)
          </Typography>
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
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

export default AdminDashboard;
