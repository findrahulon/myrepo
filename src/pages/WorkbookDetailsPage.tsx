import {
  FileSpreadsheet,
  Table2,
  Code,
  Link2,
  AlertTriangle,
  Clock,
  Users,
  ArrowLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/Card'
import { Badge } from '../components/Badge'
import { ProgressBar } from '../components/ProgressBar'

const workbook = {
  name: 'VaR Calculation Engine',
  filename: 'VaR_Calculation_Engine_v4.2.xlsx',
  size: '4.8 MB',
  lastModified: '2024-11-15',
  owner: 'Market Risk Team',
  purpose:
    'Calculates daily Value-at-Risk (VaR) metrics across multiple asset classes using both historical simulation and parametric variance-covariance methods. Provides desk-level and firm-wide aggregations with diversification benefits.',
  complexity: 95,
  risk: 'High',
  sheets: 18,
  formulas: 2103,
  macros: 14,
  externalLinks: 6,
  namedRanges: 47,
  conditionalFormats: 23,
}

const sheets = [
  { name: 'Summary', rows: 150, cols: 20, formulas: 89, complexity: 'Medium' },
  { name: 'Historical_Simulation', rows: 5000, cols: 45, formulas: 456, complexity: 'Critical' },
  { name: 'Parametric_VaR', rows: 2000, cols: 30, formulas: 312, complexity: 'High' },
  { name: 'Correlation_Matrix', rows: 500, cols: 500, formulas: 250000, complexity: 'Critical' },
  { name: 'Position_Data', rows: 10000, cols: 25, formulas: 0, complexity: 'Low' },
  { name: 'P&L_Attribution', rows: 3000, cols: 15, formulas: 234, complexity: 'High' },
  { name: 'Stress_Scenarios', rows: 200, cols: 40, formulas: 178, complexity: 'High' },
  { name: 'Config', rows: 50, cols: 10, formulas: 12, complexity: 'Low' },
]

const formulaPatterns = [
  { pattern: 'VLOOKUP / INDEX-MATCH', count: 342, risk: 'Medium' },
  { pattern: 'Array formulas (CSE)', count: 89, risk: 'High' },
  { pattern: 'Circular references', count: 3, risk: 'Critical' },
  { pattern: 'External file references', count: 6, risk: 'High' },
  { pattern: 'INDIRECT / OFFSET (volatile)', count: 45, risk: 'Medium' },
  { pattern: 'Custom VBA UDFs', count: 14, risk: 'High' },
]

const overlaps = [
  { workbook: 'Market Risk Daily PnL', similarity: 87, type: 'Structural + Semantic' },
  { workbook: 'Desk-Level VaR Backup', similarity: 91, type: 'Structural' },
  { workbook: 'Stress Testing Framework', similarity: 62, type: 'Semantic' },
]

const recommendations = [
  {
    title: 'Migrate to Python Risk Engine',
    description:
      'Replace VBA macros and complex array formulas with a Python-based calculation engine. Use numpy/scipy for matrix operations (correlation matrix) and Monte Carlo simulation.',
    priority: 'Critical',
  },
  {
    title: 'Eliminate Circular References',
    description:
      'The 3 circular references in sheets Historical_Simulation and Parametric_VaR create calculation instability. Refactor to iterative solver pattern.',
    priority: 'High',
  },
  {
    title: 'Consolidate with Desk-Level VaR Backup',
    description:
      '91% structural overlap detected. The backup workbook is a stale copy with divergent formulas — consolidate into a single source of truth.',
    priority: 'High',
  },
  {
    title: 'Replace External Links with Data Pipeline',
    description:
      '6 external file references are fragile. Replace with a scheduled data ingestion pipeline that writes to a shared database.',
    priority: 'Medium',
  },
]

export function WorkbookDetailsPage() {
  return (
    <div>
      <Link
        to="/analysis"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-4"
      >
        <ArrowLeft size={12} /> Back to Analysis
      </Link>

      <PageHeader
        title={workbook.name}
        description={`${workbook.filename} · ${workbook.size} · Last modified ${workbook.lastModified}`}
        action={
          <Badge variant="danger">
            <AlertTriangle size={12} className="mr-1" />
            High Risk
          </Badge>
        }
      />

      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Sheets', value: workbook.sheets, icon: Table2 },
          { label: 'Formulas', value: workbook.formulas.toLocaleString(), icon: Code },
          { label: 'VBA Macros', value: workbook.macros, icon: Code },
          { label: 'External Links', value: workbook.externalLinks, icon: Link2 },
          { label: 'Named Ranges', value: workbook.namedRanges, icon: FileSpreadsheet },
          { label: 'Complexity', value: `${workbook.complexity}/100`, icon: AlertTriangle },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-lg border border-[var(--color-border)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <m.icon size={14} className="text-slate-400" />
              <span className="text-xs text-[var(--color-text-muted)]">{m.label}</span>
            </div>
            <p className="text-lg font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader title="AI-Generated Summary" subtitle="Business purpose and functional understanding" />
        <p className="text-sm text-[var(--color-text)] leading-relaxed">{workbook.purpose}</p>
        <div className="mt-4 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1">
            <Users size={12} /> {workbook.owner}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> Modified {workbook.lastModified}
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card padding={false}>
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold">Sheet Analysis</h3>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {sheets.map((s) => (
              <div key={s.name} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {s.rows.toLocaleString()} rows x {s.cols} cols · {s.formulas.toLocaleString()} formulas
                  </p>
                </div>
                <Badge
                  variant={
                    s.complexity === 'Critical'
                      ? 'danger'
                      : s.complexity === 'High'
                      ? 'warning'
                      : s.complexity === 'Medium'
                      ? 'info'
                      : 'neutral'
                  }
                >
                  {s.complexity}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Formula Patterns Detected" subtitle="Risk indicators from formula AST analysis" />
            <div className="space-y-3">
              {formulaPatterns.map((fp) => (
                <div key={fp.pattern} className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{fp.pattern}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">{fp.count}</span>
                    </div>
                    <ProgressBar
                      value={fp.count}
                      max={400}
                      color={fp.risk === 'Critical' ? 'red' : fp.risk === 'High' ? 'amber' : 'blue'}
                    />
                  </div>
                  <Badge
                    variant={
                      fp.risk === 'Critical' ? 'danger' : fp.risk === 'High' ? 'warning' : 'info'
                    }
                  >
                    {fp.risk}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Related Workbooks" subtitle="Overlap detection results" />
            <div className="space-y-2">
              {overlaps.map((o) => (
                <div
                  key={o.workbook}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium">{o.workbook}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{o.type}</p>
                  </div>
                  <Badge variant={o.similarity >= 80 ? 'danger' : o.similarity >= 60 ? 'warning' : 'info'}>
                    {o.similarity}%
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="AI Recommendations" subtitle="Suggested actions for this workbook" />
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <div key={rec.title} className="p-4 border border-[var(--color-border)] rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold">{rec.title}</h4>
                <Badge variant={rec.priority === 'Critical' ? 'danger' : rec.priority === 'High' ? 'warning' : 'info'}>
                  {rec.priority}
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{rec.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
