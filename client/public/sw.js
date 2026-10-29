// Service worker: makes the game installable and lets solo games start offline.
// `__BUILD__` is replaced per build (vite.config.ts), so every deploy gets a fresh cache and
// the previous one is dropped; within one build, static files are served from the cache.
const CACHE = 'legion-__BUILD__';
/** Server routes that must always reach the server (matchmaking, monitoring). */
const LIVE = /^\/(matchmake|health|stats|client-error)(\/|$)/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('legion-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || LIVE.test(url.pathname)) return;
  // The page: network first so a deploy shows up at once, the cached copy when offline.
  // Every deep link (?room=...) is the same page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((res) => res ?? Response.error())),
    );
    return;
  }
  // Bundles, sprites, icons: cache first, filled as the game loads them.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) void cache.put(req, res.clone());
            return res;
          }),
      ),
    ),
  );
});
