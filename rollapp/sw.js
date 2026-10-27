const CACHE_NAME = 'rollcall-v3-navigation-safe';
const START_URL = new URL('index.html', self.registration.scope).pathname;
const PRECACHE_URLS = [START_URL];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url)
            .then((res) => (res.ok && !res.redirected ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Safari does not allow a service worker to serve a redirected navigation
  // response. Let portal/document navigations go directly to the network.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached && !cached.redirected) return cached;
      return fetch(event.request).catch(() => caches.match(START_URL));
    })
  );
});
