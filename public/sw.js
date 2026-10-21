// Hargana service worker: keeps the app shell available offline.
// Registered as /sw.js?v=<build id>; a new build id installs a new worker and
// drops the previous cache. Data offline-ness lives in the on-device core.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `hargana-shell-${VERSION}`;
const NAVIGATION_TIMEOUT_MS = 4000;
const STATIC_ASSET = /^\/(_next\/static\/|icons\/|favicon\.ico$|manifest\.webmanifest$)/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("hargana-shell-") && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") event.respondWith(networkFirst(request, url));
  else if (STATIC_ASSET.test(url.pathname)) event.respondWith(cacheFirst(request));
  // Anything else (e.g. RSC payloads) goes to the network; when offline the
  // router falls back to a full navigation, which the cache serves.
});

// The page sends the routes and assets it uses once a worker controls it, so
// every screen opens offline after the first visit.
self.addEventListener("message", (event) => {
  if (event.data?.type === "warm") event.waitUntil(warm(event.data.routes ?? [], event.data.assets ?? []));
});

// Pages are static shells that read their parameters on the client, so they
// are cached by path alone.
function pageKey(url) {
  return new URL(url.pathname, url.origin).href;
}

function cacheable(response) {
  return response.ok && !response.redirected && response.type === "basic";
}

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (cacheable(response)) await cache.put(pageKey(url), response.clone());
    return response;
  } catch {
    const cached = (await cache.match(pageKey(url))) ?? (await cache.match(pageKey(new URL("/", url))));
    return cached ?? offlineResponse();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function warm(routes, assets) {
  const cache = await caches.open(CACHE);
  const found = new Set(assets);
  await Promise.all(
    routes.map(async (route) => {
      const url = new URL(route, self.location.origin);
      if (await cache.match(pageKey(url))) return;
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!cacheable(response)) return;
        await cache.put(pageKey(url), response.clone());
        // A page's own chunks only load when it is opened; collect them now.
        for (const match of (await response.text()).matchAll(/\/_next\/static\/[^"'\s\)]+/g)) found.add(match[0]);
      } catch {
        // Offline or failed: keep what is already cached.
      }
    }),
  );
  await Promise.all(
    [...found].map(async (asset) => {
      const url = new URL(asset, self.location.origin);
      if (url.origin !== self.location.origin || !STATIC_ASSET.test(url.pathname)) return;
      if (await cache.match(url)) return;
      try {
        const response = await fetch(url);
        if (cacheable(response)) await cache.put(url, response);
      } catch {
        // Ignore; it will be cached when first used online.
      }
    }),
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}

function offlineResponse() {
  return new Response("<!doctype html><meta charset=utf-8><title>Hargana</title><p>Offline.</p>", {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
