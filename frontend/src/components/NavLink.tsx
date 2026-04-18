import { NavLink as RouterNavLink } from 'react-router-dom'

interface Props {
  to: string
  label: string
  icon: string
}

export default function NavLink({ to, label, icon }: Props) {
  return (
    <RouterNavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand/20 text-brand'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
        }`
      }
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </RouterNavLink>
  )
}
