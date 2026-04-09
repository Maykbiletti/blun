// BLUN - AI Organisator | MIT License
const express = require("express");
const router = express.Router();
const { query, queryOne } = require("../db");
const { requireAuth } = require("../middleware/auth");

// List user projects
router.get("/projects", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM canvas_projects WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create project
router.post("/projects", requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const row = await queryOne("INSERT INTO canvas_projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING *", [req.user.id, name, description || ""]);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List files in project
router.get("/projects/:id/files", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT id, project_id, path, language, last_editor, updated_at, created_at FROM canvas_files WHERE project_id = $1 ORDER BY path", [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create file in project
router.post("/projects/:id/files", requireAuth, async (req, res) => {
  try {
    const { path: filePath, content, language } = req.body;
    if (!filePath) return res.status(400).json({ error: "Path required" });
    const lang = language || detectLanguage(filePath);
    const row = await queryOne("INSERT INTO canvas_files (project_id, path, content, language, last_editor) VALUES ($1, $2, $3, $4, $5) RETURNING *", [req.params.id, filePath, content || "", lang, req.user.name || req.user.email]);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get file content
router.get("/files/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM canvas_files WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save file
router.put("/files/:id", requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const row = await queryOne("UPDATE canvas_files SET content = $1, last_editor = $2, updated_at = NOW() WHERE id = $3 RETURNING *", [content, req.user.name || req.user.email, req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete file
router.delete("/files/:id", requireAuth, async (req, res) => {
  try {
    await query("DELETE FROM canvas_files WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CANVAS STATES - Save/Load =====

// List all saved states for a file
router.get("/files/:id/states", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT id, state_name, created_at, updated_at, created_by, thumbnail FROM canvas_states WHERE file_id = $1 ORDER BY updated_at DESC",
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get specific state
router.get("/states/:stateId", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM canvas_states WHERE id = $1", [req.params.stateId]);
    if (!row) return res.status(404).json({ error: "State not found" });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save canvas state (version/snapshot)
router.post("/files/:id/states", requireAuth, async (req, res) => {
  try {
    const { state_name, state_data, thumbnail } = req.body;
    if (!state_name || !state_data) return res.status(400).json({ error: "state_name and state_data required" });

    const file = await queryOne("SELECT project_id FROM canvas_files WHERE id = $1", [req.params.id]);
    if (!file) return res.status(404).json({ error: "File not found" });

    const row = await queryOne(
      `INSERT INTO canvas_states (project_id, file_id, state_name, state_data, thumbnail, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (file_id, state_name) DO UPDATE
       SET state_data = $4, thumbnail = $5, updated_at = NOW()
       RETURNING *`,
      [file.project_id, req.params.id, state_name, JSON.stringify(state_data), thumbnail || null, req.user.name || req.user.email]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Load canvas state
router.get("/states/:stateId/load", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT state_data FROM canvas_states WHERE id = $1", [req.params.stateId]);
    if (!row) return res.status(404).json({ error: "State not found" });
    res.json(row.state_data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete state
router.delete("/states/:stateId", requireAuth, async (req, res) => {
  try {
    await query("DELETE FROM canvas_states WHERE id = $1", [req.params.stateId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== AUTOSAVE =====

// Get autosave for file
router.get("/files/:id/autosave", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT state_data, last_saved, last_editor FROM canvas_autosave WHERE file_id = $1", [req.params.id]);
    if (!row) return res.status(204).send();
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update autosave
router.post("/files/:id/autosave", requireAuth, async (req, res) => {
  try {
    const { state_data } = req.body;
    if (!state_data) return res.status(400).json({ error: "state_data required" });

    const row = await queryOne(
      `INSERT INTO canvas_autosave (file_id, state_data, last_editor)
       VALUES ($1, $2, $3)
       ON CONFLICT (file_id) DO UPDATE
       SET state_data = $2, last_saved = NOW(), last_editor = $3
       RETURNING *`,
      [req.params.id, JSON.stringify(state_data), req.user.name || req.user.email]
    );
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function detectLanguage(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const map = { js: "javascript", ts: "typescript", py: "python", html: "html", css: "css", sql: "sql", json: "json", md: "markdown", jsx: "javascript", tsx: "typescript", rb: "ruby", go: "go", rs: "rust", sh: "bash", yml: "yaml", yaml: "yaml" };
  return map[ext] || "plaintext";
}

module.exports = router;
