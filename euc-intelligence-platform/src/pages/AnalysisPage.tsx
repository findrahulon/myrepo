import {
  FileSpreadsheet,
  Layers,
  AlertTriangle,
  Calculator,
  ArrowRight,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/Card'
import { MetricCard } from '../components/MetricCard'
import { Badge } from '../components/Badge'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const complexityData = [
  { name: 'Market Risk PnL', complexity: 87, formulas: 847, sheets: 12 },
  { name: 'Credit Exposure', complexity: 72, formulas: 1243, sheets: 8 },
  { name: 'Op Risk Dashboard', complexity: 54, formulas: 423, sheets: 6 },
  { name: 'Liquidity Coverage', complexity: 91, formulas: 1567, sheets: 15 },
  { name: 'FX Reconciliation', complexity: 38, formulas: 312, sheets: 4 },
  { name: 'VaR Calculation', complexity: 95, formulas: 2103, sheets: 18 },
  { name: 'Basel III Capital', complexity: 83, formulas: 956, sheets: 11 },
]

const categoryData = [
  { name: 'Risk Reporting', value: 12, color: '#3b82f6' },
  { name: 'Reconciliation', value: 8, color: '#10b981' },
  { name: 'Regulatory', value: 6, color: '#f59e0b' },
  { name: 'Analytics', value: 5, color: '#8b5cf6' },
  { name: 'Operations', value: 4, color: '#ef4444' },
]

const workbooks = [
  {
    name: 'VaR Calculation Engine',
    purpose: 'Calculates daily Value-at-Risk across multiple asset classes using historical simulation and parametric methods.',
    complexity: 'Critical',
    risk: 'High',
    sheets: 18,
    formulas: 2103,
    macros: 14,
  },
  {
    name: 'Liquidity Coverage Ratio',
    purpose: 'Computes LCR metrics for Basel III compliance. Aggregates HQLA and net cash outflows across business lines.',
    complexity: 'Critical',
    risk: 'High',
    sheets: 15,
    formulas: 1567,
    macros: 8,
  },
  {
    name: 'Market Risk Daily PnL',
    purpose: 'Daily P&L attribution across trading desks. Reconciles front-office positions with back-office records.',
    complexity: 'High',
    risk: 'Medium',
    sheets: 12,
    formulas: 847,
    macros: 5,
  },
  {
    name: 'Credit Exposure Report',
    purpose: 'Quarterly counterparty credit exposure aggregation with netting and collateral calculations.',
    complexity: 'High',
    risk: 'Medium',
    sheets: 8,
    formulas: 1243,
    macros: 3,
  },
  {
    name: 'FX Reconciliation Weekly',
    purpose: 'Reconciles FX positions between trading systems and general ledger on a weekly basis.',
    complexity: 'Medium',
    risk: 'Low',
    sheets: 4,
    formulas: 312,
    macros: 1,
  },
]

const complexityBadge = (level: string) => {
  const map: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
    Critical: 'danger',
    High: 'warning',
    Medium: 'info',
    Low: 'neutral',
  }
  return <Badge variant={map[level] || 'neutral'}>{level}</Badge>
}

const riskBadge = (level: string) => {
  const map: Record<string, 'danger' | 'warning' | 'success'> = {
    High: 'danger',
    Medium: 'warning',
    Low: 'success',
  }
  return <Badge variant={map[level] || 'neutral'}>{level}</Badge>
}

export function AnalysisPage() {
  return (
    <div>
      <PageHeader
        title="Portfolio Analysis"
        description="AI-generated insights across all uploaded workbooks. Complexity scoring, risk assessment, and business summaries."
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Workbooks" value={35} icon={FileSpreadsheet} color="blue" />
        <MetricCard label="Total Sheets" value={287} icon={Layers} color="green" />
        <MetricCard label="High Risk EUCs" value={8} icon={AlertTriangle} color="red" />
        <MetricCard label="Total Formulas" value="14.2K" icon={Calculator} color="purple" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <Card className="col-span-2">
          <CardHeader title="Complexity Distribution" subtitle="Formula complexity score (0-100) by workbook" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complexityData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="complexity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Category Breakdown" subtitle="EUCs by business function" />
          <div className="h-52 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {categoryData.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: cat.color }} />
                  <span className="text-[var(--color-text-muted)]">{cat.name}</span>
                </div>
                <span className="font-medium">{cat.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Workbook Summaries</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              AI-generated purpose and complexity assessment
            </p>
          </div>
          <button className="text-xs text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1">
            View All <ArrowRight size={12} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-[var(--color-border)]">
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] px-6 py-3">Workbook</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">AI Summary</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Complexity</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Risk</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Sheets</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Formulas</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Macros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {workbooks.map((wb) => (
                <tr key={wb.name} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={16} className="text-emerald-500" />
                      <span className="text-sm font-medium">{wb.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">
                      {wb.purpose}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-center">{complexityBadge(wb.complexity)}</td>
                  <td className="px-4 py-3.5 text-center">{riskBadge(wb.risk)}</td>
                  <td className="px-4 py-3.5 text-center text-sm">{wb.sheets}</td>
                  <td className="px-4 py-3.5 text-center text-sm">{wb.formulas.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-center text-sm">{wb.macros}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
