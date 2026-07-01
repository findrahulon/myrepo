import { useState } from 'react'
import { Upload, FileSpreadsheet, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'

interface UploadedFile {
  id: string
  name: string
  size: string
  status: 'queued' | 'processing' | 'complete' | 'error'
  sheets?: number
  formulas?: number
}

const mockFiles: UploadedFile[] = [
  { id: '1', name: 'Market_Risk_Daily_PnL.xlsx', size: '2.4 MB', status: 'complete', sheets: 12, formulas: 847 },
  { id: '2', name: 'Credit_Exposure_Report_Q2.xlsx', size: '5.1 MB', status: 'complete', sheets: 8, formulas: 1243 },
  { id: '3', name: 'Operational_Risk_Dashboard.xlsx', size: '1.8 MB', status: 'processing', sheets: 6 },
  { id: '4', name: 'Liquidity_Coverage_Ratio.xlsx', size: '3.2 MB', status: 'queued' },
  { id: '5', name: 'FX_Reconciliation_Weekly.xlsx', size: '890 KB', status: 'complete', sheets: 4, formulas: 312 },
]

export function UploadPage() {
  const [files] = useState<UploadedFile[]>(mockFiles)
  const [isDragging, setIsDragging] = useState(false)

  const statusConfig = {
    queued: { icon: Clock, label: 'Queued', variant: 'neutral' as const },
    processing: { icon: AlertCircle, label: 'Processing', variant: 'warning' as const },
    complete: { icon: CheckCircle2, label: 'Complete', variant: 'success' as const },
    error: { icon: AlertCircle, label: 'Error', variant: 'danger' as const },
  }

  return (
    <div>
      <PageHeader
        title="Upload Workbooks"
        description="Upload Excel workbooks (.xlsx, .xlsm, .xls) for analysis. Drag and drop or browse files."
      />

      <Card className="mb-6">
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false) }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center">
              <Upload size={24} className="text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                Drop Excel workbooks here
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Supports .xlsx, .xlsm, .xls — up to 50 MB per file
              </p>
            </div>
            <button className="mt-2 px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors">
              Browse Files
            </button>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Processing Pipeline</h3>
          <Badge variant="info">3 of 5 complete</Badge>
        </div>
        <div className="flex items-center gap-2">
          {['Parse', 'Metadata', 'Summarize', 'Embed', 'Index'].map((step, i) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <div
                className={`flex-1 h-2 rounded-full ${
                  i < 3 ? 'bg-blue-500' : i === 3 ? 'bg-blue-200' : 'bg-slate-100'
                }`}
              />
              <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                {step}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Upload Queue</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {files.length} files
            </span>
          </div>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {files.map((file) => {
            const config = statusConfig[file.status]
            const StatusIcon = config.icon
            return (
              <div
                key={file.id}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <FileSpreadsheet size={18} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">{file.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {file.size}
                      {file.sheets && ` · ${file.sheets} sheets`}
                      {file.formulas && ` · ${file.formulas} formulas`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={config.variant}>
                    <StatusIcon size={12} className="mr-1" />
                    {config.label}
                  </Badge>
                  <button className="p-1 text-slate-400 hover:text-slate-600 rounded">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
