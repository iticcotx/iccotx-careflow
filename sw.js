/* ICCOTX CareFlow service worker — offline-capable PWA */
const CACHE = 'careflow-v3';
const CORE = ['./', 'index.html', 'catalog.json', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html') || url.pathname.endsWith('catalog.json');
  if (fresh) {
    // network-first: always try latest, fall back to cache offline
    e.respondWith(
      fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)).catch(()=>{}); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }
  // static assets: cache-first
  e.respondWith(
    caches.match(req).then(c => c || fetch(req).then(res => {
      const cp = res.clone(); caches.open(CACHE).then(ca => ca.put(req, cp)).catch(()=>{}); return res;
    }))
  );
});
