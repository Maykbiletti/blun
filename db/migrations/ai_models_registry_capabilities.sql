-- Migration: Add capabilities JSONB column to ai_models_registry
-- Purpose: Store model capability flags for feature detection and routing
-- Created: 2026-04-10

-- Create ai_models_registry table if not exists
CREATE TABLE IF NOT EXISTS ai_models_registry (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR(255) UNIQUE NOT NULL,
  provider VARCHAR(100) NOT NULL,
  capabilities JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert/Update known AI models with capabilities
INSERT INTO ai_models_registry (model_id, provider, capabilities) VALUES
  ('claude-opus-4-6', 'anthropic', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('claude-sonnet-4-6', 'anthropic', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('claude-haiku-4-5', 'anthropic', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": true, "long_context": false, "json": true, "translation": true}'),
  ('gpt-4-turbo', 'openai', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('gpt-4o', 'openai', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('gpt-3.5-turbo', 'openai', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": true, "long_context": false, "json": true, "translation": true}'),
  ('gemini-2.0-pro', 'google', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('gemini-1.5-pro', 'google', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('deepseek-chat', 'deepseek', '{"chat": true, "code": true, "reasoning": true, "vision": false, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('deepseek-coder', 'deepseek', '{"chat": false, "code": true, "reasoning": false, "vision": false, "tool_calling": false, "long_context": false, "json": true, "translation": false}'),
  ('mixtral-8x7b', 'mistral', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": true, "long_context": false, "json": true, "translation": false}'),
  ('mistral-large', 'mistral', '{"chat": true, "code": true, "reasoning": true, "vision": false, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('llama-2-70b', 'meta', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": false, "long_context": false, "json": true, "translation": false}'),
  ('llama-3-70b', 'meta', '{"chat": true, "code": true, "reasoning": true, "vision": false, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('groq-mixtral-8x7b', 'groq', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": true, "long_context": false, "json": true, "translation": false}'),
  ('groq-llama-2-70b', 'groq', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": false, "long_context": false, "json": true, "translation": false}'),
  ('xai-grok-2', 'xai', '{"chat": true, "code": true, "reasoning": true, "vision": false, "tool_calling": true, "long_context": true, "json": true, "translation": true}'),
  ('together-llama-2-7b', 'together', '{"chat": true, "code": true, "reasoning": false, "vision": false, "tool_calling": false, "long_context": false, "json": true, "translation": false}'),
  ('openrouter-gpt-4', 'openrouter', '{"chat": true, "code": true, "reasoning": true, "vision": true, "tool_calling": true, "long_context": true, "json": true, "translation": true}')
ON CONFLICT (model_id) DO UPDATE
SET capabilities = EXCLUDED.capabilities, updated_at = CURRENT_TIMESTAMP;

-- Create index for efficient model lookups
CREATE INDEX IF NOT EXISTS idx_ai_models_registry_model_id ON ai_models_registry(model_id);
CREATE INDEX IF NOT EXISTS idx_ai_models_registry_provider ON ai_models_registry(provider);

-- Create index for JSONB capability queries
CREATE INDEX IF NOT EXISTS idx_ai_models_capabilities ON ai_models_registry USING GIN(capabilities);
