-- Migration 003: Agent Email System
-- Mailbox-Tabellen, Routing-Config, Indices
-- Erstellt: 2026-04-07

BEGIN;

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE email_status AS ENUM ('draft', 'queued', 'sent', 'delivered', 'read', 'bounced', 'failed');
CREATE TYPE routing_strategy AS ENUM ('round_robin', 'priority', 'skills_based', 'direct');

-- ============================================================
-- Tabelle: agent_mailboxes
-- Postfach pro Agent
-- ============================================================

CREATE TABLE agent_mailboxes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL,  -- FK kommt mit agents-Migration
    address         TEXT NOT NULL
                        CONSTRAINT chk_mailbox_address CHECK (address ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
    display_name    TEXT,
    domain          TEXT NOT NULL GENERATED ALWAYS AS (split_part(address, '@', 2)) STORED,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    auto_reply      BOOLEAN NOT NULL DEFAULT false,
    auto_reply_text TEXT,
    signature       TEXT,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nur eine Adresse systemweit
ALTER TABLE agent_mailboxes
    ADD CONSTRAINT uq_mailbox_address UNIQUE (address);

-- Max. 1 Primary-Mailbox pro Agent
CREATE UNIQUE INDEX idx_mailbox_agent_primary
    ON agent_mailboxes (agent_id)
    WHERE is_primary = true;

-- Alle Mailboxen eines Agents
CREATE INDEX idx_mailbox_agent
    ON agent_mailboxes (agent_id)
    WHERE is_active = true;

-- Mailboxen nach Domain (fuer Routing)
CREATE INDEX idx_mailbox_domain
    ON agent_mailboxes (domain)
    WHERE is_active = true;

-- ============================================================
-- Tabelle: agent_emails
-- E-Mails mit RFC-822 Headern und Threading
-- ============================================================

CREATE TABLE agent_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id      UUID NOT NULL REFERENCES agent_mailboxes(id) ON DELETE CASCADE,
    direction       email_direction NOT NULL,
    status          email_status NOT NULL DEFAULT 'draft',

    -- RFC-822 Header
    message_id      TEXT NOT NULL UNIQUE,   -- RFC <message-id>
    in_reply_to     TEXT,                    -- RFC In-Reply-To
    "references"    TEXT[],                  -- RFC References
    thread_id       UUID,                    -- berechnete Thread-ID

    -- Adressen
    sender_address  TEXT NOT NULL,
    recipient_addresses TEXT[] NOT NULL DEFAULT '{}',
    cc_addresses    TEXT[] DEFAULT '{}',
    bcc_addresses   TEXT[] DEFAULT '{}',
    reply_to        TEXT,

    -- Inhalt
    subject         TEXT,
    body_text       TEXT,
    body_html       TEXT,
    priority        SMALLINT NOT NULL DEFAULT 3
                        CONSTRAINT chk_email_priority CHECK (priority BETWEEN 1 AND 5),

    -- Metadaten
    is_read         BOOLEAN NOT NULL DEFAULT false,
    is_starred      BOOLEAN NOT NULL DEFAULT false,
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    has_attachments BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}',

    -- Fulltext
    search_vector   tsvector,

    -- Timestamps
    sent_at         TIMESTAMPTZ,
    received_at     TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inbox-Sortierung: Mails pro Mailbox chronologisch
CREATE INDEX idx_emails_mailbox_created
    ON agent_emails (mailbox_id, created_at DESC);

-- Thread-Ansicht
CREATE INDEX idx_emails_thread
    ON agent_emails (thread_id, created_at ASC)
    WHERE thread_id IS NOT NULL;

-- Ungelesene Inbound-Mails
CREATE INDEX idx_emails_unread
    ON agent_emails (mailbox_id, created_at DESC)
    WHERE direction = 'inbound' AND is_read = false AND is_archived = false;

-- Outbound-Tracking (nicht-delivered)
CREATE INDEX idx_emails_status
    ON agent_emails (status, created_at DESC)
    WHERE direction = 'outbound' AND status NOT IN ('delivered', 'read');

-- Gemerkte Mails
CREATE INDEX idx_emails_starred
    ON agent_emails (mailbox_id, created_at DESC)
    WHERE is_starred = true;

-- GIN Fulltext Deutsch auf Subject + Body
CREATE INDEX idx_emails_fulltext_de
    ON agent_emails USING GIN (search_vector);

-- Direction-Filter
CREATE INDEX idx_emails_direction
    ON agent_emails (mailbox_id, direction, created_at DESC);

-- ============================================================
-- Tabelle: email_attachments
-- S3/MinIO-Referenz mit Checksum
-- ============================================================

