import { GitMerge, Link2, Unlink2, ArrowRight } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/Card'
import { MetricCard } from '../components/MetricCard'
import { Badge } from '../components/Badge'
import { ProgressBar } from '../components/ProgressBar'

interface OverlapGroup {
  id: string
  name: string
  workbooks: string[]
  similarity: number
  sharedFormulas: number
  recommendation: string
  savings: string
}

const overlapGroups: OverlapGroup[] = [
  {
    id: '1',
    name: 'Risk VaR Calculation Cluster',
    workbooks: ['VaR Calculation Engine', 'Market Risk Daily PnL', 'Desk-Level VaR Backup'],
    similarity: 87,
    sharedFormulas: 342,
    recommendation: 'Consolidate into single workbook with parameterized desk selection',
    savings: '~40% reduction in maintenance effort',
  },
  {
    id: '2',
    name: 'Liquidity Reporting Group',
    workbooks: ['Liquidity Coverage Ratio', 'LCR Daily Monitor', 'NSFR Quarterly'],
    similarity: 74,
    sharedFormulas: 218,
    recommendation: 'Merge LCR daily/quarterly views; keep NSFR separate with shared data layer',
    savings: '~30% reduction in data reconciliation',
  },
  {
    id: '3',
    name: 'Credit Exposure Suite',
    workbooks: ['Credit Exposure Report', 'Counterparty Risk Summary'],
    similarity: 82,
    sharedFormulas: 156,
    recommendation: 'Unify into a single exposure workbook with counterparty drill-down',
    savings: '~50% reduction in manual data entry',
  },
  {
    id: '4',
    name: 'FX Operations',
    workbooks: ['FX Reconciliation Weekly', 'FX Position Monitor', 'FX Settlement Tracker'],
    similarity: 69,
    sharedFormulas: 89,
    recommendation: 'Create shared FX data model; retain separate views per function',
    savings: '~25% reduction in formula maintenance',
  },
]

const similarityPairs = [
  { a: 'VaR Calculation Engine', b: 'Market Risk Daily PnL', score: 0.87, type: 'Structural + Semantic' },
  { a: 'Credit Exposure Report', b: 'Counterparty Risk Summary', score: 0.82, type: 'Semantic' },
  { a: 'Liquidity Coverage Ratio', b: 'LCR Daily Monitor', score: 0.79, type: 'Structural' },
  { a: 'FX Reconciliation Weekly', b: 'FX Position Monitor', score: 0.74, type: 'Structural + Semantic' },
  { a: 'Basel III Capital', b: 'Regulatory Capital Buffer', score: 0.71, type: 'Semantic' },
  { a: 'Op Risk Dashboard', b: 'Op Risk Event Log', score: 0.67, type: 'Structural' },
]

function getSimilarityColor(score: number): 'red' | 'amber' | 'green' {
  if (score >= 0.8) return 'red'
  if (score >= 0.7) return 'amber'
  return 'green'
}

export function OverlapPage() {
  return (
    <div>
      <PageHeader
        title="Overlap Detection"
        description="Identify redundant and overlapping workbooks using hybrid structural + semantic similarity analysis."
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Overlap Groups" value={4} icon={GitMerge} color="purple" />
        <MetricCard label="Workbooks Involved" value={14} icon={Link2} color="amber" />
        <MetricCard label="Avg. Similarity" value="78%" icon={Link2} color="blue" />
        <MetricCard label="Consolidation Candidates" value={7} icon={Unlink2} color="green" />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Pairwise Similarity Scores"
          subtitle="Ranked by combined structural and semantic similarity"
        />
        <div className="space-y-3">
          {similarityPairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium truncate">{pair.a}</span>
                  <ArrowRight size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="font-medium truncate">{pair.b}</span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar
                    value={pair.score * 100}
                    color={getSimilarityColor(pair.score)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant={pair.score >= 0.8 ? 'danger' : pair.score >= 0.7 ? 'warning' : 'info'}>
                  {(pair.score * 100).toFixed(0)}%
                </Badge>
                <span className="text-xs text-[var(--color-text-muted)] w-28">{pair.type}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Consolidation Groups</h3>
        {overlapGroups.map((group) => (
          <Card key={group.id}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-sm font-semibold">{group.name}</h4>
                  <Badge variant={group.similarity >= 80 ? 'danger' : 'warning'}>
                    {group.similarity}% overlap
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {group.workbooks.map((wb) => (
                    <span
                      key={wb}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-700"
                    >
                      <Link2 size={10} />
                      {wb}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[var(--color-text-muted)]">Recommendation: </span>
                    <span className="text-[var(--color-text)]">{group.recommendation}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">Estimated Savings: </span>
                    <span className="text-emerald-600 font-medium">{group.savings}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <p className="text-xs text-[var(--color-text-muted)]">Shared Formulas</p>
                <p className="text-lg font-bold text-[var(--color-text)]">{group.sharedFormulas}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
