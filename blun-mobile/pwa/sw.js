// sw.js — BLUN PWA Service Worker (Workbox 7)
// Lighthouse >90 Strategie: Cache-First Assets, Network-First API, Offline-Banner

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// ─── 1. Precache App Shell ───
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── 2. Cache-First: Statische Assets (JS/CSS/Fonts/Images) ───
registerRoute(
  ({ request }) =>
    ['style', 'script', 'font', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'blun-static-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Tage
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ─── 3. Network-First: API-Calls ───
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'blun-api-v1',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 5 * 60, // 5 Minuten
      }),
    ],
  })
);

// ─── 4. Stale-While-Revalidate: Agent-Avatare & CDN ───
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/avatars/') ||
    url.pathname.startsWith('/cdn/'),
  new StaleWhileRevalidate({
    cacheName: 'blun-avatars-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Tage
      }),
    ],
  })
);

// ─── 5. Background Sync fuer Offline-Actions ───
const bgSyncPlugin = new BackgroundSyncPlugin('blun-offline-queue', {
  maxRetentionTime: 24 * 60, // 24 Stunden
});

registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/agents/') &&
    (url.pathname.includes('/action') || url.pathname.includes('/message')),
  new NetworkFirst({
    cacheName: 'blun-actions-v1',
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

// ─── 6. Offline Fallback ───
const OFFLINE_PAGE = '/offline.html';

// Offline-Seite precachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('blun-offline-v1').then((cache) => cache.add(OFFLINE_PAGE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Navigation-Fallback auf Offline-Seite
setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match(OFFLINE_PAGE);
  }
  return Response.error();
});

// ─── 7. Offline/Online Events an Client senden ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
