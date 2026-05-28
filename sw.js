const CACHE = 'kpadmin-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/css/styles.css',
  '/src/js/app.js',
];

function isAppShellAsset(pathname) {
  return pathname === '/'
    || pathname === '/index.html'
    || pathname === '/manifest.json'
    || pathname === '/src/css/styles.css'
    || pathname === '/src/js/app.js';
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
    throw new Error('Offline');
  }
}

self.addEventListener('install', e => {
  // allSettled so one slow/failed asset doesn't abort install
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Only delete our own old cache versions. CacheStorage is per-origin, so the
  // KPSC service worker's cache (kpsc-v*) lives alongside ours — wiping anything
  // that isn't ours would silently break the other portal's offline shell.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('kpadmin-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin; let CDN/font/external requests pass through
  if (url.origin !== self.location.origin) return;

  // Never cache: API calls (auth/data), and other portals that own their own SW or static state
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/kpsc/')) return;
  if (url.pathname.startsWith('/partnership/')) return;

  // Only handle GET; POST/PUT/DELETE go straight to network
  if (request.method !== 'GET') return;

  // Navigation requests: always try network first so new deployments show on reload;
  // fall back to cached shell when offline. Cache key MUST be the actual URL for
  // non-root navigations — otherwise visiting /install/ would overwrite the cached
  // /index.html with the install page, and the next offline launch of "/" would
  // serve the install instructions instead of the login screen.
  if (request.mode === 'navigate') {
    const isRootNav = url.pathname === '/' || url.pathname === '/index.html';
    const cacheKey = isRootNav ? '/index.html' : request;
    e.respondWith(
      networkFirst(request, cacheKey)
        .catch(() => caches.match(cacheKey).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // App shell assets — prefer network so CSS/JS updates appear immediately
  if (isAppShellAsset(url.pathname)) {
    e.respondWith(
      networkFirst(request, url.pathname).catch(() => caches.match(url.pathname))
    );
    return;
  }

  // Other same-origin assets (icons, etc.) — cache-first, silent offline fallback
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
