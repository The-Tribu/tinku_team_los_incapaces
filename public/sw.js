// SunHub PWA service worker (minimal, app-shell style).
// Nombre del caché versionado: al desplegar una versión nueva, cambia el sufijo
// para forzar invalidación. Estrategia: network-first para HTML/API,
// cache-first para assets estáticos (fonts, icons).

const CACHE_NAME = "sunhub-v1";
const PRECACHE_URLS = [
  "/cliente",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Nunca interceptes SSE (event stream) ni endpoints de auth.
  if (url.pathname.startsWith("/api/alarms/stream")) return;
  if (url.pathname.startsWith("/api/auth/")) return;

  // API: network-first con fallback a caché.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((m) => m ?? new Response(JSON.stringify({ offline: true }), { status: 503, headers: { "content-type": "application/json" } }))),
    );
    return;
  }

  // Assets estáticos: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => undefined);
          return res;
        });
      }),
    );
    return;
  }

  // HTML / resto: network-first con fallback a /cliente (app shell).
  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => undefined);
        return res;
      })
      .catch(() =>
        caches.match(req).then((m) => m ?? caches.match("/cliente")),
      ),
  );
});
