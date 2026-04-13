/* ═══════════════════════════════════════
   SW.JS - Service Worker
   ═══════════════════════════════════════ */

const CACHE_NAME = 'soulreader-v0.3.6-beta';
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

// 安装：缓存所有资源，但不调用 skipWaiting，让新 SW 进入 waiting 状态
// 这样 checkUpdate() 才能检测到 reg.waiting 并手动触发更新
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 激活：清除旧版缓存，接管所有客户端
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

// 拦截请求：Network-First 策略
// 优先从网络获取最新资源，网络失败时才回退到缓存
// 这样即使缓存存在，也能及时获取更新后的文件
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
