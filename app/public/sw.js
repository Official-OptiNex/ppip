// Service worker: lets the app open instantly and work offline (data syncs when back online).
const CACHE = 'ppip-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './icon.svg', './manifest.webmanifest']))); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // part photos never change once uploaded -> cache first
    if (url.pathname.startsWith('/api/images/')) {
      e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    }
    return;
  }
  if (req.mode === 'navigate') {
    // network first for the page itself so updates show up right away
    e.respondWith(fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('./index.html', r.clone())); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  // hashed build assets: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok && url.pathname.startsWith('/assets/')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});
