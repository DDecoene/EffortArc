import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '../services/api'
import type { Activity } from '../types'
import MetricCard from '../components/MetricCard'
import FatigueIndicator from '../components/FatigueIndicator'
import ActivityMap from '../components/ActivityMap'

function formatPace(v: number | null) {
  if (!v) return '—'
  const m = Math.floor(v), s = Math.round((v - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}
function formatDuration(s: number | null) {
  if (!s) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatDistance(m: number | null) {
  if (!m) return '—'
  return `${(m / 1000).toFixed(2)} km`
}

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.getActivity(Number(id))
      .then(setActivity)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-slate-400">Loading...</p>
  if (!activity) return <p className="text-red-400">Activity not found.</p>

  const cleanedPoints: any[] = activity.cleaned_gpx ? JSON.parse(activity.cleaned_gpx) : []

  const elevationData = cleanedPoints
    .filter((_, i) => i % 5 === 0)
    .map((p, i) => ({ dist: i * 0.05, ele: p.ele }))

  const paceData = (activity.segments ?? [])
    .filter(s => !s.is_stop && s.grade_adjusted_pace)
    .map(s => ({ km: s.km_index, pace: s.grade_adjusted_pace }))

  const moving = (activity.segments ?? []).filter(s => !s.is_stop && s.grade_adjusted_pace)
  const quarter = Math.max(1, Math.floor(moving.length / 4))
  const firstPace = moving.slice(0, quarter).reduce((a, b) => a + (b.grade_adjusted_pace ?? 0), 0) / (quarter || 1)
  const lastPace = moving.slice(-quarter).reduce((a, b) => a + (b.grade_adjusted_pace ?? 0), 0) / (quarter || 1)
  const dropPct = firstPace > 0 ? ((lastPace - firstPace) / firstPace) * 100 : null
  const fatigueLabel = dropPct === null ? 'insufficient_data'
    : dropPct < 5 ? 'stable'
    : dropPct < 15 ? 'moderate_fatigue'
    : 'strong_slowdown'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-slate-400 hover:text-slate-100">← Back</Link>
        <h2 className="text-2xl font-bold">{activity.name}</h2>
        <span className="text-slate-500 text-sm">
          {new Date(activity.date).toLocaleDateString()} · {activity.type}
        </span>
      </div>

      {cleanedPoints.length > 0 && <ActivityMap points={cleanedPoints} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Distance" value={formatDistance(activity.cleaned_distance_m)} />
        <MetricCard label="Moving Time" value={formatDuration(activity.moving_time_s)} />
        <MetricCard label="Avg Pace" value={formatPace(activity.avg_moving_pace)} sub="grade-adjusted" />
        <MetricCard label="Elevation Gain" value={activity.elevation_gain_m ? `${Math.round(activity.elevation_gain_m)}m` : '—'} />
      </div>

      {elevationData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Elevation Profile</h3>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={elevationData}>
              <defs>
                <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="dist" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(1)}km`} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}m`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} labelStyle={{ color: '#94a3b8' }} />
              <Area type="monotone" dataKey="ele" stroke="#6366f1" strokeWidth={2} fill="url(#eleGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {paceData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-4">Grade-Adjusted Pace per km</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={paceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="km" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `km ${v}`} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v?.toFixed(0)}'`} reversed />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="pace" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <FatigueIndicator
        firstPace={firstPace || null}
        lastPace={lastPace || null}
        dropPct={dropPct}
        label={fatigueLabel}
      />

      {activity.segments && activity.segments.length > 0 && (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <div className="p-5 pb-3">
            <h3 className="text-sm text-slate-400 uppercase tracking-wider">Segment Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-5 py-2 text-left text-slate-400 font-normal">km</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Pace</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Adj. Pace</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Ele. Δ</th>
                <th className="px-5 py-2 text-right text-slate-400 font-normal">Stop</th>
              </tr>
            </thead>
            <tbody>
              {activity.segments.map(s => (
                <tr key={s.km_index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-5 py-2 font-mono">{s.km_index}</td>
                  <td className="px-5 py-2 text-right font-mono">{formatPace(s.pace)}</td>
                  <td className="px-5 py-2 text-right font-mono text-brand">{formatPace(s.grade_adjusted_pace)}</td>
                  <td className="px-5 py-2 text-right font-mono">{s.elevation_change_m != null ? `${Math.round(s.elevation_change_m)}m` : '—'}</td>
                  <td className="px-5 py-2 text-right">{s.is_stop ? '⏸' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
