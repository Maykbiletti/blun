-- Migration 002: Agent-Kommunikation Schema
-- BLUN.ai Agent-Team
-- Erstellt: 2026-04-07

BEGIN;

-- =============================================================
-- ENUMs
-- =============================================================
CREATE TYPE channel_type AS ENUM ('direct', 'group', 'broadcast');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'failed');

-- =============================================================
-- Tabelle: channels — Kommunikationskanaele
-- =============================================================
CREATE TABLE channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255),
    channel_type    channel_type NOT NULL DEFAULT 'direct',
    created_by      UUID NOT NULL,  -- agent_id, FK kommt separat
    active          BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aktive Kanaele nach Typ
CREATE INDEX idx_channels_type ON channels (channel_type)
    WHERE active = true;

-- Trigger: updated_at
CREATE TRIGGER trg_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Tabelle: messages — Nachrichten
-- =============================================================
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL,      -- agent_id, FK kommt separat
    recipient_id    UUID,               -- NULL bei Broadcast/Group
    payload         JSONB NOT NULL DEFAULT '{}',
    status          message_status NOT NULL DEFAULT 'sent',
    priority        INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    parent_id       UUID REFERENCES messages(id),  -- Threading
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nachrichten pro Kanal chronologisch
CREATE INDEX idx_messages_channel_created ON messages (channel_id, created_at DESC);

-- Alle Nachrichten eines Agents
CREATE INDEX idx_messages_sender ON messages (sender_id, created_at DESC);

-- Ungelesene/offene Nachrichten
CREATE INDEX idx_messages_recipient ON messages (recipient_id, status);

-- Nur aktive (nicht gelesene) Nachrichten
CREATE INDEX idx_messages_status ON messages (status, created_at DESC)
    WHERE status != 'read';

-- Trigger: updated_at
CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =============================================================
-- Tabelle: message_history — Audit-Trail
-- =============================================================
CREATE TABLE message_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    action          VARCHAR(50) NOT NULL,  -- edit, delete, status_change
    old_value       JSONB,
    new_value       JSONB,
    changed_by      UUID NOT NULL,  -- agent_id
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- History pro Nachricht
CREATE INDEX idx_message_history_message ON message_history (message_id, changed_at DESC);

COMMIT;
