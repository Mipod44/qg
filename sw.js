// Service worker du QG ASM : rend l'appli installable et garde une copie du site pour un démarrage rapide.
// Toujours le réseau d'abord, pour que chaque mise à jour du site arrive tout de suite.
const C = "asm-v1";
const SHELL = ["./", "index.html", "app.js", "config.js", "seed.js", "logo.webp", "manifest.json", "icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
