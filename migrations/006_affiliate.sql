-- Migration 006: Affiliate System Schema
-- BLUN.ai Agent-Team
-- Erstellt: 2026-04-07

BEGIN;

-- =============================================================
-- ENUMs
-- =============================================================
CREATE TYPE affiliate_status AS ENUM ('pending', 'active', 'suspended', 'terminated');
CREATE TYPE referral_status AS ENUM ('clicked', 'registered', 'converted', 'expired', 'fraudulent');
CREATE TYPE payout_status AS ENUM ('pending', 'approved', 'processing', 'paid', 'failed', 'cancelled');
CREATE TYPE payout_method AS ENUM ('bank_transfer', 'paypal', 'crypto', 'credit');

-- =============================================================
-- Tabelle: affiliates — Partner-Accounts
-- =============================================================
CREATE TABLE affiliates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL,
    code            VARCHAR(50) NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    email           VARCHAR(320) NOT NULL,
    website_url     TEXT,
    status          affiliate_status NOT NULL DEFAULT 'pending',
    commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000,
    cookie_days     INTEGER NOT NULL DEFAULT 30,
    payout_method   payout_method NOT NULL DEFAULT 'bank_transfer',
    payout_details  JSONB DEFAULT '{}',
    payout_minimum  NUMERIC(10,2) NOT NULL DEFAULT 50.00,
    total_earned    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_paid      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    balance         NUMERIC(12,2) GENERATED ALWAYS AS (total_earned - total_paid) STORED,
    referral_count  INTEGER NOT NULL DEFAULT 0,
    conversion_count INTEGER NOT NULL DEFAULT 0,
    metadata        JSONB DEFAULT '{}',
    terms_accepted_at TIMESTAMPTZ,
    activated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_affiliate_code UNIQUE (code),
    CONSTRAINT uq_affiliate_agent UNIQUE (agent_id),
    CONSTRAINT chk_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 1),
    CONSTRAINT chk_cookie_days CHECK (cookie_days >= 1 AND cookie_days <= 365),
    CONSTRAINT chk_payout_minimum CHECK (payout_minimum >= 0)
);

CREATE TRIGGER trg_affiliates_updated_at
    BEFORE UPDATE ON affiliates
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Tabelle: referrals — Geworbene Nutzer / Klicks
-- =============================================================
CREATE TABLE referrals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
    visitor_id      VARCHAR(64),
    ip_hash         VARCHAR(64),
    user_agent      TEXT,
    landing_page    TEXT,
    referrer_url    TEXT,
    utm_source      VARCHAR(100),
    utm_medium      VARCHAR(100),
    utm_campaign    VARCHAR(100),
    status          referral_status NOT NULL DEFAULT 'clicked',
    converted_user_id UUID,
    conversion_value NUMERIC(10,2),
    commission_amount NUMERIC(10,2),
    commission_rate NUMERIC(5,4),
    cookie_expires_at TIMESTAMPTZ,
    clicked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at   TIMESTAMPTZ,
    converted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_referrals_updated_at
    BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Tabelle: payouts — Auszahlungen
-- =============================================================
CREATE TABLE payouts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id    UUID NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
    amount          NUMERIC(10,2) NOT NULL,
    currency        VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status          payout_status NOT NULL DEFAULT 'pending',
    payout_method   payout_method NOT NULL,
    payout_details  JSONB DEFAULT '{}',
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    referral_count  INTEGER NOT NULL DEFAULT 0,
    transaction_ref VARCHAR(255),
    notes           TEXT,
    approved_by     UUID,
    approved_at     TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    failed_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_payout_amount CHECK (amount > 0),
    CONSTRAINT chk_payout_period CHECK (period_end >= period_start)
);

CREATE TRIGGER trg_payouts_updated_at
    BEFORE UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Indexes: affiliates
-- =============================================================

-- Affiliate-Code Lookup (URL-Routing: /ref/CODE)
CREATE INDEX idx_affiliates_code_active
    ON affiliates (code)
    WHERE status = 'active';

