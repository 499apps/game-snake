// Service worker source. Placeholders are filled by renderServiceWorker() at build time.
// Hand-written, no Workbox. Cache-first for every precached file; nothing else is cached.
export const SW_TEMPLATE = `/* 499apps Games service worker (generated at build time; do not edit). */
'use strict';
const SCOPE = '__G499_SCOPE__';
const VERSION = '__G499_VERSION__';
const CACHE_NAME = 'g499-precache-' + VERSION;
const ASSETS = __G499_ASSETS__;
const ASSET_SET = new Set(ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const batch = 6;
      for (let i = 0; i < ASSETS.length; i += batch) {
        await Promise.all(
          ASSETS.slice(i, i + batch).map(async (url) => {
            const res = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
            if (!res.ok) throw new Error('precache failed: ' + url + ' (' + res.status + ')');
            await cache.put(url, res);
          }),
        );
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('g499-precache-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function assetKey(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    return null;
  }
  if (url.origin !== self.location.origin) return null;
  let p = url.pathname;
  if (p.endsWith('/')) p += 'index.html';
  else if (!/\\.[A-Za-z0-9]+$/.test(p)) p += '/index.html';
  return ASSET_SET.has(p) ? p : null;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const key = assetKey(req.url);
  if (!key) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(key);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) await cache.put(key, res.clone());
        return res;
      } catch (e) {
        return new Response('Offline and not cached: ' + key, {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'G499_SKIP_WAITING') self.skipWaiting();
  if (data && data.type === 'G499_VERSION' && event.source) {
    event.source.postMessage({ type: 'G499_VERSION', version: VERSION, scope: SCOPE });
  }
});
`;
