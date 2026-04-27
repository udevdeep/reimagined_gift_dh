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

  // Skip Vercel internal scripts and source maps to prevent 404 noise in console
  if (url.pathname.includes('/_vercel/') || url.pathname.endsWith('.map')) return;

  // Strategy: Cache-First for Media & Assets
  // EXPERT REFINEMENT: Cache thumbnails/images but let videos stream to avoid Safari range bugs
  const isVideo = url.pathname.match(/\.(mp4|webm|mov)$/i);
  const isThumb = url.href.includes('thumb') || url.pathname.includes('thumb');
  const isImageOrAsset = url.pathname.match(/\.(jpg|jpeg|png|webp|gif|svg|woff2)$/i);
  const isCacheableDomain = CACHEABLE_DOMAINS.some(domain => url.href.includes(domain));

  // Skip Service Worker for large videos, but DO cache video thumbnails
  if (isVideo && !isThumb) return;

  if (isImageOrAsset || isCacheableDomain || isThumb) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        // Try network and cache if successful
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
             const responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME).then((cache) => {
               cache.put(event.request, responseToCache);
             });
          }
          return networkResponse;
        }).catch(() => {
            // Fallback for failed fetches (privacy browsers)
            return fetch(event.request.url);
        });
      })
    );
  }
});
