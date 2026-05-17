const CACHE = 'kpsc-v1';
const SHELL = [
  '/kpsc/',
  '/kpsc/index.html',
  '/src/css/kpsc.css',
  '/src/js/kpsc.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
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

  // Always go to network for API calls
  if (url.pathname.startsWith('/api/')) return;

  // Network-only for public minutes (dynamic content)
  if (url.pathname.startsWith('/kpsc/minutes/')) return;

  // For navigation requests serve cached shell, falling back to network
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match('/kpsc/index.html').then(r => r || fetch(request))
    );
    return;
  }

  // Cache-first for all other assets within scope
  e.respondWith(
    caches.match(request).then(r => r || fetch(request).then(res => {
      if (res.ok && url.pathname.startsWith('/kpsc/')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
      }
      return res;
    }))
  );
});
