const CACHE_NAME = 'video-cache-v1';

// We only want to cache the large video and thumbnail specifically
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // FIX: ONLY intercept GET requests (downloads). 
  // DO NOT intercept PUT/POST requests (uploads).
  if (event.request.method !== 'GET') return;

  // Intercept Vercel Blob or large media requests
  if (url.includes('public.blob.vercel-storage.com') || url.endsWith('.mp4')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
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
