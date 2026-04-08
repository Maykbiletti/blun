-- BLUN Multi-Tenant Migration (002)
-- Adds owner-based company isolation with per-company PostgreSQL schemas

-- 1) Extend companies table with owner and schema tracking
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schema_name   VARCHAR(63) UNIQUE,
  ADD COLUMN IF NOT EXISTS email         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description   TEXT;

-- Backfill schema_name for existing companies (safe default)
UPDATE companies SET schema_name = 'company_' || id WHERE schema_name IS NULL;

-- 2) Track active company per session
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS active_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;

-- 3) Index for fast user → company lookups
CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_user_id);

-- 4) Function: create isolated schema for a new company
CREATE OR REPLACE FUNCTION create_company_schema(p_schema_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema_name);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.agents (
      id           SERIAL PRIMARY KEY,
      company_id   INTEGER NOT NULL,
      name         VARCHAR(255) NOT NULL,
      role         TEXT,
      title        VARCHAR(255),
      model        VARCHAR(100),
      adapter_type VARCHAR(50) DEFAULT ''codex_local'',
      tools        JSONB DEFAULT ''[]'',
      config       JSONB DEFAULT ''{}'',
      status       VARCHAR(50) DEFAULT ''idle'',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )', p_schema_name);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.conversations (
      id         SERIAL PRIMARY KEY,
      agent_id   INTEGER NOT NULL,
      user_id    INTEGER,
      messages   JSONB DEFAULT ''[]'',
      meta       JSONB DEFAULT ''{}'',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )', p_schema_name);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.skills (
      id          SERIAL PRIMARY KEY,
      agent_id    INTEGER,
      skill_id    VARCHAR(255) NOT NULL,
      config      JSONB DEFAULT ''{}'',
      installed_at TIMESTAMPTZ DEFAULT NOW()
    )', p_schema_name);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.hook_configs (
      id         SERIAL PRIMARY KEY,
      agent_id   INTEGER NOT NULL,
      event      VARCHAR(100) NOT NULL,
      handler    TEXT NOT NULL,
      enabled    BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )', p_schema_name);
END;
$$;

-- 5) RLS on companies: users see only their own companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_owner_policy ON companies;
CREATE POLICY companies_owner_policy ON companies
  USING (
    owner_user_id IS NULL
    OR owner_user_id = NULLIF(current_setting('app.user_id', TRUE), '')::INTEGER
  );
