const CACHE_NAME = 'video-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force update
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // FIX: ONLY intercept GET requests. 
  if (event.request.method !== 'GET') return;

  if (url.includes('public.blob.vercel-storage.com') || url.endsWith('.mp4')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Take control immediately
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
});
