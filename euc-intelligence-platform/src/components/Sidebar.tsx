import { NavLink } from 'react-router-dom'
import {
  Upload,
  BarChart3,
  GitMerge,
  Map,
  Layers,
  FileSpreadsheet,
} from 'lucide-react'

const navItems = [
  { path: '/upload', label: 'Upload', icon: Upload },
  { path: '/analysis', label: 'Analysis', icon: BarChart3 },
  { path: '/overlap', label: 'Overlap', icon: GitMerge },
  { path: '/roadmap', label: 'Roadmap', icon: Map },
  { path: '/architecture', label: 'Architecture', icon: Layers },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-[var(--color-sidebar)] text-white flex flex-col min-h-screen">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">EUC Intelligence</h1>
            <p className="text-xs text-slate-400">Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-[var(--color-sidebar-hover)] hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="text-xs text-slate-400">
          <p>EUC Rationalization PoC</p>
          <p className="mt-1">v0.1.0</p>
        </div>
      </div>
    </aside>
  )
}
