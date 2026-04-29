import type { Activity, ActivitySummary, Goal, Insights, SyncStatus, SportType } from '../types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  getAuthUrl: () => request<{ url: string }>('/auth/strava'),
  getAuthStatus: () => request<SyncStatus>('/auth/status'),
  sync: () => request<{ synced: number; total_new: number }>('/sync', { method: 'POST' }),
  backfill: (since: string) => {
    const adminToken = import.meta.env.VITE_ADMIN_SECRET ?? ''
    return request<{ synced: number; failed: number; since: string }>(`/sync/backfill?since=${since}`, {
      method: 'POST',
      headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
    })
  },

  getActivities: (sportType?: SportType) => {
    const qs = sportType ? `?sport_type=${sportType}` : ''
    return request<ActivitySummary[]>(`/activities${qs}`)
  },

  getActivity: (id: number) => request<Activity>(`/activities/${id}`),

  getInsights: (sportType?: SportType) => {
    const qs = sportType ? `?sport_type=${sportType}` : ''
    return request<Insights>(`/insights${qs}`)
  },

  getGoals: (sportType?: SportType) => {
    const qs = sportType ? `?sport_type=${sportType}` : ''
    return request<Goal[]>(`/goals${qs}`)
  },

  createGoal: (data: {
    name: string
    sport_type: SportType
    date: string
    distance_km: number
    elevation_gain_m?: number
    notes?: string
  }) =>
    request<Goal>('/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
