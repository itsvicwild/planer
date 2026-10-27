const CACHE_PREFIX = "wild-workspace-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v3.5.4";
const scopeUrl = self.registration.scope;
const asset = (path) => new URL(path, scopeUrl).href;
const CORE_ASSETS = [
  asset("./"),
  asset("./index.html"),
  asset("./manifest.webmanifest"),
  asset("./icons/icon-192.png"),
  asset("./icons/icon-512.png"),
  asset("./icons/icon-512-maskable.png")
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Cache Google Fonts at runtime when available; the system font fallback remains usable offline.
  if (url.origin !== self.location.origin) {
    if (url.hostname !== "fonts.googleapis.com" && url.hostname !== "fonts.gstatic.com") return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.endsWith("/service-worker.js")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(() => {});
          // Keep a canonical index.html copy for offline fallback from the installed app's scope.
          if (url.href === asset("./") || url.pathname.endsWith("/index.html")) {
            cache.put(asset("./index.html"), response.clone()).catch(() => {});
          }
        }
        return response;
      } catch (_) {
        return await cache.match(request) || await cache.match(asset("./index.html")) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        return Response.error();
      }
    })());
  }
});
