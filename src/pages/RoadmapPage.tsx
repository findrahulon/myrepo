import { Map, Zap, Server, Cloud, Database, ArrowRight, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/Card'
import { MetricCard } from '../components/MetricCard'
import { Badge } from '../components/Badge'

interface MigrationItem {
  workbook: string
  currentState: string
  targetState: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  effort: 'Low' | 'Medium' | 'High'
  timeline: string
  rationale: string
}

const migrations: MigrationItem[] = [
  {
    workbook: 'VaR Calculation Engine',
    currentState: 'Complex Excel with VBA macros',
    targetState: 'Python-based risk engine with API',
    priority: 'Critical',
    effort: 'High',
    timeline: 'Q1-Q2 2025',
    rationale: 'Critical regulatory dependency; single point of failure; 14 VBA macros with no version control.',
  },
  {
    workbook: 'Liquidity Coverage Ratio',
    currentState: 'Multi-sheet Excel with external links',
    targetState: 'Database-driven reporting application',
    priority: 'Critical',
    effort: 'High',
    timeline: 'Q2-Q3 2025',
    rationale: 'Basel III compliance requirement; currently depends on 4 external file links that frequently break.',
  },
  {
    workbook: 'Credit Exposure Report + Counterparty Risk',
    currentState: '2 overlapping Excel workbooks',
    targetState: 'Consolidated web dashboard',
    priority: 'High',
    effort: 'Medium',
    timeline: 'Q2 2025',
    rationale: '82% overlap detected; consolidation eliminates data duplication and reduces reconciliation effort.',
  },
  {
    workbook: 'Market Risk Daily PnL',
    currentState: 'Daily-refresh Excel report',
    targetState: 'Automated pipeline with scheduled delivery',
    priority: 'High',
    effort: 'Medium',
    timeline: 'Q3 2025',
    rationale: 'High manual touch; 3-hour daily preparation could be automated to 15-minute scheduled run.',
  },
  {
    workbook: 'FX Operations Suite',
    currentState: '3 related Excel workbooks',
    targetState: 'Shared data model with function-specific views',
    priority: 'Medium',
    effort: 'Medium',
    timeline: 'Q3-Q4 2025',
    rationale: '69% overlap across FX workbooks; shared data layer reduces formula maintenance by ~25%.',
  },
  {
    workbook: 'Op Risk Dashboard',
    currentState: 'Static Excel dashboard',
    targetState: 'Interactive BI dashboard (PowerBI/Tableau)',
    priority: 'Low',
    effort: 'Low',
    timeline: 'Q4 2025',
    rationale: 'Low complexity; minimal formulas; better served by existing BI infrastructure.',
  },
]

const targetArchitectures = [
  {
    name: 'Python/FastAPI Microservices',
    description: 'For computation-heavy EUCs with complex business logic (VaR, LCR)',
    suitable: ['VaR Calculation Engine', 'Liquidity Coverage Ratio'],
    icon: Server,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    name: 'Database + Web Application',
    description: 'For reporting/analytics EUCs that aggregate and display data',
    suitable: ['Credit Exposure Report', 'Market Risk Daily PnL'],
    icon: Database,
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    name: 'Automated Pipeline',
    description: 'For periodic reports that follow a fixed ETL pattern',
    suitable: ['FX Reconciliation Weekly', 'FX Settlement Tracker'],
    icon: Zap,
    color: 'bg-amber-50 text-amber-600',
  },
  {
    name: 'BI Platform Migration',
    description: 'For visualization-focused EUCs with minimal business logic',
    suitable: ['Op Risk Dashboard', 'Op Risk Event Log'],
    icon: Cloud,
    color: 'bg-purple-50 text-purple-600',
  },
]

const priorityVariant = (p: string) => {
  const map: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
    Critical: 'danger',
    High: 'warning',
    Medium: 'info',
    Low: 'neutral',
  }
  return map[p] || 'neutral'
}

export function RoadmapPage() {
  return (
    <div>
      <PageHeader
        title="Modernization Roadmap"
        description="AI-recommended migration strategies and target architectures based on workbook analysis."
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Migrations" value={12} icon={Map} color="blue" />
        <MetricCard label="Critical Priority" value={2} icon={Zap} color="red" />
        <MetricCard label="Est. Effort Saved" value="62%" icon={CheckCircle2} color="green" />
        <MetricCard label="Target Completion" value="Q4 2025" icon={Server} color="purple" />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Recommended Target Architectures"
          subtitle="Based on workbook complexity, usage patterns, and business function"
        />
        <div className="grid grid-cols-2 gap-4">
          {targetArchitectures.map((arch) => (
            <div
              key={arch.name}
              className="p-4 border border-[var(--color-border)] rounded-lg hover:border-blue-200 transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${arch.color}`}>
                  <arch.icon size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">{arch.name}</h4>
                  <p className="text-xs text-[var(--color-text-muted)]">{arch.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {arch.suitable.map((wb) => (
                  <span key={wb} className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                    {wb}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Migration Priority Matrix</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Ordered by business criticality and risk reduction potential
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-[var(--color-border)]">
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] px-6 py-3">Workbook</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Current → Target</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Priority</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Effort</th>
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] px-4 py-3">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {migrations.map((m) => (
                <tr key={m.workbook} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="text-sm font-medium">{m.workbook}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5 max-w-xs">{m.rationale}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">{m.currentState}</span>
                      <ArrowRight size={12} className="text-slate-400" />
                      <span className="text-blue-600 font-medium">{m.targetState}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <Badge variant={priorityVariant(m.priority)}>{m.priority}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <Badge variant={m.effort === 'High' ? 'warning' : m.effort === 'Medium' ? 'info' : 'success'}>
                      {m.effort}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs font-medium">{m.timeline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
