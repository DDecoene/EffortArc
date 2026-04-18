interface Props {
  firstPace: number | null
  lastPace: number | null
  dropPct: number | null
  label: string
}

const CONFIG = {
  stable: { text: 'Stable', color: 'text-green-400', bg: 'bg-green-900/30', bar: '#22c55e' },
  moderate_fatigue: { text: 'Moderate Fatigue', color: 'text-yellow-400', bg: 'bg-yellow-900/30', bar: '#eab308' },
  strong_slowdown: { text: 'Strong Slowdown', color: 'text-red-400', bg: 'bg-red-900/30', bar: '#ef4444' },
  insufficient_data: { text: 'Not enough data', color: 'text-slate-400', bg: 'bg-slate-800', bar: '#475569' },
}

function formatPace(p: number | null): string {
  if (!p) return '—'
  const mins = Math.floor(p)
  const secs = Math.round((p - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function FatigueIndicator({ firstPace, lastPace, dropPct, label }: Props) {
  const cfg = CONFIG[label as keyof typeof CONFIG] ?? CONFIG.insufficient_data
  return (
    <div className={`rounded-xl p-5 ${cfg.bg}`}>
      <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-3">Fatigue Analysis</h3>
      <div className={`text-lg font-bold ${cfg.color} mb-3`}>{cfg.text}</div>
      <div className="flex gap-8">
        <div>
          <p className="text-xs text-slate-500">First 25%</p>
          <p className="text-xl font-mono font-bold">{formatPace(firstPace)} /km</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Last 25%</p>
          <p className="text-xl font-mono font-bold">{formatPace(lastPace)} /km</p>
        </div>
        {dropPct !== null && (
          <div>
            <p className="text-xs text-slate-500">Pace drop</p>
            <p className={`text-xl font-mono font-bold ${cfg.color}`}>+{dropPct.toFixed(1)}%</p>
          </div>
        )}
      </div>
    </div>
  )
}
