// affiliate-mobile.ts — Affiliate Dashboard Mobile
// Pure TS, keine Framework-Dependency
// Features: Cards, QR-Code (qrcode.js), navigator.share(), Pull-to-Refresh

interface AffiliateData {
  code: string;
  link: string;
  tier: 'Bronze' | 'Silber' | 'Gold';
  tierPercent: number;
  referrals: number;
  revenue: number;
  pending: number;
  subAffiliates: number;
  subRevenue: number;
  history: { month: string; amount: number; status: 'paid' | 'pending' }[];
}

interface AffiliateMobileOptions {
  container: HTMLElement;
  data: AffiliateData;
  qrTarget?: HTMLElement;
  onRefresh?: () => Promise<AffiliateData>;
}

// ── Pull-to-Refresh ──────────────────────────────────────────────

class PullToRefresh {
  private container: HTMLElement;
  private indicator: HTMLElement;
  private startY = 0;
  private currentY = 0;
  private pulling = false;
  private refreshing = false;
  private threshold = 80;
  private onRefresh: () => Promise<void>;

  constructor(container: HTMLElement, onRefresh: () => Promise<void>) {
    this.container = container;
    this.onRefresh = onRefresh;

    this.indicator = document.createElement('div');
    this.indicator.className = 'aff-ptr-indicator';
    this.indicator.innerHTML = `
      <div class="aff-ptr-spinner"></div>
      <span class="aff-ptr-text">Ziehen zum Aktualisieren</span>
    `;
    this.container.prepend(this.indicator);

    this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  private onTouchStart = (e: TouchEvent) => {
    if (this.refreshing) return;
    if (this.container.scrollTop > 0) return;
    this.startY = e.touches[0].clientY;
    this.pulling = true;
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.pulling || this.refreshing) return;
    this.currentY = e.touches[0].clientY;
    const delta = Math.max(0, this.currentY - this.startY);

    if (delta > 0 && this.container.scrollTop <= 0) {
      e.preventDefault();
      const dampened = Math.min(delta * 0.5, 120);
      this.indicator.style.transform = `translateY(${dampened - 60}px)`;
      this.indicator.style.opacity = String(Math.min(dampened / this.threshold, 1));

      const text = this.indicator.querySelector('.aff-ptr-text') as HTMLElement;
      text.textContent = dampened >= this.threshold ? 'Loslassen zum Aktualisieren' : 'Ziehen zum Aktualisieren';
    }
  };

  private onTouchEnd = async () => {
    if (!this.pulling || this.refreshing) return;
    this.pulling = false;
    const delta = (this.currentY - this.startY) * 0.5;

    if (delta >= this.threshold) {
      this.refreshing = true;
      this.indicator.style.transform = 'translateY(20px)';
      this.indicator.classList.add('aff-ptr-loading');
      const text = this.indicator.querySelector('.aff-ptr-text') as HTMLElement;
      text.textContent = 'Wird aktualisiert…';

      await this.onRefresh();

      this.refreshing = false;
      this.indicator.classList.remove('aff-ptr-loading');
    }

    this.indicator.style.transform = 'translateY(-60px)';
    this.indicator.style.opacity = '0';
  };

  destroy() {
    this.container.removeEventListener('touchstart', this.onTouchStart);
    this.container.removeEventListener('touchmove', this.onTouchMove);
    this.container.removeEventListener('touchend', this.onTouchEnd);
    this.indicator.remove();
  }
}

// ── QR-Code ──────────────────────────────────────────────────────

