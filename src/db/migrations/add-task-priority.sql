-- Migration: Add priority field to agent_tasks for Kanban Board
-- Adds support for task prioritization in Kanban view

-- Add priority column if it doesn't exist
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;

-- Add updated_at column if it doesn't exist (for tracking updates)
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add description column for task details
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create index for faster sorting by status + priority
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_priority
ON agent_tasks(status, priority, created_at DESC);

-- Set default status if needed
ALTER TABLE agent_tasks
ALTER COLUMN status SET DEFAULT 'pending';

-- Update existing tasks to have status if NULL
UPDATE agent_tasks SET status = 'pending' WHERE status IS NULL;
