const CACHE_PREFIX = 'travel-traces';
const PRECACHE_NAME = `${CACHE_PREFIX}-precache-v5`;
const STATIC_CACHE_NAME = `${CACHE_PREFIX}-static-v5`;
const PRECACHE_ASSETS = ['/manifest.json', '/offline.html'];

/** Cache Storage 不可用或配额耗尽时返回未命中，保证网络请求仍可继续。 */
async function matchCache(request) {
  try {
    return await caches.match(request);
  } catch {
    return undefined;
  }
}

/** 缓存属于离线增强能力，写入失败不能让已经成功的网络响应变成 ERR_FAILED。 */
async function cacheResponse(request, response) {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // 浏览器会在配额恢复后通过后续请求再次尝试，不影响当前资源加载。
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      // 即使离线缓存空间不足，也要允许新 Worker 接管并修复旧版本的失败行为。
      .catch(() => caches.delete(PRECACHE_NAME).catch(() => false))
      // 新 Worker 必须立即接管，避免旧 cache-first 版本继续提供过期构建资源。
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (
            (key.startsWith(CACHE_PREFIX) || key.startsWith('travel-planner-'))
            && key !== PRECACHE_NAME
            && key !== STATIC_CACHE_NAME
          ))
          .map((key) => caches.delete(key)),
      ))
      // Cache Storage 整体不可用时仍需接管页面，让请求回退到网络。
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // API 响应可能包含账号、行程与定位数据，始终只走网络且绝不进入 Cache Storage。
  if (url.pathname.startsWith('/api/')) return;

  // 带内容哈希的构建产物和公开图标可以长期缓存；首次命中网络后写入静态缓存。
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      matchCache(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && !response.redirected) {
          await cacheResponse(event.request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(matchCache(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }

  // 登录后的 HTML 含用户态信息。导航仅尝试网络，失败时返回无用户数据的离线壳。
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => (
        (await matchCache('/offline.html'))
        || new Response('当前离线，请恢复网络后重试。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      )),
    );
  }
});
