/* Service Worker: macht die App offline nutzbar.
   Strategie: online immer die neueste Version holen (neue Vokabeln sind sofort da),
   offline auf die zuletzt gespeicherte Version zurückfallen. Schriften & Icons aus dem Cache. */
const CACHE = "ripassa-v2";
const CORE = [
  "./", "index.html", "css/style.css", "js/app.js", "manifest.webmanifest",
  "data/vocab.json", "data/passato.json", "data/sentences.json", "data/verbs.json",
  "fonts/fraunces-latin-400-normal.woff2", "fonts/fraunces-latin-600-normal.woff2", "fonts/fraunces-latin-500-italic.woff2",
  "fonts/dm-sans-latin-400-normal.woff2", "fonts/dm-sans-latin-400-italic.woff2", "fonts/dm-sans-latin-500-normal.woff2",
  "fonts/dm-sans-latin-600-normal.woff2", "fonts/dm-sans-latin-700-normal.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  // Schriften & Icons ändern sich nie → Cache zuerst
  if (/\/(fonts|icons)\//.test(path)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => put(req, res))));
    return;
  }
  // Alles andere: Netz zuerst (mit Zeitlimit), sonst Cache
  e.respondWith(
    timeout(fetch(req, { cache: "no-cache" }), 4000)
      .then(res => put(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
function put(req, res) {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
}
function timeout(p, ms) {
  return new Promise((ok, fail) => { const t = setTimeout(fail, ms); p.then(r => { clearTimeout(t); ok(r); }, err => { clearTimeout(t); fail(err); }); });
}
