-- Migration 004: Memory Sync Schema (Dieter Telegram -> DB)
-- BLUN.ai Agent-Team
-- Erstellt: 2026-04-07

BEGIN;

-- =============================================================
-- ENUMs
-- =============================================================
CREATE TYPE memory_type AS ENUM ('user', 'feedback', 'project', 'reference');
CREATE TYPE memory_source_type AS ENUM ('telegram', 'slack', 'email', 'manual', 'api');
CREATE TYPE sync_status AS ENUM ('running', 'completed', 'failed', 'partial');

-- =============================================================
-- Tabelle: memory_sources — Quellen-Konfiguration
-- =============================================================
CREATE TABLE memory_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL,
    source_type     memory_source_type NOT NULL,
    name            VARCHAR(255) NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',  -- Bot-Token, Chat-ID etc.
    sync_interval   INTERVAL NOT NULL DEFAULT '1 day',
    last_sync_at    TIMESTAMPTZ,
    next_sync_at    TIMESTAMPTZ,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, source_type, name)
);

-- Aktive Quellen pro Agent
CREATE INDEX idx_sources_agent_active ON memory_sources (agent_id)
    WHERE active = true;

-- Naechster faelliger Sync
CREATE INDEX idx_sources_next_sync ON memory_sources (next_sync_at)
    WHERE active = true AND next_sync_at IS NOT NULL;

-- Trigger: updated_at
CREATE TRIGGER trg_memory_sources_updated_at
    BEFORE UPDATE ON memory_sources
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Tabelle: memory_entries — Die Memorys selbst
-- =============================================================
CREATE TABLE memory_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL,
    source_id       UUID REFERENCES memory_sources(id) ON DELETE SET NULL,
    memory_type     memory_type NOT NULL DEFAULT 'project',
    memory_key      VARCHAR(255) NOT NULL,
    title           VARCHAR(500),
    content         TEXT NOT NULL,
    content_hash    VARCHAR(64) NOT NULL,  -- SHA256 fuer Deduplizierung
    summary         TEXT,
    external_id     VARCHAR(255),  -- z.B. Telegram Message-ID
    supersedes_id   UUID REFERENCES memory_entries(id),
    importance      INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
    expires_at      TIMESTAMPTZ,
    active          BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB DEFAULT '{}',
    search_vector   tsvector,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, agent_id, memory_key)
);

-- Chronologische Abfrage
CREATE INDEX idx_entries_agent_type ON memory_entries (agent_id, memory_type, created_at DESC)
    WHERE active = true;

-- Nach Source filtern
CREATE INDEX idx_entries_source ON memory_entries (source_id, created_at DESC)
    WHERE active = true;

-- External-ID Lookup (Telegram-Dedup)
CREATE UNIQUE INDEX idx_entries_external ON memory_entries (source_id, external_id)
    WHERE external_id IS NOT NULL;

-- Hash-basierte Deduplizierung
CREATE INDEX idx_entries_hash ON memory_entries (agent_id, content_hash);

-- Top-Erinnerungen
CREATE INDEX idx_entries_importance ON memory_entries (agent_id, importance DESC)
    WHERE active = true;

-- Ablaufende Entries fuer Cleanup-Job
CREATE INDEX idx_entries_expiring ON memory_entries (expires_at)
    WHERE expires_at IS NOT NULL AND active = true;

-- GIN auf Metadata
CREATE INDEX idx_entries_metadata ON memory_entries USING GIN (metadata);

-- GIN Fulltext Deutsch
CREATE INDEX idx_entries_fulltext_de ON memory_entries USING GIN (search_vector);

-- Trigger: updated_at
CREATE TRIGGER trg_memory_entries_updated_at
    BEFORE UPDATE ON memory_entries
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Trigger: search_vector
CREATE OR REPLACE FUNCTION trg_memory_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('german', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('german', COALESCE(NEW.content, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_entries_search_vector
    BEFORE INSERT OR UPDATE OF title, content ON memory_entries
    FOR EACH ROW EXECUTE FUNCTION trg_memory_search_vector();

-- Trigger: Content-Hash berechnen
CREATE OR REPLACE FUNCTION trg_compute_memory_hash()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_hash := encode(sha256(NEW.content::bytea), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_entries_hash
    BEFORE INSERT OR UPDATE OF content ON memory_entries
    FOR EACH ROW EXECUTE FUNCTION trg_compute_memory_hash();

-- Trigger: Abgelaufene Entries archivieren
CREATE OR REPLACE FUNCTION trg_auto_archive_expired()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at < NOW() AND NEW.active = true THEN
        NEW.active := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_entries_auto_archive
    BEFORE UPDATE ON memory_entries
    FOR EACH ROW EXECUTE FUNCTION trg_auto_archive_expired();

-- =============================================================
-- Tabelle: memory_sync_runs — Job-Tracking
-- =============================================================
CREATE TABLE memory_sync_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID NOT NULL REFERENCES memory_sources(id) ON DELETE CASCADE,
    status          sync_status NOT NULL DEFAULT 'running',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    stats           JSONB DEFAULT '{}',  -- fetched, new, updated, skipped
    error_log       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync-History pro Quelle
CREATE INDEX idx_sync_runs_source ON memory_sync_runs (source_id, started_at DESC);

-- Offene/fehlgeschlagene Runs
CREATE INDEX idx_sync_runs_status ON memory_sync_runs (status)
    WHERE status IN ('running', 'failed');

-- =============================================================
-- Tabelle: memory_tags
-- =============================================================
CREATE TABLE memory_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    color       VARCHAR(7) DEFAULT '#808080',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- Tabelle: memory_entry_tags — M:N
-- =============================================================
CREATE TABLE memory_entry_tags (
    entry_id    UUID NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES memory_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
);

-- =============================================================
-- Seed: Standard-Tags
-- =============================================================
INSERT INTO memory_tags (name, color) VALUES
    ('server',      '#3B82F6'),
    ('modelle',     '#8B5CF6'),
    ('telegram',    '#0EA5E9'),
    ('bugfix',      '#EF4444'),
    ('feature',     '#22C55E'),
    ('deployment',  '#F97316'),
    ('security',    '#DC2626'),
    ('performance', '#EAB308'),
    ('config',      '#6B7280'),
    ('agent',       '#EC4899');

COMMIT;
