const CACHE_NAME = 'rollcall-student-portal-v3-navigation-safe';
const META_KEY = new URL('./__student-cache-meta__', self.registration.scope).pathname;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const PRECACHE_URLS = [
  './index.html',
  './student-modern.css',
  './student-modern.js',
  './dynamic-class-loader.js?v=20260212',
  './student-data-cache.js',
  './timetable-cache.js',
  '../shared/image-cache.js',
  '../shared/profile-upload.js',
  '../shared/password-reset.js',
  '../shared/search-autofill.js',
  '../shared/account-block-status.js',
  '../shared/portal-loader.js?v=20261022-v1',
  '../shared/install-pwa.js',
  '../auth/subscription-expiry.js'
];

function isStudentAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith(new URL('./', self.registration.scope).pathname) ||
    url.pathname.startsWith(new URL('../shared/', self.registration.scope).pathname) ||
    url.pathname.startsWith(new URL('../auth/', self.registration.scope).pathname);
}

async function readCacheTimestamp(cache) {
  const response = await cache.match(META_KEY);
  if (!response) return 0;
  try { return Number((await response.json()).cachedAt || 0); } catch (_) { return 0; }
}

async function writeCacheTimestamp(cache) {
  await cache.put(META_KEY, new Response(JSON.stringify({ cachedAt: Date.now() }), {
    headers: { 'content-type': 'application/json' }
  }));
}

async function refreshAsset(request, cache) {
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function refreshPrecache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PRECACHE_URLS.map(async url => {
    try { await refreshAsset(new Request(new URL(url, self.registration.scope)), cache); } catch (_) { /* offline install */ }
  }));
  await writeCacheTimestamp(cache);
}

self.addEventListener('install', event => {
  event.waitUntil(refreshPrecache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !isStudentAsset(event.request)) return;
  // Never return a cached/redirected HTML navigation from the worker on Safari.
  // Static CSS/JS/images remain eligible for the offline cache below.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    const cachedAt = await readCacheTimestamp(cache);
    const fresh = cached && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS;

    if (fresh) {
      event.waitUntil(refreshAsset(event.request, cache).catch(() => {}));
      return cached;
    }

    try {
      const response = await refreshAsset(event.request, cache);
      await writeCacheTimestamp(cache);
      return response;
    } catch (_) {
      if (cached) return cached;
      return caches.match(new URL('./index.html', self.registration.scope).pathname);
    }
  })());
});
