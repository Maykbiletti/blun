-- Migration 001: Skill-Katalog Schema
-- BLUN.ai Agent-Team
-- Erstellt: 2026-04-07

BEGIN;

-- =============================================================
-- Trigger-Funktion: updated_at automatisch setzen
-- =============================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- Tabelle: skills — Hauptkatalog
-- =============================================================
CREATE TABLE skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(100),
    author_id       UUID NOT NULL,
    license         VARCHAR(50) DEFAULT 'MIT',
    repository_url  TEXT,
    icon_url        TEXT,
    active          BOOLEAN NOT NULL DEFAULT true,
    public          BOOLEAN NOT NULL DEFAULT false,
    download_count  INTEGER NOT NULL DEFAULT 0,
    rating          NUMERIC(2,1) DEFAULT 0.0 CHECK (rating >= 0.0 AND rating <= 5.0),
    rating_count    INTEGER NOT NULL DEFAULT 0,
    search_vector   tsvector,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fulltext Deutsch auf name + description
CREATE INDEX idx_skills_fulltext_de ON skills USING GIN (search_vector);

-- Slug-Lookup (URL-Routing)
CREATE UNIQUE INDEX idx_skills_slug_active ON skills (slug) WHERE active = true;

-- Kategorie-Filter fuer Marketplace
CREATE INDEX idx_skills_category_public ON skills (category)
    WHERE active = true AND public = true;

-- Populaere Skills (Marketplace-Startseite)
CREATE INDEX idx_skills_popular ON skills (download_count DESC, rating DESC)
    WHERE active = true AND public = true;

-- Trigger: updated_at
CREATE TRIGGER trg_skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Trigger: search_vector aktualisieren
CREATE OR REPLACE FUNCTION trg_skills_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('german', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('german', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_skills_search_vector
    BEFORE INSERT OR UPDATE OF name, description ON skills
    FOR EACH ROW EXECUTE FUNCTION trg_skills_search_vector();

-- =============================================================
-- Tabelle: skill_versions — Semver-Versionierung
-- =============================================================
CREATE TABLE skill_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id        UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    version         VARCHAR(50) NOT NULL,
    config_schema   JSONB DEFAULT '{}',
    entry_point     VARCHAR(500) NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    is_latest       BOOLEAN NOT NULL DEFAULT true,
    changelog       TEXT,
    min_agent_version VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (skill_id, version)
);

-- Version-Lookup: Covering Index
CREATE INDEX idx_skill_versions_lookup ON skill_versions (skill_id, version DESC)
    INCLUDE (config_schema, entry_point);

-- Stale-Version Cleanup
CREATE INDEX idx_skill_versions_stale ON skill_versions (created_at)
    WHERE is_latest = false;

-- =============================================================
-- Tabelle: skill_flags — Feature-Flags pro Skill
-- =============================================================
CREATE TABLE skill_flags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    flag_key    VARCHAR(100) NOT NULL,
    flag_value  JSONB DEFAULT 'true',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (skill_id, flag_key)
);

-- GIN Index auf Flags fuer @> Operator
CREATE INDEX idx_skill_flags_value ON skill_flags USING GIN (flag_value);

-- Trigger: updated_at
CREATE TRIGGER trg_skill_flags_updated_at
    BEFORE UPDATE ON skill_flags
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Tabelle: agent_skills — M:N Agent <-> Skill
-- =============================================================
CREATE TABLE agent_skills (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID NOT NULL,  -- FK kommt in separater Migration
    skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    version_id  UUID REFERENCES skill_versions(id),
    config      JSONB DEFAULT '{}',
    priority    INTEGER NOT NULL DEFAULT 100,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, skill_id)
);

-- Agent-Skills schnell abfragen
CREATE INDEX idx_agent_skills_agent_enabled ON agent_skills (agent_id, enabled)
    WHERE enabled = true;

CREATE INDEX idx_agent_skills_skill ON agent_skills (skill_id);

-- Trigger: updated_at
CREATE TRIGGER trg_agent_skills_updated_at
    BEFORE UPDATE ON agent_skills
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
