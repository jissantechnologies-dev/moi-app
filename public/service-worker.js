/**
 * Offline support for the web build.
 *
 * The app already keeps its data in a local SQLite database and syncs in the
 * background, so the only thing standing between it and working offline is
 * fetching the app shell. That is all this worker does: it serves the shell
 * from a cache when the network is unavailable, and it stays out of the way of
 * everything else.
 *
 * Bump CACHE_VERSION to retire the previous caches on the next activation.
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `moi-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `moi-static-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE];

// Hashed bundle names change on every deploy, so the shell cannot be listed
// ahead of time. Only the entry document is precached; the bundles it pulls in
// are cached as they are first requested.
const SHELL_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      // A failed precache must not block installation; the first navigation
      // online will fill the cache instead.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('moi-') && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Immutable build output, per the cache headers in vercel.json. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/');
}

function isCacheableResponse(response) {
  // `basic` excludes opaque cross-origin responses, which would poison the
  // cache with bodies we cannot inspect.
  return response && response.status === 200 && response.type === 'basic';
}

/**
 * Navigations go to the network first so a deploy is picked up immediately,
 * and fall back to the cached shell when offline. index.html is served
 * `no-store`, so there is no stale-document risk in caching it here.
 */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw error;
  }
}

/** Content-hashed assets never change under a given URL, so cache wins. */
async function handleImmutableAsset(request) {
  const cached = await caches.match(request, { cacheName: STATIC_CACHE });
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that changes state, and any cross-origin request, is left alone.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API traffic is authenticated and mutable. It must never be served from a
  // cache, or one account could be shown another's data after a sign-out.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(handleImmutableAsset(request));
  }
});

// Lets the page activate a waiting worker without a manual reload.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
