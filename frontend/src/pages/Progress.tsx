import { useState } from 'react'
import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { SportType } from '../types'
import { paceToSpeed } from '../types'

const SPORT_TABS: { label: string; value: SportType | undefined }[] = [
  { label: 'All', value: undefined },
  { label: '🥾 Hiking', value: 'hiking' },
  { label: '🚴 Cycling', value: 'cycling' },
]

const FITNESS_LABEL: Record<string, string> = {
  building: 'Building',
  maintaining: 'Maintaining',
  declining: 'Declining',
  insufficient_data: 'Not enough data',
}

const FITNESS_COLOR: Record<string, string> = {
  building: 'text-green-400',
  maintaining: 'text-blue-400',
  declining: 'text-red-400',
  insufficient_data: 'text-slate-400',
}

export default function Progress() {
  const [sport, setSport] = useState<SportType | undefined>(undefined)
  const { data: insights, loading } = useInsights(undefined)
  const { data: activities } = useActivities(sport)

  const tooltipStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }

  const hikingInsights = insights?.hiking
  const cyclingInsights = insights?.cycling
  const recommendation = insights?.recommendation

  const paceData = [...activities]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter(a => a.avg_moving_pace)
    .map(a => ({
      date: new Date(a.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      value: paceToSpeed(a.avg_moving_pace!),
    }))

  const activeWeeklyVolume = sport === 'cycling'
    ? cyclingInsights?.weekly_volume ?? []
    : sport === 'hiking'
    ? hikingInsights?.weekly_volume ?? []
    : insights?.weekly_volume ?? []

  const chartColor = sport === 'cycling' ? '#f59e0b' : '#22c55e'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Progress</h2>
      </div>

      <div className="flex gap-2">
        {SPORT_TABS.map(tab => (
          <button
            key={tab.label}
            onClick={() => setSport(tab.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sport === tab.value
                ? 'bg-brand text-slate-900'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-400">Loading...</p>}

      {recommendation && (
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-5">
          <p className="text-xs text-amber-400 uppercase tracking-wider font-medium mb-2">This week's focus</p>
          <p className="text-slate-100 text-sm leading-relaxed">{recommendation}</p>
        </div>
      )}

      {(hikingInsights || cyclingInsights) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hikingInsights && (
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">🥾 Hiking</span>
                <span className={`text-sm font-semibold ${FITNESS_COLOR[hikingInsights.fitness_status.label]}`}>
                  {FITNESS_LABEL[hikingInsights.fitness_status.label]}
                </span>
              </div>
              {hikingInsights.fitness_status.recent_weekly_km != null && (
                <p className="text-2xl font-bold">
                  {hikingInsights.fitness_status.recent_weekly_km.toFixed(1)}
                  <span className="text-sm text-slate-400 font-normal ml-1">km/week</span>
                </p>
              )}
              <div className="text-xs text-slate-400 space-y-1">
                {hikingInsights.goal_readiness_data.longest_recent_km != null && (
                  <div>Longest recent: <span className="text-slate-200">{hikingInsights.goal_readiness_data.longest_recent_km.toFixed(1)}km</span></div>
                )}
                {(hikingInsights.goal_readiness_data.cardio_credit_km ?? 0) > 0 && (
                  <div>Cycling cardio credit: <span className="text-slate-200">+{hikingInsights.goal_readiness_data.cardio_credit_km!.toFixed(1)}km</span></div>
                )}
                {hikingInsights.goal_readiness_data.effective_km != null && (
                  <div>Effective readiness: <span className="text-green-400 font-medium">{hikingInsights.goal_readiness_data.effective_km.toFixed(1)}km</span></div>
                )}
              </div>
            </div>
          )}

          {cyclingInsights && (
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">🚴 Cycling</span>
                <span className={`text-sm font-semibold ${FITNESS_COLOR[cyclingInsights.fitness_status.label]}`}>
                  {FITNESS_LABEL[cyclingInsights.fitness_status.label]}
                </span>
              </div>
              {cyclingInsights.fitness_status.recent_weekly_km != null && (
                <p className="text-2xl font-bold">
                  {cyclingInsights.fitness_status.recent_weekly_km.toFixed(1)}
                  <span className="text-sm text-slate-400 font-normal ml-1">km/week</span>
                </p>
              )}
              <div className="text-xs text-slate-400 space-y-1">
                <div>Longest training ride: <span className="text-slate-200">{(cyclingInsights.goal_readiness_data.longest_training_km ?? 0).toFixed(1)}km</span></div>
                {cyclingInsights.goal_readiness_data.commute_weekly_km != null && (
                  <div>Commute avg: <span className="text-slate-200">{cyclingInsights.goal_readiness_data.commute_weekly_km.toFixed(1)}km/week</span></div>
                )}
                {(cyclingInsights.goal_readiness_data.commute_credit_km ?? 0) > 0 && (
                  <div>Commute fitness credit: <span className="text-slate-200">+{cyclingInsights.goal_readiness_data.commute_credit_km!.toFixed(1)}km</span></div>
                )}
                {cyclingInsights.goal_readiness_data.effective_km != null && (
                  <div>Effective readiness: <span className="text-amber-400 font-medium">{cyclingInsights.goal_readiness_data.effective_km.toFixed(1)}km</span></div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeWeeklyVolume.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Longest session per week (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={activeWeeklyVolume}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="longest_km" stroke={chartColor} strokeWidth={2} fill="url(#volGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {paceData.length > 0 && sport !== 'cycling' && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Avg speed trend (km/h)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v?.toFixed(0)}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} km/h`, 'Speed']} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && activities.length === 0 && (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No data yet. Sync your Strava activities to see progress.</p>
        </div>
      )}
    </div>
  )
}
