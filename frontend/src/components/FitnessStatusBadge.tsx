const CONFIG = {
  building: { label: 'Building', color: 'bg-green-900 text-green-300', icon: '↑' },
  maintaining: { label: 'Maintaining', color: 'bg-yellow-900 text-yellow-300', icon: '→' },
  declining: { label: 'Declining', color: 'bg-red-900 text-red-300', icon: '↓' },
  insufficient_data: { label: 'Not enough data', color: 'bg-slate-700 text-slate-400', icon: '?' },
}

export default function FitnessStatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as keyof typeof CONFIG] ?? CONFIG.insufficient_data
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}
