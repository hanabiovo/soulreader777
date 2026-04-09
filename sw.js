/* ═══════════════════════════════════════
   SW.JS - Service Worker
   ═══════════════════════════════════════ */

const CACHE_NAME = 'soulreader-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/shelf.css',
  '/css/reader.css',
  '/css/sidebar.css',
  '/css/notes.css',
  '/css/settings.css',
  '/js/store.js',
  '/js/parser.js',
  '/js/ai.js',
  '/js/reader.js',
  '/js/notes.js',
  '/js/settings.js',
  '/js/app.js',
  '/manifest.json'
];

// 安装
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// 激活
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求
self.addEventListener('fetch', event => {
  // 跳过外部 CDN 请求
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          // 不缓存非 GET 请求
          if (event.request.method !== 'GET') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
  );
});
