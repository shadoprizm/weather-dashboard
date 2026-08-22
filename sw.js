/**
 * The service worker.
 *
 * Two jobs, both about the same thing: a visitor who installed this should
 * never see a blank screen. It keeps the shell so the app opens instantly with
 * no network, and it keeps the last successful forecast so an offline open
 * shows yesterday's answer clearly rather than an error.
 *
 * Nothing here caches anything a visitor did not already request, and the
 * whole store is versioned so a deploy replaces it wholesale.
 */

const VERSION = 'weatherview-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const PAGE_CACHE = `${VERSION}-pages`;

// Everything needed to paint the app with no network at all.
const SHELL = [
  '/',
  '/style.css',
  '/manifest.webmanifest',
  '/icons/weatherview-mark.svg',
  '/js/main.js',
  '/js/api.js',
  '/js/state.js',
  '/js/format.js',
  '/js/dom.js',
  '/js/wmo.js',
  '/js/icons.js',
  '/js/insights.js',
  '/js/viewmodel.js',
  '/js/radar.js',
  '/js/views/forecast.js',
  '/js/views/panels.js',
  '/js/views/tables.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // One missing file must not fail the whole install, so each is added
      // on its own and a failure is simply skipped.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/** Cache first: the shell never changes without a new deploy. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

/**
 * Network first, cache as backup.
 *
 * The right shape for both pages and forecasts: online, you always get the
 * live answer; offline, you get the last one that arrived instead of nothing.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The widget belongs to whoever embedded it; never serve it from our cache.
  if (url.pathname === '/widget' || url.pathname.startsWith('/api/og')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, PAGE_CACHE).catch(() => caches.match('/'))
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    // Radar frames and the alert feed go stale in minutes; a stale one is
    // still better than an empty panel, and the app labels its own age.
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => caches.match(request)));
});
