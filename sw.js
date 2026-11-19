const CACHE_NAME = 'zero-two-five-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/css/style.css',
  './src/js/main.js',
  './src/js/ui.js',
  './src/js/engine.js',
  './src/js/ai.js',
  './src/js/audio.js',
  './src/js/constants.js',
  './src/js/mqtt_client.js',
  './src/js/online.js',
  './assets/tokens/0_token.png',
  './assets/tokens/0_verso.png',
  './assets/tokens/2_token.png',
  './assets/tokens/2_verso.png',
  './assets/tokens/5_token.png',
  './assets/tokens/5_verso.png',
  './assets/tokens/1st_player_pt.png',
  './assets/tokens/1st_player_en.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isImageRequest(pathname) {
  return /\.(png|jpg|jpeg|svg|ico)$/i.test(pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (isImageRequest(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
