'use strict';

const CACHE_NAME = 'artagnan-v1';

// Local assets — always precached on install
const LOCAL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './logo.png',
    './icons/icon.svg',
    './icons/icon-maskable.svg'
];

// CDN assets — cached best-effort on install, cached on-demand afterwards
const CDN_ASSETS = [
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap'
];

/* ---- Install: precache all local assets ---- */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            // Local assets must succeed
            await cache.addAll(LOCAL_ASSETS);

            // CDN assets — best-effort (don't block install if offline)
            await Promise.allSettled(
                CDN_ASSETS.map(url =>
                    fetch(url, { mode: 'cors', credentials: 'omit' })
                        .then(res => { if (res.ok) cache.put(url, res); })
                        .catch(() => {})
                )
            );
        }).then(() => self.skipWaiting())
    );
});

/* ---- Activate: clean up old caches ---- */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

/* ---- Fetch: cache-first strategy ---- */
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip non-http(s) requests (e.g. chrome-extension://)
    const url = event.request.url;
    if (!url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            // Not in cache — fetch from network and cache for next time
            return fetch(event.request)
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline and not cached: serve index.html for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    // For other resources, return a minimal offline response
                    return new Response('', { status: 503, statusText: 'Service Unavailable' });
                });
        })
    );
});