CREATE TABLE email_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id        UUID NOT NULL REFERENCES agent_emails(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    storage_path    TEXT NOT NULL,           -- S3/MinIO Key
    sha256          TEXT NOT NULL,
    is_inline       BOOLEAN NOT NULL DEFAULT false,
    content_id      TEXT,                    -- CID fuer Inline-Bilder
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attachments pro Email
CREATE INDEX idx_attachments_email
    ON email_attachments (email_id);

-- Nach MIME-Typ filtern (z.B. alle PDFs)
CREATE INDEX idx_attachments_mimetype
    ON email_attachments (mime_type);

-- ============================================================
-- Tabelle: email_routing_rules
-- Routing-Config pro Mailbox/Domain
-- ============================================================

CREATE TABLE email_routing_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id      UUID REFERENCES agent_mailboxes(id) ON DELETE CASCADE,
    domain          TEXT,                    -- Domain-weite Regel wenn mailbox_id NULL
    name            TEXT NOT NULL,
    description     TEXT,
    priority        INTEGER NOT NULL DEFAULT 100,
    is_active       BOOLEAN NOT NULL DEFAULT true,

    -- Matching
    match_from      TEXT,                    -- Regex auf Absender
    match_subject   TEXT,                    -- Regex auf Subject
    match_header    JSONB,                   -- Header-Key/Value Matching
    match_body      TEXT,                    -- Regex auf Body

    -- Aktion
    strategy        routing_strategy NOT NULL DEFAULT 'direct',
    forward_to      TEXT[],                  -- Weiterleitungs-Adressen
    auto_reply_text TEXT,                    -- Auto-Reply Template
    classify_as     TEXT,                    -- Label/Kategorie zuweisen
    action_config   JSONB NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Entweder Mailbox oder Domain, nicht beides leer
    CONSTRAINT chk_routing_target CHECK (mailbox_id IS NOT NULL OR domain IS NOT NULL)
);

-- Routing-Regeln nach Prioritaet (nur aktive)
CREATE INDEX idx_routing_mailbox_priority
    ON email_routing_rules (mailbox_id, priority ASC)
    WHERE is_active = true;

-- Domain-weite Regeln
CREATE INDEX idx_routing_domain_priority
    ON email_routing_rules (domain, priority ASC)
    WHERE is_active = true AND domain IS NOT NULL;

-- ============================================================
-- Tabelle: email_labels
-- Labels pro Mailbox
-- ============================================================

CREATE TABLE email_labels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id      UUID NOT NULL REFERENCES agent_mailboxes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT DEFAULT '#6B7280',
    is_system       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_label_per_mailbox UNIQUE (mailbox_id, name)
);

-- ============================================================
-- Tabelle: email_label_assignments
-- M:N Email <-> Label
-- ============================================================

CREATE TABLE email_label_assignments (
    email_id        UUID NOT NULL REFERENCES agent_emails(id) ON DELETE CASCADE,
    label_id        UUID NOT NULL REFERENCES email_labels(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (email_id, label_id)
);

-- Labels pro Email
CREATE INDEX idx_label_assignments_email
    ON email_label_assignments (email_id);

-- Emails pro Label
CREATE INDEX idx_label_assignments_label
    ON email_label_assignments (label_id);

-- ============================================================
-- Trigger: updated_at automatisch setzen
-- ============================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_mailboxes
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON agent_emails
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_routing_rules
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- Trigger: Search-Vector berechnen (Deutsch)
-- ============================================================

CREATE OR REPLACE FUNCTION trg_compute_email_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('german', coalesce(NEW.subject, '')), 'A') ||
        setweight(to_tsvector('german', coalesce(NEW.body_text, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_search_vector BEFORE INSERT OR UPDATE OF subject, body_text
    ON agent_emails
    FOR EACH ROW EXECUTE FUNCTION trg_compute_email_search_vector();

-- ============================================================
-- Trigger: Thread-ID berechnen aus in_reply_to
-- ============================================================

CREATE OR REPLACE FUNCTION trg_compute_thread_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.in_reply_to IS NOT NULL AND NEW.thread_id IS NULL THEN
        -- Thread-ID vom Parent uebernehmen
        SELECT thread_id INTO NEW.thread_id
        FROM agent_emails
        WHERE message_id = NEW.in_reply_to;

        -- Wenn Parent keinen Thread hat, neuen Thread starten
        IF NEW.thread_id IS NULL THEN
            SELECT id INTO NEW.thread_id
            FROM agent_emails
            WHERE message_id = NEW.in_reply_to;
        END IF;
    END IF;

    -- Wenn immer noch NULL (neue Konversation), eigene ID als Thread
    IF NEW.thread_id IS NULL THEN
        NEW.thread_id := NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compute_thread_id BEFORE INSERT
    ON agent_emails
    FOR EACH ROW EXECUTE FUNCTION trg_compute_thread_id();

-- ============================================================
-- System-Labels als Seed
-- ============================================================

-- Werden pro Mailbox beim Erstellen angelegt (Application-Layer),
-- hier nur als Referenz:
-- inbox, sent, drafts, trash, spam, archive

COMMIT;
