const CACHE = 'kpsc-v2';
const SHELL = [
  '/kpsc/index.html',
  '/src/css/kpsc.css',
  '/src/js/kpsc.js',
];

self.addEventListener('install', e => {
  // Use allSettled so a slow/failed fetch on one asset doesn't abort install
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin requests — let external requests (fonts, CDN) pass through
  if (url.origin !== self.location.origin) return;

  // Network-only: API calls and public minutes
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/kpsc/minutes/')) return;

  // Navigation requests: cache-first with network fallback, never ERR_FAILED
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match('/kpsc/index.html')
        .then(cached => {
          if (cached) {
            // Revalidate in the background while serving instantly from cache
            fetch(request).then(res => {
              if (res.ok) caches.open(CACHE).then(c => c.put('/kpsc/index.html', res));
            }).catch(() => {});
            return cached;
          }
          return fetch(request).catch(() => caches.match('/kpsc/index.html'));
        })
    );
    return;
  }

  // Cache-first for all other same-origin assets; silently fall back on network error
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => new Response('', { status: 503 }));
    })
  );
});
