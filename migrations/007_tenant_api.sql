-- ============================================================================
-- Migration 007: Tenant API Schema
-- Adds columns for tenant-api.js endpoints:
-- - software_projects: owner_user_id, created_at (if missing)
-- - agent_tasks: project_id (if missing)
-- - users: api_key, plan, role (if missing)
-- ============================================================================

-- Ensure software_projects has owner_user_id
ALTER TABLE software_projects
ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Ensure software_projects has created_at
ALTER TABLE software_projects
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Ensure agent_tasks has project_id
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES software_projects(id) ON DELETE CASCADE;

-- Ensure users has api_key
ALTER TABLE users
ADD COLUMN IF NOT EXISTS api_key VARCHAR(255) UNIQUE;

-- Ensure users has plan
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free';

-- Ensure users has role
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Create index for faster api_key lookups
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- Create index for project ownership lookups
CREATE INDEX IF NOT EXISTS idx_software_projects_owner ON software_projects(owner_user_id);

-- Create index for project tasks lookups
CREATE INDEX IF NOT EXISTS idx_agent_tasks_project ON agent_tasks(project_id);
