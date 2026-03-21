const CACHE_NAME = 'archive-media-v3';

// Storage domains we want to cache
const CACHEABLE_DOMAINS = [
  'public.blob.vercel-storage.com',
  'firebasestorage.googleapis.com',
  'firebasestorage.googleapis.com/v0/b/', // Specific Firebase Storage path
  'images.unsplash.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (event.request.method !== 'GET') return;

  // Strategy: Cache-First for Media & Assets
  const isMedia = url.pathname.match(/\.(mp4|webm|jpg|jpeg|png|webp|gif|svg|woff2)$/i);
  const isCacheableDomain = CACHEABLE_DOMAINS.some(domain => url.href.includes(domain));

  if (isMedia || isCacheableDomain) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((networkResponse) => {
          // Check if valid response before caching
          // We allow 'cors' and 'basic' types. 'opaque' is excluded to prevent cache bloating 
          // but we ensure our UI uses crossorigin="anonymous" to get 'cors' types.
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          if (networkResponse.type === 'basic' || networkResponse.type === 'cors') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return networkResponse;
        }).catch(() => {
          return null;
        });
      })
    );
  }
});
