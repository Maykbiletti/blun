import { useState, useCallback, useRef, useEffect } from 'react';
import { AffiliateCard, type Affiliate } from './AffiliateCard';
import './affiliate-mobile.css';

interface AffiliateMobileViewProps {
  baseUrl?: string;
  apiBase?: string;
}

type SortKey = 'revenue' | 'referrals' | 'conversionRate' | 'joinedAt';
type FilterStatus = 'all' | 'active' | 'pending' | 'inactive';

// ─── Pull-to-Refresh Config ──────────────────────────────────
const PTR_THRESHOLD = 60;       // px zum Ausloesen
const PTR_MAX_PULL = 120;       // max px Pull-Distanz
const PTR_RESISTANCE = 0.4;     // Daempfungsfaktor

export function AffiliateMobileView({
  baseUrl = 'https://blun.ai',
  apiBase = 'http://localhost:3200/api',
}: AffiliateMobileViewProps) {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('revenue');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pull-to-Refresh State
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  // ── Daten laden ──
  const fetchAffiliates = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${apiBase}/affiliates`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAffiliates(data.affiliates ?? data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchAffiliates();
  }, [fetchAffiliates]);

  // ── Pull-to-Refresh Touch Handling ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
    setPulling(true);
  }, [refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY < 0) {
      isPulling.current = false;
      setPulling(false);
      setPullDistance(0);
      return;
    }
    const dampened = Math.min(deltaY * PTR_RESISTANCE, PTR_MAX_PULL);
    setPullDistance(dampened);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    setPulling(false);

    if (pullDistance >= PTR_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(0);
      fetchAffiliates();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, fetchAffiliates]);

  // ── Filter + Sort ──
  const filtered = affiliates
    .filter(a => filterStatus === 'all' || a.status === filterStatus)
    .filter(a =>
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'revenue':        return b.revenue - a.revenue;
        case 'referrals':      return b.referrals - a.referrals;
        case 'conversionRate': return b.conversionRate - a.conversionRate;
        case 'joinedAt':       return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
        default:               return 0;
      }
    });

  // ── Summary Stats ──
  const totalRevenue = affiliates.reduce((s, a) => s + a.revenue, 0);
  const totalReferrals = affiliates.reduce((s, a) => s + a.referrals, 0);
  const activeCount = affiliates.filter(a => a.status === 'active').length;

  return (
    <div
      className="aff-mobile"
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-Refresh Indicator */}
      <div
        className={`aff-ptr ${refreshing ? 'aff-ptr--refreshing' : ''}`}
        style={{
          height: refreshing ? PTR_THRESHOLD : pullDistance,
          opacity: refreshing ? 1 : Math.min(pullDistance / PTR_THRESHOLD, 1),
        }}
        aria-live="polite"
        role="status"
      >
        <div className={`aff-ptr__spinner ${refreshing ? 'aff-ptr__spinner--active' : ''}`}>
          {refreshing ? '↻ Aktualisiere...' : pullDistance >= PTR_THRESHOLD ? '↓ Loslassen' : '↓ Ziehen'}
        </div>
      </div>

      {/* Header */}
      <header className="aff-mobile__header">
        <h1 className="aff-mobile__title">Affiliates</h1>
        <p className="aff-mobile__subtitle">Dein Partner-Netzwerk</p>
      </header>

      {/* Summary Cards */}
      <div className="aff-summary">
        <div className="aff-summary__item">
          <span className="aff-summary__value">
            {totalRevenue.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </span>
          <span className="aff-summary__label">Gesamt-Umsatz</span>
        </div>
        <div className="aff-summary__item">
          <span className="aff-summary__value">{totalReferrals}</span>
          <span className="aff-summary__label">Referrals</span>
        </div>
        <div className="aff-summary__item">
          <span className="aff-summary__value">{activeCount}/{affiliates.length}</span>
          <span className="aff-summary__label">Aktiv</span>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="aff-toolbar">
        <input
          type="search"
          className="aff-toolbar__search"
          placeholder="Name, Code oder E-Mail..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Affiliates durchsuchen"
        />
        <div className="aff-toolbar__controls">
          <select
            className="aff-toolbar__select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as FilterStatus)}
            aria-label="Status filtern"
          >
            <option value="all">Alle</option>
            <option value="active">Aktiv</option>
            <option value="pending">Ausstehend</option>
            <option value="inactive">Inaktiv</option>
          </select>
          <select
            className="aff-toolbar__select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            aria-label="Sortierung"
          >
            <option value="revenue">Umsatz</option>
            <option value="referrals">Referrals</option>
            <option value="conversionRate">Conversion</option>
            <option value="joinedAt">Neueste</option>
          </select>
        </div>
      </div>

      {/* Card List */}
      <div className="aff-card-list" role="list">
        {loading && (
          <div className="aff-loading" role="status" aria-live="polite">
            <div className="aff-loading__skeleton" />
            <div className="aff-loading__skeleton" />
            <div className="aff-loading__skeleton" />
          </div>
        )}

        {error && (
          <div className="aff-error" role="alert">
            <p>Fehler: {error}</p>
            <button className="aff-error__retry" onClick={fetchAffiliates}>
              Erneut versuchen
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="aff-empty">
            <p>Keine Affiliates gefunden.</p>
          </div>
        )}

        {filtered.map(affiliate => (
          <div role="listitem" key={affiliate.id}>
            <AffiliateCard
              affiliate={affiliate}
              baseUrl={baseUrl}
            />
          </div>
        ))}
      </div>

      {/* Ergebnis-Zaehler */}
      {!loading && !error && (
        <p className="aff-mobile__count">
          {filtered.length} von {affiliates.length} Affiliates
        </p>
      )}
    </div>
  );
}
