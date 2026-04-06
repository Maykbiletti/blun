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

function detectLanguage(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const map = { js: "javascript", ts: "typescript", py: "python", html: "html", css: "css", sql: "sql", json: "json", md: "markdown", jsx: "javascript", tsx: "typescript", rb: "ruby", go: "go", rs: "rust", sh: "bash", yml: "yaml", yaml: "yaml" };
  return map[ext] || "plaintext";
}

module.exports = router;
