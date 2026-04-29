export type SportType = 'hiking' | 'cycling'

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
  sport_type: SportType
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

export function isCyclingType(activityType: string): boolean {
  return ['Ride', 'VirtualRide', 'EBikeRide'].includes(activityType)
}

export function isHikingType(activityType: string): boolean {
  return ['Hike', 'Walk'].includes(activityType)
}

export function sportCategoryFromType(activityType: string): SportType {
  return isCyclingType(activityType) ? 'cycling' : 'hiking'
}

/** Convert min/km pace to km/h speed */
export function paceToSpeed(minPerKm: number): number {
  return 60 / minPerKm
}

export function formatSpeed(minPerKm: number | null): string {
  if (!minPerKm) return '—'
  return `${paceToSpeed(minPerKm).toFixed(1)} km/h`
}

export function formatPace(minPerKm: number | null): string {
  if (!minPerKm) return '—'
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

export function formatMovingMetric(minPerKm: number | null, _activityType: string): string {
  return formatSpeed(minPerKm)
}

export function movingMetricLabel(_activityType: string): string {
  return 'Avg Speed'
}

export interface SportInsights {
  fitness_status: {
    label: 'building' | 'maintaining' | 'declining' | 'insufficient_data'
    recent_weekly_km: number | null
    trend_pct: number | null
  }
  weekly_volume: { week: string; longest_km: number }[]
  pace_trend_pct: number | null
  goal_readiness_data: {
    longest_recent_km?: number
    cardio_credit_km?: number
    effective_km?: number
    longest_training_km?: number
    commute_weekly_km?: number
    commute_credit_km?: number
  }
}

export interface InsightsData {
  hiking: SportInsights
  cycling: SportInsights
  recommendation: string
  total_activities: number
  fitness_status: { label: string; recent_weekly_km: number | null; trend_pct: number | null }
  weekly_volume: { week: string; longest_km: number }[]
  pace_trend_pct: number | null
}
