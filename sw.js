/* ═══════════════════════════════════════
   SW.JS - Service Worker
   ═══════════════════════════════════════ */

const CACHE_NAME = 'soulreader-v0.3.0-beta';
const BASE = '/soulreader777';
const urlsToCache = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/css/base.css',
  BASE + '/css/layout.css',
  BASE + '/css/shelf.css',
  BASE + '/css/reader.css',
  BASE + '/css/sidebar.css',
  BASE + '/css/notes.css',
  BASE + '/css/settings.css',
  BASE + '/js/store.js',
  BASE + '/js/parser.js',
  BASE + '/js/ai.js',
  BASE + '/js/reader.js',
  BASE + '/js/notes.js',
  BASE + '/js/settings.js',
  BASE + '/js/app.js',
  BASE + '/manifest.json'
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

// 监听主线程发来的 skipWaiting 指令（"检查更新"按钮触发）
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
