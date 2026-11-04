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

// Phone reminders: the server sends an encrypted message, the browser decrypts it, we show it.
self.addEventListener("push", (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {}
  const title = typeof m.title === "string" && m.title ? m.title : "AP Life Quest";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof m.body === "string" ? m.body : "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: typeof m.tag === "string" ? m.tag : undefined,
      data: { url: typeof m.url === "string" && m.url.startsWith("/") ? m.url : "/", char: typeof m.char === "string" ? m.char : null },
    }),
  );
});

// Tapping one opens the app (as the character it's about) on the right page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url = "/", char = null } = event.notification.data || {};
  const hash = url.includes("#") ? url.slice(url.indexOf("#")) : "#/";
  const target = new URL(char ? `/?play=${encodeURIComponent(char)}${hash}` : `/${hash}`, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        return win.navigate(target).catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    })(),
  );
});
