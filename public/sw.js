/* Service worker del modo tablet: permite abrir /kiosk sin internet.
 * - Navegación a /kiosk: red primero, caché como respaldo.
 * - Recursos estáticos de Next (/_next/static), fuentes e íconos: caché primero.
 * - /api/*: nunca se cachea (la cola offline vive en localStorage).
 */
const CACHE = "kiosk-v1";
const SHELL = ["/kiosk", "/manifest.webmanifest", "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/logo/")) return;

  if (req.mode === "navigate" && url.pathname.startsWith("/kiosk")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/kiosk", copy));
          return res;
        })
        .catch(() => caches.match("/kiosk")),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/api/logo/") ||
    /\.(woff2?|png|jpg|svg|webp)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
