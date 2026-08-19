const CACHE_PREFIX = "recipe-library-shell-";
const requestedVersion = new URL(self.location.href).searchParams.get("v") || "local";
const cacheVersion = requestedVersion.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "local";
const CACHE_NAME = `${CACHE_PREFIX}${cacheVersion}`;
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/app-192.png",
  "/icons/app-512.png",
];

function isSensitiveRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/__/auth/") ||
    url.pathname.includes("firestore")
  );
}

function canStore(response) {
  return response && response.ok && response.type === "basic";
}

async function cacheShellResponse(request, response) {
  if (canStore(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (new URL(request.url).pathname === "/") {
      await cacheShellResponse(request, response);
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/offline")) || Response.error();
  }
}

async function staticResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  return cacheShellResponse(request, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    ["style", "script", "font", "image"].includes(request.destination)
  ) {
    event.respondWith(staticResponse(request));
  }
});
