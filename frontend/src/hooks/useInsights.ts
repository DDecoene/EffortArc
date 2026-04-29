import { useState, useEffect } from 'react'
import { api } from '../services/api'
import type { Insights, SportType } from '../types'

export function useInsights(sportType?: SportType) {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setData(null)
    api.getInsights(sportType)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [sportType])

  return { data, loading, error }
}
