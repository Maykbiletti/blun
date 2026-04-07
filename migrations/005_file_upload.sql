-- Migration 005: File Upload System
-- Petra (Frontend) + Schema fuer Dieter
-- 2026-04-07

BEGIN;

-- =============================================================
-- ENUMs
-- =============================================================

CREATE TYPE upload_status AS ENUM (
    'pending',      -- Upload gestartet, noch nicht komplett
    'processing',   -- Virus-Scan / Thumbnail-Generierung
    'ready',        -- Verfuegbar
    'failed',       -- Verarbeitung fehlgeschlagen
    'quarantined',  -- Virus/Malware erkannt
    'deleted'       -- Soft-Delete
);

CREATE TYPE storage_backend AS ENUM (
    'local',        -- Lokaler 65er Storage
    'minio',        -- MinIO S3-kompatibel
    's3'            -- AWS S3
);

-- =============================================================
-- Tabelle: upload_buckets
-- Logische Gruppierung von Uploads (pro Agent, pro Kontext)
-- =============================================================

CREATE TABLE upload_buckets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    max_file_size   BIGINT DEFAULT 52428800,        -- 50 MB Default
    allowed_mimes   TEXT[] DEFAULT '{}',             -- Leer = alles erlaubt
    backend         storage_backend NOT NULL DEFAULT 'minio',
    backend_config  JSONB DEFAULT '{}',              -- Bucket-Name, Region, Endpoint
    is_public       BOOLEAN DEFAULT false,
    active          BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_bucket_agent_name UNIQUE (agent_id, name)
);

-- =============================================================
-- Tabelle: uploads
-- Jeder einzelne Upload
-- =============================================================

CREATE TABLE uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id       UUID NOT NULL REFERENCES upload_buckets(id) ON DELETE RESTRICT,
    agent_id        UUID NOT NULL,                   -- Wer hat hochgeladen

    -- Datei-Metadaten
    original_name   VARCHAR(512) NOT NULL,
    stored_name     VARCHAR(512) NOT NULL,            -- UUID-basiert, keine Kollisionen
    mime_type       VARCHAR(255) NOT NULL,
    file_size       BIGINT NOT NULL,                  -- Bytes
    sha256          CHAR(64) NOT NULL,                -- Deduplizierung + Integritaet

    -- Storage
    storage_path    TEXT NOT NULL,                     -- Relativer Pfad im Backend
    storage_url     TEXT,                              -- Signed URL / Public URL

    -- Verarbeitung
    status          upload_status NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    processing_meta JSONB DEFAULT '{}',               -- Thumbnail-Pfad, OCR-Text, etc.

    -- Bild-spezifisch
    width           INTEGER,
    height          INTEGER,
    thumbnail_path  TEXT,

    -- Versions-Kette
    supersedes_id   UUID REFERENCES uploads(id),      -- Ersetzt aeltere Version
    version         INTEGER NOT NULL DEFAULT 1,

    -- Kontext: Wozu gehoert der Upload?
    context_type    VARCHAR(64),                       -- 'message', 'email', 'memory', 'skill'
    context_id      UUID,                              -- ID des zugehoerigen Objekts

    -- Tags + Suche
    tags            TEXT[] DEFAULT '{}',
    description     TEXT,

    -- Zeitstempel
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,                       -- Auto-Cleanup
    deleted_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- Tabelle: upload_chunks
-- Fuer Multipart / Resumable Uploads
-- =============================================================

CREATE TABLE upload_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    chunk_size      BIGINT NOT NULL,
    sha256          CHAR(64) NOT NULL,
    storage_path    TEXT NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_chunk UNIQUE (upload_id, chunk_index)
);

-- =============================================================
-- Tabelle: upload_access_log
-- Wer hat wann auf welche Datei zugegriffen
-- =============================================================

CREATE TABLE upload_access_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL,
    action          VARCHAR(32) NOT NULL,             -- 'view', 'download', 'share', 'delete'
    ip_address      INET,
    user_agent      TEXT,
    accessed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- Indexes
-- =============================================================

-- Uploads pro Bucket, neueste zuerst
CREATE INDEX idx_uploads_bucket_created
    ON uploads (bucket_id, created_at DESC)
    WHERE status != 'deleted';

-- Uploads pro Agent
CREATE INDEX idx_uploads_agent_created
    ON uploads (agent_id, created_at DESC)
    WHERE status != 'deleted';

-- Deduplizierung: gleiche Datei schon vorhanden?
CREATE INDEX idx_uploads_sha256
    ON uploads (sha256)
    WHERE status = 'ready';

-- Kontext-Lookup: alle Uploads zu einer Message/Email/etc.
CREATE INDEX idx_uploads_context
    ON uploads (context_type, context_id)
    WHERE context_type IS NOT NULL AND status != 'deleted';

-- Pending/Processing fuer Worker-Queue
CREATE INDEX idx_uploads_pending
    ON uploads (uploaded_at ASC)
    WHERE status IN ('pending', 'processing');

-- Ablaufende Uploads fuer Cleanup-Job
CREATE INDEX idx_uploads_expiring
    ON uploads (expires_at ASC)
    WHERE expires_at IS NOT NULL AND status != 'deleted';

-- MIME-Type Filter (z.B. "zeig mir alle Bilder")
CREATE INDEX idx_uploads_mime
    ON uploads (mime_type, created_at DESC)
    WHERE status = 'ready';

-- Tags (GIN fuer Array-Contains)
CREATE INDEX idx_uploads_tags
    ON uploads USING GIN (tags)
    WHERE status != 'deleted';

-- Fulltext Deutsch auf original_name + description
ALTER TABLE uploads ADD COLUMN search_vector tsvector;

CREATE INDEX idx_uploads_fulltext_de
    ON uploads USING GIN (search_vector);

-- Chunks: schnell alle Chunks eines Uploads finden
CREATE INDEX idx_chunks_upload
    ON upload_chunks (upload_id, chunk_index ASC);

-- Access Log: History pro Upload
CREATE INDEX idx_access_log_upload
    ON upload_access_log (upload_id, accessed_at DESC);

-- Access Log: Aktivitaet pro Agent
CREATE INDEX idx_access_log_agent
    ON upload_access_log (agent_id, accessed_at DESC);

-- Buckets: aktive Buckets pro Agent
CREATE INDEX idx_buckets_agent_active
    ON upload_buckets (agent_id)
    WHERE active = true;

-- =============================================================
-- Trigger: updated_at
-- =============================================================

-- Wiederverwendet trg_set_updated_at() aus Migration 003/004,
-- falls nicht vorhanden:
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON upload_buckets
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON uploads
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Trigger: search_vector aktualisieren
-- =============================================================

CREATE OR REPLACE FUNCTION trg_uploads_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('german', COALESCE(NEW.original_name, '')), 'A') ||
        setweight(to_tsvector('german', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_search_vector BEFORE INSERT OR UPDATE OF original_name, description
    ON uploads
    FOR EACH ROW EXECUTE FUNCTION trg_uploads_search_vector();

COMMIT;
