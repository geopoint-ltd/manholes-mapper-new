/*
 * Graph Sketcher Service Worker
 *
 * This service worker implements a more robust caching strategy to support
 * offline‑first behaviour. We version both the application shell and
 * runtime caches so that updates are properly propagated. Navigation
 * requests (HTML) use a network‑first strategy with a fallback to an
 * offline page. Static assets are served from cache first. All other
 * same‑origin GET requests use stale‑while‑revalidate.
 */

// Bump the application version whenever the caching strategy changes.  This
// ensures that old caches are cleaned up and the new service worker
// installs a fresh set of resources.  Previously the stale‑while‑revalidate
// handler for runtime requests would simply return an unresolved promise if
// the network was unavailable and there was no cached response, causing
// offline pages to break.  Increasing the version here forces browsers
// to pick up the updated logic.
// v17 (2026-08-28): field guide scrolls properly again.
// v16 (2026-08-28): line-type radios + selection highlight.
// v15 (2026-08-28): bumped to ship the two line types / DB domain fix to field
// devices the same day. A bump changes this file's bytes, which is the only
// thing browsers treat as an update — reg.update() runs every 15 minutes, the
// new worker calls skipWaiting() then clients.claim(), and register-sw.js
// reloads the page on controllerchange. So every open device reloads within
// ~15 minutes of the deploy, unprompted.
const APP_VERSION = 'v17';
const PRECACHE = 'graph-sketch-shell-' + APP_VERSION;
const RUNTIME = 'graph-sketch-runtime-' + APP_VERSION;

// Derive the base path from the service worker scope so the app works when
// hosted at a sub‑path (e.g., /apps/graph/). Ensures cached URLs match requests.
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '/');
const withBase = (path) => {
  if (!path) return SCOPE_PATH;
  return SCOPE_PATH + path.replace(/^\//, '');
};

const OFFLINE_URL = withBase('offline.html');
// Note: We precache a small set of core assets that are guaranteed to exist at build time.
// The build output will fingerprint most JS and CSS assets into the /assets/ directory. Those
// files are handled dynamically via the runtime caching logic below; they don't need to be
// listed here explicitly. Keeping this list lean reduces churn across builds and avoids
// broken cache entries when filenames change.
// NOTE: styles.css is deliberately NOT precached.
//
// Everything in this list is served cache-first and never refreshed until
// APP_VERSION changes. styles.css used to be here, which meant a stylesheet
// shipped in v13 was pinned on every device that had ever opened the app —
// so a CSS-only release was invisible to existing users no matter how many
// times they reloaded. It now falls through to stale-while-revalidate at the
// bottom of the fetch handler: still cached for offline use after the first
// load, but picked up on the visit after a deploy.
const PRECACHE_ASSETS = [
  withBase('index.html'),
  OFFLINE_URL,
  withBase('manifest.json'),
  withBase('app_icon.png'),
  withBase('health/index.html')
];

self.addEventListener('install', (event) => {
  // Precache the application shell and offline page
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Delete any old caches that don't match our current names
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Allow the page to ask the waiting worker to activate immediately
self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Cache Google Fonts (icons and font files) for offline use.
  // We use cache‑first since these assets are versioned and immutable.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          const responseClone = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, responseClone));
          return response;
        } catch (_) {
          // Provide a safe empty fallback so respondWith never resolves undefined.
          const isStyle = request.destination === 'style' || /fonts\.googleapis\.com/.test(url.hostname);
          const headers = isStyle ? { 'content-type': 'text/css' } : { 'content-type': 'application/octet-stream' };
          return new Response('', { status: 200, headers });
        }
      })()
    );
    return;
  }

  // Only handle same‑origin requests below.  External resources (e.g. API calls
  // to third‑party domains) fall through untouched.  Note that Google Font
  // requests are handled separately above.
  if (url.origin !== self.location.origin) return;

  // Use a network‑first strategy for navigation requests (e.g. HTML documents).
  // If the network is unavailable the cached page is served.  If the
  // navigation route hasn’t been cached yet (e.g. first visit while offline)
  // we fall back to the app shell and finally the offline fallback page.
  // Some browsers (certain Samsung/Android builds) can fail to set mode='navigate'.
  // Detect navigations via Accept header as a fallback.
  const acceptHeader = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || (request.method === 'GET' && acceptHeader.includes('text/html'));
  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Update runtime cache with the fresh response.  Cloning is
          // necessary because the response can only be consumed once.
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        } catch (_) {
          // Attempt to return the exact page from cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Handle health route explicitly to support offline checks
          const path = url.pathname.replace(/\/$/, '');
          if (path.endsWith('/health')) {
            const health = await caches.match(withBase('health/index.html'));
            if (health) return health;
          }
          // Fallback to the pre‑cached app shell (index.html) or offline page
          const shell = await caches.match(withBase('index.html'));
          return shell || (await caches.match(OFFLINE_URL));
        }
      })()
    );
    return;
  }

  // Serve pre‑cached assets with a cache‑first strategy.  If the asset
  // isn’t cached we fetch it from the network, cache it and return it.
  // Should the fetch fail (e.g. offline) we fall back to the offline page.
  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          const responseClone = response.clone();
          caches.open(PRECACHE).then((cache) => cache.put(request, responseClone));
          return response;
        } catch (_) {
          return caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  // Cache-first strategy for built JS/CSS bundles under the /assets directory.  Vite fingerprints
  // these files (e.g. /assets/index-HASH.js) at build time.  Offline support breaks if we
  // always do a network request for them because the file names change each release and are
  // not listed in PRECACHE_ASSETS.  By caching them on first access and serving from the
  // runtime cache thereafter we ensure the app still works when offline.
  if (url.pathname.startsWith(withBase('assets/')) && request.method === 'GET') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          const responseClone = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, responseClone));
          return response;
        } catch (_) {
          // When offline and the file isn’t cached yet, fall back to the offline page rather than
          // returning a 504 for JS/CSS requests.  This prevents unhandled promise rejections in the app.
          return caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  // Stale‑while‑revalidate for other same‑origin GET requests.  We respond
  // immediately with whatever is in the cache, if present, and kick off
  // a network fetch to update the cache.  If there is no cached response
  // and the network is unavailable we fall back to the offline page so
  // that broken requests don’t crash the app.
// a network fetch to update the cache.  If there is no cached response
  // and the network is unavailable we fall back to the offline page so
  // that broken requests don’t crash the app.
  if (request.method === 'GET') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        try {
          const response = await fetch(request);
          // Clone the response *before* potentially consuming its body
          const responseClone = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, responseClone));
          return cached || response; // Now safe to return the original response
        } catch (_) {
          // When offline and there is no cached response for a non-navigation GET, return the offline page
          // instead of an empty 504.  This helps avoid broken behaviour when JS/CSS requests miss the cache.
          return cached || (await caches.match(OFFLINE_URL));
        }
      })()
    );
    return;
  }

});