async function renderQR(container: HTMLElement, text: string): Promise<void> {
  // @ts-ignore — qrcode.js global oder importiert
  const QRCode = (window as any).QRCode;
  if (!QRCode) {
    console.error('qrcode.js nicht geladen. <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js">');
    container.textContent = 'QR-Code nicht verfügbar';
    return;
  }
  container.innerHTML = '';
  new QRCode(container, {
    text,
    width: 200,
    height: 200,
    colorDark: '#1a1a2e',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ── Share ────────────────────────────────────────────────────────

async function shareLink(data: AffiliateData): Promise<boolean> {
  const shareData: ShareData = {
    title: 'BLUN.ai — Jetzt testen',
    text: `Teste BLUN.ai mit meinem Affiliate-Link und sichere dir Vorteile!`,
    url: data.link,
  };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return true;
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.warn('Share failed:', e);
      return false;
    }
  }

  // Fallback: Clipboard
  try {
    await navigator.clipboard.writeText(data.link);
    return true;
  } catch {
    return false;
  }
}

// ── Card Renderer ────────────────────────────────────────────────

function tierColor(tier: AffiliateData['tier']): string {
  return tier === 'Gold' ? '#f59e0b' : tier === 'Silber' ? '#94a3b8' : '#cd7f32';
}

function euro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function renderCards(container: HTMLElement, data: AffiliateData): void {
  container.innerHTML = `
    <!-- Tier Card -->
    <div class="aff-card aff-card-tier">
      <div class="aff-card-badge" style="background:${tierColor(data.tier)}">${data.tier}</div>
      <div class="aff-card-title">Dein Status</div>
      <div class="aff-card-value">${data.tierPercent}% Revenue Share</div>
      <div class="aff-card-sub">${data.referrals} Referral${data.referrals !== 1 ? 's' : ''}</div>
    </div>

    <!-- Revenue Card -->
    <div class="aff-card aff-card-revenue">
      <div class="aff-card-title">Einnahmen</div>
      <div class="aff-card-value aff-card-big">${euro(data.revenue)}</div>
      <div class="aff-card-row">
        <span class="aff-card-label">Ausstehend</span>
        <span class="aff-card-amount pending">${euro(data.pending)}</span>
      </div>
    </div>

    <!-- Sub-Affiliates Card -->
    <div class="aff-card aff-card-sub-aff">
      <div class="aff-card-title">Sub-Affiliates</div>
      <div class="aff-card-row">
        <span class="aff-card-label">Aktiv</span>
        <span class="aff-card-amount">${data.subAffiliates}</span>
      </div>
      <div class="aff-card-row">
        <span class="aff-card-label">5% Umsatz</span>
        <span class="aff-card-amount">${euro(data.subRevenue)}</span>
      </div>
    </div>

    <!-- QR + Share Card -->
    <div class="aff-card aff-card-share">
      <div class="aff-card-title">Dein Link</div>
      <div class="aff-link-display">
        <code>${data.link}</code>
      </div>
      <div id="aff-qr-container" class="aff-qr-container"></div>
      <div class="aff-card-actions">
        <button id="aff-share-btn" class="aff-btn aff-btn-primary" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Teilen
        </button>
        <button id="aff-copy-btn" class="aff-btn aff-btn-secondary" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Kopieren
        </button>
      </div>
    </div>

    <!-- History Card -->
    <div class="aff-card aff-card-history">
      <div class="aff-card-title">Auszahlungen</div>
      ${data.history.map(h => `
        <div class="aff-card-row">
          <span class="aff-card-label">${h.month}</span>
          <span class="aff-card-amount ${h.status}">${euro(h.amount)}</span>
          <span class="aff-card-status ${h.status}">${h.status === 'paid' ? '✓' : '⏳'}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Init ─────────────────────────────────────────────────────────

export function initAffiliateMobile(options: AffiliateMobileOptions): () => void {
  const { container, data, onRefresh } = options;
  container.classList.add('aff-mobile');

  // Render
  renderCards(container, data);

  // QR-Code
  const qrContainer = container.querySelector('#aff-qr-container') as HTMLElement;
  if (qrContainer) renderQR(qrContainer, data.link);

  // Share Button
  const shareBtn = container.querySelector('#aff-share-btn') as HTMLButtonElement;
  const copyBtn = container.querySelector('#aff-copy-btn') as HTMLButtonElement;

  const showToast = (msg: string) => {
    const toast = document.createElement('div');
    toast.className = 'aff-toast';
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('aff-toast-show'));
    setTimeout(() => {
      toast.classList.remove('aff-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  };

  shareBtn?.addEventListener('click', async () => {
    const ok = await shareLink(data);
    if (ok) showToast('Link geteilt!');
  });

  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.link);
      showToast('Link kopiert!');
    } catch {
      showToast('Kopieren fehlgeschlagen');
    }
  });

  // Pull-to-Refresh
  let ptr: PullToRefresh | null = null;
  if (onRefresh) {
    ptr = new PullToRefresh(container, async () => {
      const newData = await onRefresh();
      renderCards(container, newData);
      const qr = container.querySelector('#aff-qr-container') as HTMLElement;
      if (qr) renderQR(qr, newData.link);
    });
  }

  // Cleanup
  return () => {
    ptr?.destroy();
    container.innerHTML = '';
    container.classList.remove('aff-mobile');
  };
}
