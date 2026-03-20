const CACHE_NAME = 'video-cache-v1';

// We only want to cache the large video and thumbnail specifically
// to avoid filling up the general cache.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Intercept Vercel Blob or large media requests
  if (url.includes('public.blob.vercel-storage.com') || url.endsWith('.mp4')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          // console.log('Serving from cache:', url);
          return response;
        }
        return fetch(event.request).then((networkResponse) => {
          // Don't cache here automatically, we handle it in main.js
          // to give more control over when 150MB is downloaded.
          return networkResponse;
        });
      })
    );
  }
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
