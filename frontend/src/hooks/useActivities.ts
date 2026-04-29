import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { ActivitySummary, SportType } from '../types'

export function useActivities(sportType?: SportType) {
  const [data, setData] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setData([])
    api.getActivities(sportType)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sportType])

  return { data, loading, error }
}
