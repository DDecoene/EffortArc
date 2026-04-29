import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../services/api'
import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import MetricCard from '../components/MetricCard'
import FitnessStatusBadge from '../components/FitnessStatusBadge'
import type { SportType } from '../types'
import { formatPace, formatSpeed, formatMovingMetric, movingMetricLabel, isCyclingType } from '../types'

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDistance(meters: number | null): string {
  if (!meters) return '—'
  return `${(meters / 1000).toFixed(1)} km`
}

const SPORT_TABS: { label: string; value: SportType | undefined }[] = [
  { label: 'All', value: undefined },
  { label: '🥾 Hiking', value: 'hiking' },
  { label: '🚴 Cycling', value: 'cycling' },
]

export default function Dashboard() {
  const [sport, setSport] = useState<SportType | undefined>(undefined)
  const { data: insights, loading: insightsLoading } = useInsights(sport)
  const { data: activities, loading: activitiesLoading } = useActivities(sport)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await api.sync()
      setSyncResult(`Synced ${result.synced} new activities`)
      window.location.reload()
    } catch (e: any) {
      setSyncResult(e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleConnect() {
    const { url } = await api.getAuthUrl()
    window.location.href = url
  }

  const recentActivities = activities.slice(0, 5)
  const weeklyData = insights?.weekly_volume?.slice(-12) ?? []

  const chartColor = sport === 'cycling' ? '#f59e0b' : '#22c55e'
  const gradientId = sport === 'cycling' ? 'volumeGradCycling' : 'volumeGradHiking'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-3">
          {syncResult && <span className="text-sm text-slate-400">{syncResult}</span>}
          <button
            onClick={handleConnect}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors"
          >
            Connect Strava
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-slate-900 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
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

      {insights && (
        <div className="flex items-center gap-4">
          <FitnessStatusBadge status={insights.fitness_status.label} />
          {insights.fitness_status.recent_weekly_km && (
            <span className="text-slate-400 text-sm">
              {insights.fitness_status.recent_weekly_km.toFixed(1)} km/week avg
            </span>
          )}
          <span className="text-slate-500 text-sm">
            {insights.total_activities} {sport ?? 'total'} activities
          </span>
        </div>
      )}

      {weeklyData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Weekly Volume (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: chartColor }}
              />
              <Area type="monotone" dataKey="longest_km" stroke={chartColor} strokeWidth={2} fill={`url(#${gradientId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-3">Recent Activities</h3>
        {activitiesLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : recentActivities.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-8 text-center">
            <p className="text-slate-400">No activities yet. Connect Strava and sync to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivities.map(a => {
              const cycling = isCyclingType(a.type)
              return (
                <Link
                  key={a.id}
                  to={`/activities/${a.id}`}
                  className="flex items-center justify-between bg-slate-800 hover:bg-slate-700 rounded-xl p-4 transition-colors"
                >
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-sm text-slate-400">
                      {new Date(a.date).toLocaleDateString()} · {a.type}
                    </p>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div>
                      <p className="text-sm text-slate-400">Distance</p>
                      <p className="font-medium">{formatDistance(a.cleaned_distance_m)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Time</p>
                      <p className="font-medium">{formatDuration(a.moving_time_s)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">{movingMetricLabel(a.type)}</p>
                      <p className="font-medium">{formatMovingMetric(a.avg_moving_pace, a.type)}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
