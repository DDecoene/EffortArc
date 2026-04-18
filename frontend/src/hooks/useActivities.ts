import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { ActivitySummary } from '../types'

export function useActivities() {
  const [data, setData] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getActivities()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
