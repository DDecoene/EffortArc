import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

export default function Progress() {
  const { data: insights, loading } = useInsights()
  const { data: activities } = useActivities()

  if (loading) return <p className="text-slate-400">Loading...</p>

  const weeklyVolume = insights?.weekly_volume ?? []

  const longestByMonth = activities
    .reduce((acc, a) => {
      const key = new Date(a.date).toLocaleDateString('en', { year: '2-digit', month: 'short' })
      const km = (a.cleaned_distance_m ?? 0) / 1000
      if (!acc[key] || acc[key] < km) acc[key] = km
      return acc
    }, {} as Record<string, number>)

  const longestData = Object.entries(longestByMonth).map(([month, km]) => ({ month, km }))

  const paceData = [...activities]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter(a => a.avg_moving_pace)
    .map(a => ({
      date: new Date(a.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      pace: a.avg_moving_pace,
    }))

  const projectionData = (() => {
    if (weeklyVolume.length < 4) return []
    const last = weeklyVolume[weeklyVolume.length - 1]
    const growth = (weeklyVolume[weeklyVolume.length - 1].longest_km - weeklyVolume[0].longest_km) / weeklyVolume.length
    return Array.from({ length: 8 }, (_, i) => ({
      week: `+${i + 1}w`,
      projected: Math.max(0, last.longest_km + (i + 1) * growth),
    }))
  })()

  const tooltipStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Progress</h2>

      {insights?.pace_trend_pct != null && (
        <div className="bg-slate-800 rounded-xl p-5 flex items-center gap-4">
          <div>
            <p className="text-sm text-slate-400">Pace trend (overall)</p>
            <p className={`text-2xl font-bold ${insights.pace_trend_pct < 0 ? 'text-green-400' : 'text-red-400'}`}>
              {insights.pace_trend_pct > 0 ? '+' : ''}{insights.pace_trend_pct.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500">{insights.pace_trend_pct < 0 ? 'Getting faster' : 'Slowing down'}</p>
          </div>
        </div>
      )}

      {longestData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Longest Walk per Month (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={longestData}>
              <defs>
                <linearGradient id="longGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="km" stroke="#22c55e" strokeWidth={2} fill="url(#longGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {paceData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Grade-Adjusted Pace Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} reversed tickFormatter={v => `${v?.toFixed(0)}'`} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="pace" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {projectionData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-1">Projection: Longest Walk</h3>
          <p className="text-xs text-slate-500 mb-4">If you keep this up...</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {activities.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No data yet. Sync your Strava activities to see progress.</p>
        </div>
      )}
    </div>
  )
}
