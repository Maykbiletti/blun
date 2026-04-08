import { useRef, useCallback, useState } from 'react';
import QRCode from 'qrcode';

// ─── Types ────────────────────────────────────────────────────
export interface Affiliate {
  id: string;
  name: string;
  email: string;
  code: string;
  tier: 1 | 2 | 3;
  revenue: number;
  referrals: number;
  conversionRate: number;
  status: 'active' | 'pending' | 'inactive';
  joinedAt: string;
  lastPayout: number;
  nextPayout: number;
}

interface AffiliateCardProps {
  affiliate: Affiliate;
  baseUrl: string;
  onCopy?: (code: string) => void;
}

// ─── Tier Config ──────────────────────────────────────────────
const TIER_CONFIG: Record<number, { label: string; color: string; rate: string }> = {
  1: { label: 'Bronze', color: '#cd7f32', rate: '15%' },
  2: { label: 'Silver', color: '#a0a0a0', rate: '20%' },
  3: { label: 'Gold',   color: '#ffd700', rate: '25%' },
};

// ─── Component ────────────────────────────────────────────────
export function AffiliateCard({ affiliate, baseUrl, onCopy }: AffiliateCardProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const affiliateUrl = `${baseUrl}/ref/${affiliate.code}`;
  const tier = TIER_CONFIG[affiliate.tier];

  // ── QR Code generieren ──
  const toggleQr = useCallback(async () => {
    if (!qrVisible && qrCanvasRef.current) {
      await QRCode.toCanvas(qrCanvasRef.current, affiliateUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      });
    }
    setQrVisible(v => !v);
  }, [qrVisible, affiliateUrl]);

  // ── Native Share ──
  const handleShare = useCallback(async () => {
    const shareData: ShareData = {
      title: 'BLUN.ai — KI-Agenten fuer dein Business',
      text: `Teste BLUN.ai mit meinem Empfehlungslink und erhalte 10% Rabatt im ersten Monat!`,
      url: affiliateUrl,
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        if ((e as DOMException).name !== 'AbortError') {
          fallbackCopy();
        }
      }
    } else {
      fallbackCopy();
    }
  }, [affiliateUrl]);

  // ── Fallback: Copy to Clipboard ──
  const fallbackCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(affiliateUrl);
      setCopied(true);
      onCopy?.(affiliate.code);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Aeltere Browser: Input-Trick
      const input = document.createElement('input');
      input.value = affiliateUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [affiliateUrl, affiliate.code, onCopy]);

  // ── Status Badge ──
  const statusColor = {
    active: '#22c55e',
    pending: '#f59e0b',
    inactive: '#ef4444',
  }[affiliate.status];

  const statusLabel = {
    active: 'Aktiv',
    pending: 'Ausstehend',
    inactive: 'Inaktiv',
  }[affiliate.status];

  return (
    <article className="aff-card" aria-label={`Affiliate ${affiliate.name}`}>
      {/* Header */}
      <div className="aff-card__header">
        <div className="aff-card__avatar">
          {affiliate.name.charAt(0).toUpperCase()}
        </div>
        <div className="aff-card__identity">
          <h3 className="aff-card__name">{affiliate.name}</h3>
          <span className="aff-card__email">{affiliate.email}</span>
        </div>
        <div className="aff-card__badges">
          <span
            className="aff-card__tier"
            style={{ backgroundColor: tier.color }}
            aria-label={`Tier ${affiliate.tier}: ${tier.label}`}
          >
            {tier.label} · {tier.rate}
          </span>
          <span
            className="aff-card__status"
            style={{ backgroundColor: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="aff-card__stats">
        <div className="aff-card__stat">
          <span className="aff-card__stat-value">
            {affiliate.revenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </span>
          <span className="aff-card__stat-label">Umsatz</span>
        </div>
        <div className="aff-card__stat">
          <span className="aff-card__stat-value">{affiliate.referrals}</span>
          <span className="aff-card__stat-label">Referrals</span>
        </div>
        <div className="aff-card__stat">
          <span className="aff-card__stat-value">{affiliate.conversionRate}%</span>
          <span className="aff-card__stat-label">Conversion</span>
        </div>
        <div className="aff-card__stat">
          <span className="aff-card__stat-value">
            {affiliate.nextPayout.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </span>
          <span className="aff-card__stat-label">Naechste Auszahlung</span>
        </div>
      </div>

      {/* Referral Code + Actions */}
      <div className="aff-card__referral">
        <code className="aff-card__code">{affiliate.code}</code>
        <div className="aff-card__actions">
          <button
            className="aff-card__btn aff-card__btn--share"
            onClick={handleShare}
            aria-label="Link teilen"
          >
            {copied ? '✓ Kopiert' : '↗ Teilen'}
          </button>
          <button
            className="aff-card__btn aff-card__btn--qr"
            onClick={toggleQr}
            aria-label="QR-Code anzeigen"
            aria-expanded={qrVisible}
          >
            ⊞ QR
          </button>
        </div>
      </div>

      {/* QR Code (Toggle) */}
      <div
        className={`aff-card__qr-panel ${qrVisible ? 'aff-card__qr-panel--open' : ''}`}
        aria-hidden={!qrVisible}
      >
        <canvas ref={qrCanvasRef} className="aff-card__qr-canvas" />
        <p className="aff-card__qr-hint">QR scannen fuer Empfehlungslink</p>
      </div>

      {/* Footer */}
      <div className="aff-card__footer">
        <span>Beitritt: {new Date(affiliate.joinedAt).toLocaleDateString('de-DE')}</span>
        <span>
          Letzte Auszahlung: {affiliate.lastPayout.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
        </span>
      </div>
    </article>
  );
}
