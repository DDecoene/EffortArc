interface Props {
  label: string
  value: string
  sub?: string
}

export default function MetricCard({ label, value, sub }: Props) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-bold text-slate-100">{value}</span>
      {sub && <span className="text-sm text-slate-500">{sub}</span>}
    </div>
  )
}
