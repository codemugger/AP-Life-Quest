// AP Life Quest service worker: keeps the app itself (page, scripts, styles, fonts) on the device so
// it opens fast, even on a weak signal. Game data (/api/…) and pictures are never cached here.
const CACHE = "aplq-shell-v1";
const MAX_FILES = 150;
const NET_WAIT_MS = 2500;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(req));
  else if (req.mode === "navigate") event.respondWith(networkFirst(req));
});

/** Build files have unique names, so a cached copy is always the right one. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    trim(cache);
  }
  return res;
}

/** The page: fresh from the network when it answers quickly, otherwise the last copy. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await cache.put("/", res.clone());
    return res;
  });
  fresh.catch(() => {}); // offline: handled below
  const cached = await cache.match("/");
  if (!cached) return fresh;
  const timeout = new Promise((ok) => setTimeout(() => ok(null), NET_WAIT_MS));
  try {
    return (await Promise.race([fresh, timeout])) ?? cached;
  } catch {
    return cached;
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) await cache.delete(key);
}
