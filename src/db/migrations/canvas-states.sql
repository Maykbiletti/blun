-- BLUN Canvas States - Save/Load Functionality
-- 2026-04-09 - Heinrich

CREATE TABLE IF NOT EXISTS canvas_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES canvas_files(id) ON DELETE CASCADE,
  state_name VARCHAR(255) NOT NULL,
  state_data JSONB NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  CONSTRAINT unique_state_per_file UNIQUE(file_id, state_name)
);

CREATE INDEX IF NOT EXISTS idx_canvas_states_project ON canvas_states(project_id);
CREATE INDEX IF NOT EXISTS idx_canvas_states_file ON canvas_states(file_id);
CREATE INDEX IF NOT EXISTS idx_canvas_states_created ON canvas_states(created_at DESC);

-- Canvas Auto-Save (Latest State)
CREATE TABLE IF NOT EXISTS canvas_autosave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL UNIQUE REFERENCES canvas_files(id) ON DELETE CASCADE,
  state_data JSONB NOT NULL,
  last_saved TIMESTAMP DEFAULT NOW(),
  last_editor VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_canvas_autosave_file ON canvas_autosave(file_id);
