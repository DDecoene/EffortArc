import type { Activity, ActivitySummary, Goal, Insights, SyncStatus } from '../types'

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
  getActivities: () => request<ActivitySummary[]>('/activities'),
  getActivity: (id: number) => request<Activity>(`/activities/${id}`),
  getInsights: () => request<Insights>('/insights'),
  getGoals: () => request<Goal[]>('/goals'),
  createGoal: (data: { name: string; date: string; distance_km: number; elevation_gain_m?: number; notes?: string }) =>
    request<Goal>('/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
