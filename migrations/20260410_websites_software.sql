-- Websites + Software tables
-- Idempotent migration

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS websites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  template TEXT NOT NULL,
  description TEXT,
  content JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft',
  domain TEXT,
  deployed_url TEXT,
  hero_image TEXT,
  primary_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS software (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  provider_plan TEXT,
  description TEXT,
  api_key_encrypted TEXT,
  signed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft',
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_websites_user_id ON websites(user_id);
CREATE INDEX IF NOT EXISTS idx_websites_company_id ON websites(company_id);
CREATE INDEX IF NOT EXISTS idx_software_user_id ON software(user_id);
CREATE INDEX IF NOT EXISTS idx_software_company_id ON software(company_id);

DROP TRIGGER IF EXISTS trg_websites_updated_at ON websites;
CREATE TRIGGER trg_websites_updated_at
BEFORE UPDATE ON websites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_software_updated_at ON software;
CREATE TRIGGER trg_software_updated_at
BEFORE UPDATE ON software
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
