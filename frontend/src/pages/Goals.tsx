import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { Goal, SportType } from '../types'

const STATUS_CONFIG = {
  ready: { color: 'text-green-400', bg: 'bg-green-900/30', icon: '✓' },
  on_track: { color: 'text-blue-400', bg: 'bg-blue-900/30', icon: '→' },
  at_risk: { color: 'text-red-400', bg: 'bg-red-900/30', icon: '⚠' },
  insufficient_data: { color: 'text-slate-400', bg: 'bg-slate-700/30', icon: '?' },
}

const SPORT_TABS: { label: string; value: SportType | undefined }[] = [
  { label: 'All', value: undefined },
  { label: '🥾 Hiking', value: 'hiking' },
  { label: '🚴 Cycling', value: 'cycling' },
]

const SPORT_ICONS: Record<SportType, string> = {
  hiking: '🥾',
  cycling: '🚴',
}

export default function Goals() {
  const [sport, setSport] = useState<SportType | undefined>(undefined)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{
    name: string
    sport_type: SportType
    date: string
    distance_km: string
    elevation_gain_m: string
    notes: string
  }>({ name: '', sport_type: 'hiking', date: '', distance_km: '', elevation_gain_m: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getGoals(sport).then(setGoals).finally(() => setLoading(false))
  }, [sport])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.createGoal({
        name: form.name,
        sport_type: form.sport_type,
        date: new Date(form.date).toISOString(),
        distance_km: Number(form.distance_km),
        elevation_gain_m: form.elevation_gain_m ? Number(form.elevation_gain_m) : undefined,
        notes: form.notes || undefined,
      })
      const updated = await api.getGoals(sport)
      setGoals(updated)
      setShowForm(false)
      setForm({ name: '', sport_type: 'hiking', date: '', distance_km: '', elevation_gain_m: '', notes: '' })
    } finally {
      setSaving(false)
    }
  }

  const distancePlaceholder = form.sport_type === 'cycling' ? 'e.g. 100' : 'e.g. 40'
  const elevationHelp = form.sport_type === 'cycling' ? 'optional' : 'optional'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Goals</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-slate-900 text-sm font-medium transition-colors"
        >
          + Add Goal
        </button>
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

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="font-medium">New Goal</h3>

          <div>
            <label className="text-sm text-slate-400 block mb-2">Sport</label>
            <div className="flex gap-2">
              {(['hiking', 'cycling'] as SportType[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, sport_type: s }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    form.sport_type === s
                      ? 'bg-brand text-slate-900'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {SPORT_ICONS[s]} {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Event name</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder={form.sport_type === 'cycling' ? 'e.g. Gran Fondo 100km' : 'e.g. Dodentocht 100km'}
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Event date</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Distance (km)</label>
              <input
                required
                type="number"
                value={form.distance_km}
                onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder={distancePlaceholder}
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 block mb-1">Elevation gain (m, {elevationHelp})</label>
              <input
                type="number"
                value={form.elevation_gain_m}
                onChange={e => setForm(f => ({ ...f, elevation_gain_m: e.target.value }))}
                className="w-full bg-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="e.g. 500"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand text-slate-900 text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Goal'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : goals.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">No goals yet. Add your first goal to get a readiness assessment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const cfg = STATUS_CONFIG[goal.readiness?.status ?? 'insufficient_data']
            return (
              <div key={goal.id} className="bg-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{SPORT_ICONS[goal.sport_type]}</span>
                      <h3 className="font-semibold text-lg">{goal.name}</h3>
                    </div>
                    <p className="text-slate-400 text-sm">
                      {goal.distance_km}km · {new Date(goal.date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon} {goal.readiness?.status?.replace('_', ' ') ?? 'no data'}
                  </span>
                </div>
                {goal.readiness?.message && (
                  <p className={`text-sm ${cfg.color}`}>{goal.readiness.message}</p>
                )}
                {goal.readiness?.longest_recent_km != null && (
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-slate-400">Current max: </span>
                      <span className="font-medium">{goal.readiness.longest_recent_km.toFixed(1)}km</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Gap: </span>
                      <span className="font-medium">{goal.readiness.distance_gap_km?.toFixed(1)}km</span>
                    </div>
                    {goal.readiness.growth_per_week_km != null && (
                      <div>
                        <span className="text-slate-400">Build rate: </span>
                        <span className="font-medium">+{goal.readiness.growth_per_week_km.toFixed(1)}km/week</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
