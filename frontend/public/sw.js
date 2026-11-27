const SHELL_CACHE = "campusunsa-shell-v1";
const STATIC_CACHE = "campusunsa-static-v1";
const API_CACHE = "campusunsa-api-v1";
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE, API_CACHE];

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/images/onboarding/penguin-logo-minimal.svg",
];

const CACHEABLE_API_SUFFIXES = [
  "/courses/enrolled",
  "/courses/assignments",
  "/courses/catalog",
  "/courses/pending-links",
  "/auth/me",
  "/auth/google/classroom/status",
  "/dutic/ical/status",
];

function extractSubjectFromAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return "anon";
    }
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json);
    return payload.sub ? String(payload.sub) : "anon";
  } catch {
    return "anon";
  }
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/images/") ||
    pathname === "/manifest.webmanifest" ||
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$/i.test(pathname)
  );
}

function isCacheableApiPath(pathname) {
  if (pathname.endsWith("/health") || pathname.endsWith("/api/v1/lost-found")) {
    return { cacheable: true, requiresAuth: false };
  }
  const matched = CACHEABLE_API_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
  return { cacheable: matched, requiresAuth: true };
}

function buildScopedApiCacheRequest(requestUrl, subject) {
  const scopePrefix = subject ? encodeURIComponent(subject) : "public";
  const url = new URL(requestUrl);
  return new Request(
    `${self.location.origin}/__sw_api_cache/${scopePrefix}${url.pathname}${url.search}`,
    { method: "GET" }
  );
}

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type: "CAMPUSUNSA_BACKGROUND_SYNC" });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map(async (assetUrl) => {
          const response = await fetch(assetUrl, { cache: "no-store" });
          if (response.ok) {
            await cache.put(assetUrl, response);
          }
        })
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !ACTIVE_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") {
    return;
  }
  if (data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  } else if (data.type === "CLEAR_API_CACHE") {
    event.waitUntil(caches.delete(API_CACHE));
  } else if (data.type === "TRIGGER_SYNC") {
    event.waitUntil(notifyClientsToSync());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "campusunsa-academic-sync") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function matchCachedShell(shellCache, request) {
  const cachedExact = await shellCache.match(request);
  if (cachedExact) {
    return cachedExact;
  }
  return shellCache.match("/");
}

async function handleNavigationRequest(request) {
  const shellCache = await caches.open(SHELL_CACHE);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const cachedOffline = await matchCachedShell(shellCache, request);
    if (cachedOffline) {
      return cachedOffline;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (networkResponse && networkResponse.ok) {
      await shellCache.put("/", networkResponse.clone());
    }
    return networkResponse;
  } catch {
    clearTimeout(timeoutId);
    const cachedFallback = await matchCachedShell(shellCache, request);
    if (cachedFallback) {
      return cachedFallback;
    }
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function handleStaticAssetRequest(event, request) {
  const staticCache = await caches.open(STATIC_CACHE);
  const cached = await staticCache.match(request);

  if (cached && typeof navigator !== "undefined" && navigator.onLine === false) {
    return cached;
  }

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        void staticCache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }
  return new Response("Asset unavailable offline", { status: 504 });
}

async function handleApiRequest(request, requiresAuth) {
  const authHeader = request.headers.get("Authorization");
  const subject = extractSubjectFromAuth(authHeader);
  if (requiresAuth && !subject) {
    return fetch(request);
  }

  const apiCache = await caches.open(API_CACHE);
  const scopedKey = buildScopedApiCacheRequest(request.url, subject);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const cachedOffline = await apiCache.match(scopedKey);
    if (cachedOffline) {
      return cachedOffline;
    }
    return new Response(JSON.stringify({ detail: "Offline cache miss" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (networkResponse && networkResponse.ok) {
      await apiCache.put(scopedKey, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    clearTimeout(timeoutId);
    const cached = await apiCache.match(scopedKey);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ detail: "Offline cache miss" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/_next/webpack-hmr")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  const apiPolicy = isCacheableApiPath(url.pathname);
  if (apiPolicy.cacheable) {
    event.respondWith(handleApiRequest(request, apiPolicy.requiresAuth));
    return;
  }

  if (url.origin === self.location.origin && isStaticAssetPath(url.pathname)) {
    event.respondWith(handleStaticAssetRequest(event, request));
  }
});
