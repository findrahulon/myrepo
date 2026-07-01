import { type ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{description}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
