-- AI routing learning feedback
-- [MKI-017] Lernendes Routing

CREATE TABLE IF NOT EXISTS ai_routing_feedback (
  id BIGSERIAL PRIMARY KEY,
  route_key TEXT NOT NULL,
  task_type TEXT,
  provider TEXT,
  model TEXT,
  priority TEXT,
  local_only BOOLEAN DEFAULT FALSE,
  success BOOLEAN NOT NULL,
  quality_score NUMERIC(5,2),
  feedback_score NUMERIC(5,2),
  cost_usd NUMERIC(12,6),
  latency_ms INTEGER,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_airf_route_key_created
  ON ai_routing_feedback(route_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_airf_task_type_created
  ON ai_routing_feedback(task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_airf_model_created
  ON ai_routing_feedback(model, created_at DESC);
