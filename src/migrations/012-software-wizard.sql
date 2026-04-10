-- BLUN Software Wizard Migration (012)
-- Tables for multi-KI software generator

-- Software briefs: interview/wizard output
CREATE TABLE IF NOT EXISTS software_briefs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  brief       JSONB NOT NULL DEFAULT '{}',
  app_type    VARCHAR(50) NOT NULL DEFAULT 'pwa',
  status      VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_software_briefs_user ON software_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_software_briefs_tenant ON software_briefs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_software_briefs_status ON software_briefs(status);

-- Software variants: one row per KI per brief
CREATE TABLE IF NOT EXISTS software_variants (
  id          SERIAL PRIMARY KEY,
  brief_id    INTEGER NOT NULL REFERENCES software_briefs(id) ON DELETE CASCADE,
  ai_provider VARCHAR(100) NOT NULL,
  style_hint  VARCHAR(100),
  code        JSONB,
  html        TEXT,
  features    JSONB NOT NULL DEFAULT '[]',
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_software_variants_brief ON software_variants(brief_id);
CREATE INDEX IF NOT EXISTS idx_software_variants_provider ON software_variants(ai_provider);

-- Software compositions: user picks blocks from variants
CREATE TABLE IF NOT EXISTS software_compositions (
  id               SERIAL PRIMARY KEY,
  brief_id         INTEGER NOT NULL REFERENCES software_briefs(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_selection  JSONB NOT NULL DEFAULT '{}',
  final_code       JSONB,
  final_html       TEXT,
  status           VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_software_compositions_brief ON software_compositions(brief_id);
CREATE INDEX IF NOT EXISTS idx_software_compositions_user ON software_compositions(user_id);

-- Software publishes: deploy records
CREATE TABLE IF NOT EXISTS software_publishes (
  id              SERIAL PRIMARY KEY,
  composition_id  INTEGER NOT NULL REFERENCES software_compositions(id) ON DELETE CASCADE,
  subdomain       VARCHAR(255),
  custom_domain   VARCHAR(255),
  deploy_type     VARCHAR(20) NOT NULL DEFAULT 'pwa',
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT software_publishes_deploy_type_check CHECK (deploy_type IN ('pwa', 'download'))
);

CREATE INDEX IF NOT EXISTS idx_software_publishes_composition ON software_publishes(composition_id);

-- Grants
GRANT ALL ON TABLE software_briefs TO blun;
GRANT ALL ON TABLE software_variants TO blun;
GRANT ALL ON TABLE software_compositions TO blun;
GRANT ALL ON TABLE software_publishes TO blun;
GRANT USAGE, SELECT ON SEQUENCE software_briefs_id_seq TO blun;
GRANT USAGE, SELECT ON SEQUENCE software_variants_id_seq TO blun;
GRANT USAGE, SELECT ON SEQUENCE software_compositions_id_seq TO blun;
GRANT USAGE, SELECT ON SEQUENCE software_publishes_id_seq TO blun;
