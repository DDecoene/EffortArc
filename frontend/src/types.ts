export interface Segment {
  km_index: number
  pace: number | null
  elevation_change_m: number | null
  grade_adjusted_pace: number | null
  is_stop: boolean
}

export interface Activity {
  id: number
  strava_id: string
  name: string
  date: string
  type: string
  cleaned_distance_m: number | null
  moving_time_s: number | null
  elevation_gain_m: number | null
  avg_moving_pace: number | null
  segments: Segment[]
  cleaned_gpx: string | null
}

export interface ActivitySummary {
  id: number
  strava_id: string
  name: string
  date: string
  type: string
  cleaned_distance_m: number | null
  moving_time_s: number | null
  elevation_gain_m: number | null
  avg_moving_pace: number | null
}

export interface Goal {
  id: number
  name: string
  date: string
  distance_km: number
  elevation_gain_m: number | null
  notes: string | null
  created_at: string
  readiness: GoalReadiness | null
}

export interface GoalReadiness {
  status: 'ready' | 'on_track' | 'at_risk' | 'insufficient_data'
  message: string
  longest_recent_km?: number
  distance_gap_km?: number
  ready_date?: string
  growth_per_week_km?: number
}

export interface FitnessStatus {
  label: 'building' | 'maintaining' | 'declining' | 'insufficient_data'
  recent_weekly_km: number | null
  trend_pct: number | null
}

export interface Insights {
  fitness_status: FitnessStatus
  weekly_volume: Array<{ week: string; longest_km: number }>
  pace_trend_pct: number | null
  total_activities: number
}

export interface SyncStatus {
  last_synced_at: string | null
  is_connected: boolean
}
