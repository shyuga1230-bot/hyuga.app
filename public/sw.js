/* 無白 service worker — ホーム画面起動とオフライン用の最小シェルキャッシュ */
const CACHE = "muhaku-v1";
/* 配信ディレクトリ基準("/" 直下でも GitHub Pages のサブパスでも動く) */
const SHELL = new URL("./", self.location).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, cp));
          return r;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok && new URL(req.url).origin === self.location.origin) {
            const cp = r.clone();
            caches.open(CACHE).then((c) => c.put(req, cp));
          }
          return r;
        }),
    ),
  );
});
