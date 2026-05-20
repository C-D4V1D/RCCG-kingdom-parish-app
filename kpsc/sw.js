const CACHE = 'kpsc-v3';
const SHELL = [
  '/kpsc/index.html',
  '/kpsc/manifest.json',
  '/src/css/kpsc.css',
  '/src/js/kpsc.js',
];

function isAppShellAsset(pathname) {
  return pathname === '/kpsc/index.html'
    || pathname === '/kpsc/'
    || pathname === '/src/css/kpsc.css'
    || pathname === '/src/js/kpsc.js'
    || pathname === '/kpsc/manifest.json';
}

async function networkFirst(request, cacheKey = request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw new Error('offline');
  }
}

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

  // Navigation requests: always prefer the network so new deployments appear on reload
  if (request.mode === 'navigate') {
    e.respondWith(
      networkFirst(request, '/kpsc/index.html')
        .catch(() => caches.match('/kpsc/index.html'))
    );
    return;
  }

  // App shell assets should also prefer the network so CSS/JS updates show immediately
  if (isAppShellAsset(url.pathname)) {
    e.respondWith(
      networkFirst(request, url.pathname).catch(() => caches.match(url.pathname))
    );
    return;
  }

  // Cache-first for other same-origin assets; silently fall back on network error
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
        .catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