-- Affiliates pro Agent
CREATE INDEX idx_affiliates_agent
    ON affiliates (agent_id);

-- Affiliates nach Status (Admin-Dashboard)
CREATE INDEX idx_affiliates_status
    ON affiliates (status, created_at DESC);

-- Top-Earner Ranking
CREATE INDEX idx_affiliates_ranking
    ON affiliates (total_earned DESC)
    WHERE status = 'active';

-- Auszahlungs-fällige Affiliates (balance >= payout_minimum)
CREATE INDEX idx_affiliates_payout_due
    ON affiliates (balance DESC)
    WHERE status = 'active';

-- =============================================================
-- Indexes: referrals
-- =============================================================

-- Referrals pro Affiliate + Zeit (Dashboard)
CREATE INDEX idx_referrals_affiliate_clicked
    ON referrals (affiliate_id, clicked_at DESC);

-- Conversions pro Affiliate (Abrechnung)
CREATE INDEX idx_referrals_affiliate_converted
    ON referrals (affiliate_id, converted_at DESC)
    WHERE status = 'converted';

-- Offene Referrals (Cookie noch gueltig, nicht konvertiert)
CREATE INDEX idx_referrals_pending
    ON referrals (cookie_expires_at)
    WHERE status IN ('clicked', 'registered');

-- Visitor-Dedup (gleicher Besucher klickt mehrfach)
CREATE INDEX idx_referrals_visitor
    ON referrals (visitor_id, affiliate_id)
    WHERE visitor_id IS NOT NULL;

-- Converted User Lookup (User -> welcher Affiliate)
CREATE INDEX idx_referrals_converted_user
    ON referrals (converted_user_id)
    WHERE converted_user_id IS NOT NULL;

-- UTM Kampagnen-Auswertung
CREATE INDEX idx_referrals_campaign
    ON referrals (utm_campaign, utm_source)
    WHERE utm_campaign IS NOT NULL;

-- =============================================================
-- Indexes: payouts
-- =============================================================

-- Payouts pro Affiliate + Zeit
CREATE INDEX idx_payouts_affiliate_created
    ON payouts (affiliate_id, created_at DESC);

-- Offene Payouts (Admin-Queue)
CREATE INDEX idx_payouts_pending
    ON payouts (created_at ASC)
    WHERE status IN ('pending', 'approved', 'processing');

-- Fehlgeschlagene Payouts (Retry-Queue)
CREATE INDEX idx_payouts_failed
    ON payouts (updated_at DESC)
    WHERE status = 'failed';

-- Payouts nach Periode (Reporting)
CREATE INDEX idx_payouts_period
    ON payouts (period_start, period_end);

-- Transaction-Ref Lookup (Bank-Abgleich)
CREATE INDEX idx_payouts_transaction_ref
    ON payouts (transaction_ref)
    WHERE transaction_ref IS NOT NULL;

-- =============================================================
-- Trigger: Affiliate-Statistiken bei Conversion aktualisieren
-- =============================================================
CREATE OR REPLACE FUNCTION trg_update_affiliate_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'converted' AND (OLD.status IS NULL OR OLD.status != 'converted') THEN
        UPDATE affiliates SET
            referral_count = referral_count + 1,
            conversion_count = conversion_count + 1,
            total_earned = total_earned + COALESCE(NEW.commission_amount, 0)
        WHERE id = NEW.affiliate_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_referral_conversion
    AFTER INSERT OR UPDATE OF status ON referrals
    FOR EACH ROW EXECUTE FUNCTION trg_update_affiliate_stats();

-- =============================================================
-- Trigger: Payout-Betrag von Balance abziehen bei 'paid'
-- =============================================================
CREATE OR REPLACE FUNCTION trg_update_affiliate_payout()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        UPDATE affiliates SET
            total_paid = total_paid + NEW.amount
        WHERE id = NEW.affiliate_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payout_paid
    AFTER UPDATE OF status ON payouts
    FOR EACH ROW EXECUTE FUNCTION trg_update_affiliate_payout();

COMMIT;
