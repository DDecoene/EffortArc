import { Outlet } from 'react-router-dom'
import NavLink from './NavLink'

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <aside className="w-56 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col p-4 gap-1">
        <div className="px-4 py-3 mb-4">
          <h1 className="text-lg font-bold text-brand">⛰ EffortArc</h1>
          <p className="text-xs text-slate-500 mt-0.5">v{__APP_VERSION__}</p>
        </div>
        <NavLink to="/dashboard" label="Dashboard" icon="📊" />
        <NavLink to="/progress" label="Progress" icon="📈" />
        <NavLink to="/goals" label="Goals" icon="🎯" />
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
