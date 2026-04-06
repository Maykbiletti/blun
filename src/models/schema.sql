-- BLUN - AI Organisator | MIT License
-- BLUN v2 Database Schema
-- Event-driven AI Agent Framework

-- Create database (run as postgres superuser)
SELECT 'CREATE DATABASE blun' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'blun');
\gexec

\connect blun

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Try pgvector if available (optional)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available — skipping vector embeddings';
END;
$$;

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  config      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AGENTS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_status') THEN
    CREATE TYPE agent_status AS ENUM ('active', 'idle', 'error', 'paused', 'offline');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  title         TEXT,
  status        agent_status DEFAULT 'idle',
  model         TEXT,
  adapter_type  TEXT DEFAULT 'codex_local',
  tools         JSONB DEFAULT '[]',
  config        JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_company ON agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id) ON DELETE SET NULL,
  title       TEXT,
  status      TEXT DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);

-- ============================================================
-- CONVERSATION MESSAGES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_type') THEN
    CREATE TYPE sender_type AS ENUM ('user', 'agent', 'system');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     sender_type NOT NULL,
  sender_id       UUID,
  body            TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_time ON conversation_messages(created_at);

-- ============================================================
-- MESSAGES (legacy / broadcast — flat chat per company)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id) ON DELETE SET NULL,
  sender_type sender_type NOT NULL,
  body        TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_company ON messages(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);

-- ============================================================
-- AGENT MEMORY
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_memory (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, key)
);

CREATE INDEX IF NOT EXISTS idx_memory_agent ON agent_memory(agent_id);

-- ============================================================
-- TASKS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'cancelled');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          task_status DEFAULT 'todo',
  priority        INT DEFAULT 0,
  parent_task_id  UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ============================================================
-- TOOL EXECUTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS tool_executions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  input       JSONB DEFAULT '{}',
  output      TEXT,
  status      TEXT DEFAULT 'running',
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tool_exec_agent ON tool_executions(agent_id);

-- ============================================================
-- COST EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID REFERENCES agents(id) ON DELETE CASCADE,
  provider      TEXT,
  model         TEXT,
  input_tokens  INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cost_cents    NUMERIC(10,4) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_costs_agent ON cost_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_costs_time ON cost_events(created_at);

-- ============================================================
-- HEARTBEATS
-- ============================================================
CREATE TABLE IF NOT EXISTS heartbeats (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID REFERENCES agents(id) ON DELETE CASCADE,
  status      TEXT,
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  stdout      TEXT,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_agent ON heartbeats(agent_id);

-- Done
