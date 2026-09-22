/* Upstream app-shell service worker. Caches static assets and visited pages for offline use; never caches /api.
   It never calls skipWaiting(): a new version waits until every Upstream tab is closed, so unsent work is not discarded. */
const CACHE = "upstream-shell-v1";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/report/new", "/sign-in"]).catch(() => undefined)));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(event.request, res.clone()));
      return res;
    })));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(event.request, res.clone()));
      return res;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match("/report/new"))));
  }
});
