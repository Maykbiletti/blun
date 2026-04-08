# Mobile Canvas View — Spec

**Autor:** Rolf (Business Dev)
**Datum:** 2026-04-07
**Deadline:** 2026-04-08 morgens
**Tier:** Free+

---

## 1. Breakpoints & Layout

| Breakpoint | Breite | Layout |
|---|---|---|
| Mobile S | 320px | 1-Spalte, Bottom-Nav |
| Mobile L | 480px | 1-Spalte, groessere Touch-Targets |
| Tablet | 768px | 2-Spalten Split (Chat + Canvas) |
| Desktop | 1024px+ | Volle Canvas-Ansicht |

- CSS Grid + Flexbox, keine horizontalen Scrollbars
- Minimum Touch-Target: 44x44px (Apple HIG)
- Safe Area Insets fuer Notch-Geraete (env(safe-area-inset-*))

## 2. Swipe-Gesten

| Geste | Aktion | Threshold |
|---|---|---|
| Swipe Links | Chat-Panel oeffnen | 80px horizontal |
| Swipe Rechts | Canvas-Panel oeffnen | 80px horizontal |
| Pull-to-Refresh | Agent-Status aktualisieren | 60px vertikal |
| Pinch | Canvas Zoom (0.5x – 3x) | 2-Finger |
| Shake | Undo letzte Aktion | DeviceMotion API |

**Implementierung:**
- Touch-Events: `touchstart` / `touchmove` / `touchend`
- Velocity-basierte Swipe-Erkennung (nicht nur Distance)
- `will-change: transform` auf animierten Elementen
- `passive: true` auf Scroll-Listenern fuer Performance
- Debounce auf Resize-Events (150ms)

## 3. PWA Setup

### manifest.json
```json
{
  "name": "BLUN.ai Agent Platform",
  "short_name": "BLUN",
  "start_url": "/canvas",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#1a1a2e",
  "background_color": "#0f0f23",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker (Workbox)

```js
// sw.js — Workbox Strategy
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache App Shell
precacheAndRoute(self.__WB_MANIFEST);

// API Calls — Network First, Fallback auf Cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 })
    ]
  })
);

// Statische Assets — Cache First
registerRoute(
  ({ request }) => ['style', 'script', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })
    ]
  })
);
```

## 4. Offline-Cache

| Was | Strategie | Limit |
|---|---|---|
| Letzte 50 Nachrichten pro Agent | IndexedDB (idb-keyval) | 50 Messages FIFO |
| Agent-Status-Snapshot | Cache API | Letzter bekannter State |
| Canvas-Layout | localStorage | Aktuelles Layout JSON |
| Bilder/Avatare | CacheFirst | 200 Eintraege, 30 Tage |

**Offline-Indikator:** Banner oben "Offline — Daten werden synchronisiert sobald Verbindung steht"
**Sync:** Background Sync API fuer ausstehende Actions

## 5. Performance-Ziele

| Metrik | Ziel |
|---|---|
| First Contentful Paint | < 1.5s (3G) |
| Largest Contentful Paint | < 2.5s (3G) |
| Time to Interactive | < 3.5s (3G) |
| Cumulative Layout Shift | < 0.1 |
| First Input Delay | < 100ms |
| Swipe-Responsiveness | < 16ms (60fps) |
| Bundle Size (gzipped) | < 150KB initial |

**Massnahmen:**
- Code Splitting: Canvas-View als Lazy-Load Chunk
- Tree Shaking: Nur genutzte Workbox-Module
- Bild-Optimierung: WebP + srcset fuer verschiedene Viewports
- Font: system-ui Stack, kein Custom-Font-Download
- Virtualisierung: Nur sichtbare Chat-Nachrichten rendern (react-window)

## 6. Tech-Stack

| Komponente | Technologie |
|---|---|
| Framework | React 18+ |
| Styling | Tailwind CSS (JIT) |
| Gesten | Custom Touch-Handler (kein Library-Overhead) |
| Animationen | CSS Transforms + requestAnimationFrame |
| PWA | Workbox 7 |
| Offline-Storage | IndexedDB via idb-keyval |
| State | Zustand (< 1KB) |
| Virtualisierung | react-window |

## 7. Akzeptanzkriterien

- [ ] Swipe Links oeffnet Chat, Swipe Rechts oeffnet Canvas — fluessig bei 60fps
- [ ] Pull-to-Refresh aktualisiert Agent-Status
- [ ] PWA installierbar auf iOS Safari + Android Chrome
- [ ] Offline: Letzte 50 Nachrichten lesbar ohne Netzwerk
- [ ] Alle Core Web Vitals im gruenen Bereich (Lighthouse > 90)
- [ ] Keine horizontalen Scrollbars auf 320px–1024px
- [ ] Touch-Targets mindestens 44x44px
