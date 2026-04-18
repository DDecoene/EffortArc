import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../services/api'
import { useInsights } from '../hooks/useInsights'
import { useActivities } from '../hooks/useActivities'
import MetricCard from '../components/MetricCard'
import FitnessStatusBadge from '../components/FitnessStatusBadge'

function formatPace(minPerKm: number | null): string {
  if (!minPerKm) return '—'
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')} /km`
}

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

export default function Dashboard() {
  const { data: insights, loading: insightsLoading } = useInsights()
  const { data: activities, loading: activitiesLoading } = useActivities()
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

      {insights && (
        <div className="flex items-center gap-4">
          <FitnessStatusBadge status={insights.fitness_status.label} />
          {insights.fitness_status.recent_weekly_km && (
            <span className="text-slate-400 text-sm">
              {insights.fitness_status.recent_weekly_km.toFixed(1)} km/week avg
            </span>
          )}
          <span className="text-slate-500 text-sm">
            {insights.total_activities} activities total
          </span>
        </div>
      )}

      {weeklyData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Weekly Volume (km)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#22c55e' }}
              />
              <Area type="monotone" dataKey="longest_km" stroke="#22c55e" strokeWidth={2} fill="url(#volumeGrad)" />
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
            {recentActivities.map(a => (
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
                    <p className="text-sm text-slate-400">Pace</p>
                    <p className="font-medium">{formatPace(a.avg_moving_pace)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
