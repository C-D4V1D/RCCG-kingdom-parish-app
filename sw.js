const CACHE = 'kpadmin-v7';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/dist/css/styles.css',
  '/dist/js/app.js',
];

function isAppShellAsset(pathname) {
  return pathname === '/'
    || pathname === '/index.html'
    || pathname === '/manifest.json'
    || pathname === '/dist/css/styles.css'
    || pathname === '/dist/js/app.js';
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

// Serve from cache immediately for speed, then refresh the cache in the
// background so the next load picks up a new deployment. This keeps the big
// bundles (app.js / styles.css) instant on slow links. networkFirst here was a
// mistake: it blocked every page load on re-downloading the full ~430 KB app.js
// over the network, which stalled slow parish connections — even though a good
// cached copy was already on the device.
async function staleWhileRevalidate(request, cacheKey = request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey);
  // Kick off a background refresh regardless of a cache hit, so the cache is
  // up to date for the next load. Never blocks the response when we have a hit.
  const networked = fetch(request)
    .then(res => { if (res.ok) cache.put(cacheKey, res.clone()); return res; })
    .catch(() => null);
  if (cached) return cached;
  const res = await networked;
  if (res) return res;
  throw new Error('Offline');
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

  // App shell bundles (CSS/JS/manifest) — serve instantly from cache and refresh
  // in the background. Fast on slow links; a new deploy appears on the next load.
  if (isAppShellAsset(url.pathname)) {
    e.respondWith(
      staleWhileRevalidate(request, url.pathname).catch(() => caches.match(url.pathname))
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
