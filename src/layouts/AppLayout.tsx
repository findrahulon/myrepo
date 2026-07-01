import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[var(--color-surface-alt)]">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
