// Minimal service worker to satisfy Android Chrome's PWA install criteria.
// No caching logic yet — just a noop fetch handler that passes through to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
