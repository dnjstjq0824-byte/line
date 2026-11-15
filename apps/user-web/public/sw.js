// F18: LUNO PWA service worker (user-web only; consoles stay online tools).
//
// CACHE_VERSION is stamped at build with the deploy commit (see
// scripts/pwa_stamp.cjs via build_cf.js), so every deploy retires the
// previous caches on activate. PRECACHE is the shell file list collected
// from the fresh dist at the same step.
//
// Strategy:
// - navigations: network first, cached shell on failure (offline opens the
//   app shell instead of the browser dinosaur);
// - same-origin static: cache first, populated at runtime;
// - /api/* and version.json: network only, never cached.
const CACHE_VERSION = '__LUNO_BUILD_ID__';
const SHELL_CACHE = `luno-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `luno-assets-${CACHE_VERSION}`;
const PRECACHE = JSON.parse('__LUNO_PRECACHE_JSON__');
const SHELL_URL = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('luno-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('version.json')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
        return res;
      }).catch(() => caches.match(SHELL_URL, { cacheName: SHELL_CACHE }).then((hit) => hit || Response.error()))
    );
    return;
  }
  if (url.origin === self.location.origin) {
    // All caches are searched: install-time precache lands in the shell
    // cache while runtime fills the asset cache.
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
        return res;
      }))
    );
  }
});
