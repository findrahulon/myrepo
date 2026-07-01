interface ProgressBarProps {
  value: number
  max?: number
  color?: 'blue' | 'green' | 'amber' | 'red'
  size?: 'sm' | 'md'
}

const colorMap = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

export function ProgressBar({ value, max = 100, color = 'blue', size = 'sm' }: ProgressBarProps) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className={`w-full bg-slate-100 rounded-full ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}>
      <div
        className={`${colorMap[color]} rounded-full ${size === 'sm' ? 'h-1.5' : 'h-2.5'} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
