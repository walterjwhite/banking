const CACHE = "family-bank-v8";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
  "./icons/apple-touch-icon.png",
  "./src/app.js",
  "./src/api.js",
  "./src/config.js",
  "./src/confirm.js",
  "./src/format.js",
  "./src/issue.js",
  "./src/issues.js",
  "./src/issue.js",
  "./src/onboarding.js",
  "./src/pending.js",
  "./src/pin.js",
  "./src/render.js",
  "./src/request-form.js",
  "./src/request.js",
  "./src/token.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  /* The ledger is fetched from api.github.com with a key: never cache or proxy it. */
  if (url.origin !== self.location.origin) return;
  const versioned =
    url.pathname.includes("/icons/") || url.pathname.endsWith(".webmanifest");
  event.respondWith((versioned ? cacheFirst : networkFirst)(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match("./index.html")) ?? Response.error();
  }
}

async function cacheFirst(request) {
  return (await caches.match(request)) ?? fetch(request);
}
