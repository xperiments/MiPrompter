const CACHE_NAME = 'smui-static-v3';
const PRECACHE = [
  '/index.html',
  '/app.html',
  '/manifest.webmanifest'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {
      // Ignore cache errors in dev - files may not exist
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  // Clean up old caches
  evt.waitUntil(
    caches.keys().then((names) => 
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Simple cache-first strategy for navigation and static assets
self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);

  // Don't intercept navigation in dev mode (detect by checking if it's localhost with port > 1024)
  if (evt.request.mode === 'navigate') {
    const isDev = url.hostname === 'localhost' && parseInt(url.port) > 1024;
    if (isDev) {
      evt.respondWith(fetch(evt.request));
      return;
    }
    
    // In production: serve the correct HTML based on the path
    const isPresenterPath = url.pathname === '/app.html' || url.pathname.startsWith('/app.html');
    const htmlToServe = isPresenterPath ? '/app.html' : '/index.html';
    
    evt.respondWith(
      caches.match(htmlToServe).then((r) => r || fetch(evt.request))
    );
    return;
  }

  // try cache first, then network and cache
  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      if (cached) return cached;
      return fetch(evt.request)
        .then((res) => {
          // only cache GET and same-origin
          if (evt.request.method === 'GET' && res && res.type !== 'opaque') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(evt.request, copy));
          }
          return res;
        })
        .catch(() => {
          // fallback for images/icons
          if (evt.request.destination === 'image') return new Response('', { status: 404 });
          throw Error('network-fallback');
        });
    })
  );
});

// allow the app to trigger skipWaiting via postMessage
self.addEventListener('message', (evt) => {
  if (evt.data === 'skipWaiting') self.skipWaiting();
});
