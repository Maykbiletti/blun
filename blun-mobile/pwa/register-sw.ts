// register-sw.ts — Service Worker Registration + Offline-Banner
// Einbinden in App-Entry (main.tsx / App.tsx)

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Update-Check alle 60s
      setInterval(() => reg.update(), 60_000);

      // Neuer SW verfuegbar → User informieren
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            showUpdateBanner();
          }
        });
      });
    } catch (err) {
      console.error('[SW] Registration failed:', err);
    }
  });
}

// ─── Offline-Banner ───

let offlineBanner: HTMLElement | null = null;

function createOfflineBanner(): HTMLElement {
  const banner = document.createElement('div');
  banner.id = 'blun-offline-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.innerHTML = `
    <style>
      #blun-offline-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        background: #dc2626;
        color: #fff;
        text-align: center;
        padding: 8px 16px;
        font-size: 14px;
        font-family: system-ui, -apple-system, sans-serif;
        transform: translateY(-100%);
        transition: transform 0.3s ease;
        safe-area-inset: env(safe-area-inset-top);
      }
      #blun-offline-banner.visible {
        transform: translateY(0);
      }
      #blun-offline-banner .offline-icon {
        margin-right: 8px;
      }
    </style>
    <span class="offline-icon">&#9888;</span>
    Offline — Daten werden synchronisiert sobald Verbindung steht
  `;
  document.body.prepend(banner);
  return banner;
}

function showOfflineBanner(): void {
  if (!offlineBanner) offlineBanner = createOfflineBanner();
  requestAnimationFrame(() => offlineBanner!.classList.add('visible'));
  // Body-Padding damit Content nicht verdeckt wird
  document.body.style.paddingTop = '40px';
}

function hideOfflineBanner(): void {
  offlineBanner?.classList.remove('visible');
  document.body.style.paddingTop = '';
}

// Online/Offline Events
window.addEventListener('offline', showOfflineBanner);
window.addEventListener('online', hideOfflineBanner);

// Initial Check
if (!navigator.onLine) {
  document.addEventListener('DOMContentLoaded', showOfflineBanner);
}

// ─── Update-Banner ───

function showUpdateBanner(): void {
  const banner = document.createElement('div');
  banner.id = 'blun-update-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <style>
      #blun-update-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        background: #1a1a2e;
        color: #fff;
        text-align: center;
        padding: 12px 16px;
        font-size: 14px;
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
      }
      #blun-update-banner button {
        background: #6366f1;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 14px;
        cursor: pointer;
        min-height: 44px;
        min-width: 44px;
      }
    </style>
    <span>Neue Version verfuegbar</span>
    <button onclick="window.location.reload()">Aktualisieren</button>
  `;
  document.body.appendChild(banner);
}
