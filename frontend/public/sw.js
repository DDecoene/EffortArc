const CACHE_NAME = 'hiketracker-v1'
const STATIC_ASSETS = ['/', '/dashboard', '/progress', '/goals']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/') || event.request.url.includes(':8000')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(event.request))
    )
  } else {
    event.respondWith(
      caches.match(event.request).then(cached => cached ?? fetch(event.request))
    )
  }
})
