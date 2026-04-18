import { useEffect, useRef } from 'react'

interface Point {
  lat: number
  lon: number
  ele: number
  is_stop?: boolean
}

interface Props {
  points: Point[]
}

export default function ActivityMap({ points }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || points.length === 0) return
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
    }

    import('leaflet').then(L => {
      const map = L.map(mapRef.current!).setView([points[0].lat, points[0].lon], 13)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      const track = points.filter(p => !p.is_stop).map(p => [p.lat, p.lon] as [number, number])
      L.polyline(track, { color: '#22c55e', weight: 3 }).addTo(map)

      const stops = points.filter(p => p.is_stop)
      stops.forEach(p => {
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.8,
        }).addTo(map)
      })

      const bounds = L.latLngBounds(track)
      map.fitBounds(bounds, { padding: [20, 20] })
    })

    return () => {
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [points])

  return <div ref={mapRef} className="h-72 rounded-xl overflow-hidden" />
}
