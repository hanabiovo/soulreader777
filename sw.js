/* ═══════════════════════════════════════
   SW.JS - Service Worker
   ═══════════════════════════════════════ */

const CACHE_NAME = 'soulreader-v0.3.8-beta';

// 动态计算 BASE：取 sw.js 所在目录，避免硬编码路径导致缓存 URL 与实际请求不匹配
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

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

// 安装：缓存所有资源，立即 skipWaiting
// Network-First 策略下旧 SW 已能拿到最新资源，无需等待用户手动触发
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// 激活：清除旧版缓存，立即接管所有客户端
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

// 监听主线程发来的 SKIP_WAITING 指令（兼容旧版调用）
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 拦截请求：Network-First 策略
// 优先从网络获取最新资源，网络失败时才回退到缓存
self.addEventListener('fetch', event => {
  // 跳过外部 CDN 请求
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  // 只处理 GET 请求
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 网络成功：更新缓存并返回
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败：回退到缓存
        return caches.match(event.request);
      })
  );
});
