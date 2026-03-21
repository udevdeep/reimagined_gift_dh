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

  // Strategy: Cache-First for Media & Assets (EXCLUDING large videos to avoid Safari Range Request bugs)
  const isVideo = url.pathname.match(/\.(mp4|webm|mov)$/i);
  const isImageOrAsset = url.pathname.match(/\.(jpg|jpeg|png|webp|gif|svg|woff2)$/i);
  const isCacheableDomain = CACHEABLE_DOMAINS.some(domain => url.href.includes(domain));

  // Skip Service Worker for videos - let the browser's native streaming handle them
  if (isVideo) return;

  if (isImageOrAsset || isCacheableDomain) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        // Try CORS fetch first (to allow caching)
        return fetch(event.request).then((networkResponse) => {
          // If valid response, try to cache it
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
            // FALLBACK: If CORS fetch fails, try again without forcing CORS logic 
            // This allows images to show up even if they can't be cached.
            return fetch(event.request.url);
        });
      })
    );
  }
});
