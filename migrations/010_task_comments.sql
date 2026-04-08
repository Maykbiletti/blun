-- Task Comments System
-- New table for CEO-Panel task comments

CREATE TABLE IF NOT EXISTS agent_task_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  user_id     UUID,
  comment     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON agent_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user ON agent_task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_time ON agent_task_comments(created_at);
