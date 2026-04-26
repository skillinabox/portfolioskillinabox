// Skillinabox Portfolio — service worker
// Strategy: network-first for navigation (so users always get fresh React bundle),
// cache-first for hashed static assets, never cache API/Supabase calls.

const CACHE_VERSION = 'sib-portfolio-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`

self.addEventListener('install', (event) => {
  // Pre-cache app shell — the index page + manifest + icons
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        '/',
        '/manifest.webmanifest',
        '/icon-192.png',
        '/icon-512.png',
        '/apple-touch-icon.png',
      ]).catch(() => {/* if any fail, ignore — non-critical */})
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Clear old caches on update
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept API calls, Supabase, or any non-GET — always go to network
  if (event.request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.hostname.includes('supabase')) return
  if (url.hostname.includes('fashn.ai')) return
  if (url.hostname.includes('razorpay')) return
  if (url.hostname.includes('anthropic')) return

  // Navigation requests (HTML) → network-first, fall back to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Cache fresh HTML in background
          const copy = res.clone()
          caches.open(STATIC_CACHE).then((c) => c.put(event.request, copy))
          return res
        })
        .catch(() => caches.match('/').then((cached) => cached || new Response('Offline', { status: 503 })))
    )
    return
  }

  // Hashed static assets (JS/CSS/fonts/images) → cache-first
  if (url.origin === location.origin && /\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(event.request, copy))
          }
          return res
        })
      })
    )
    return
  }

  // Everything else: just fetch
})
