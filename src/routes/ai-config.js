// BLUN - AI Organisator | MIT License
const express = require("express");
const { pool } = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");

var router = express.Router();

// Serve admin ai config page
router.get("/", authenticate, function(req, res) {
  if (!req.user) return res.redirect("/login");
  if (req.user.role !== "admin" && req.user.role !== "owner") return res.redirect("/dashboard");
  res.sendFile(require("path").join(__dirname, "../../dashboard/admin-ai-config.html"));
});

router.use(authenticate, requireAdmin);

// GET /ai-config/providers — list all providers
router.get("/providers", async function (req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, api_key_name, models, is_enabled, created_at FROM ai_providers ORDER BY created_at DESC"
    );
    res.json({ providers: result.rows });
  } catch (err) {
    console.error("[ai-config] providers error:", err.message);
    res.status(500).json({ error: "Failed to fetch providers" });
  }
});

// POST /ai-config/providers — create provider
router.post("/providers", async function (req, res) {
  try {
    const { name, api_key_name, models } = req.body;
    if (!name || !api_key_name) {
      return res.status(400).json({ error: "name and api_key_name required" });
    }
    const result = await pool.query(
      "INSERT INTO ai_providers (name, api_key_name, models, is_enabled) VALUES ($1, $2, $3, true) RETURNING *",
      [name, api_key_name, models ? JSON.stringify(models) : null]
    );
    res.json({ provider: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] create provider error:", err.message);
    res.status(500).json({ error: "Failed to create provider" });
  }
});

// PATCH /ai-config/providers/:id — update provider
router.patch("/providers/:id", async function (req, res) {
  try {
    const { name, api_key_name, models, is_enabled } = req.body;
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (api_key_name !== undefined) { updates.push(`api_key_name = $${paramIdx++}`); params.push(api_key_name); }
    if (models !== undefined) { updates.push(`models = $${paramIdx++}`); params.push(models ? JSON.stringify(models) : null); }
    if (is_enabled !== undefined) { updates.push(`is_enabled = $${paramIdx++}`); params.push(is_enabled); }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    params.push(req.params.id);
    const sql = `UPDATE ai_providers SET ${updates.join(", ")} WHERE id = $${paramIdx} RETURNING *`;
    const result = await pool.query(sql, params);

    if (result.rows.length === 0) return res.status(404).json({ error: "Provider not found" });
    res.json({ provider: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] update provider error:", err.message);
    res.status(500).json({ error: "Failed to update provider" });
  }
});

// DELETE /ai-config/providers/:id — delete provider
router.delete("/providers/:id", async function (req, res) {
  try {
    const result = await pool.query("DELETE FROM ai_providers WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Provider not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai-config] delete provider error:", err.message);
    res.status(500).json({ error: "Failed to delete provider" });
  }
});

// GET /ai-config/models — list all models
router.get("/models", async function (req, res) {
  try {
    const result = await pool.query(
      "SELECT id, provider_id, name, capabilities, pricing, is_available FROM ai_models ORDER BY provider_id, name"
    );
    res.json({ models: result.rows });
  } catch (err) {
    console.error("[ai-config] models error:", err.message);
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

// POST /ai-config/models — create model
router.post("/models", async function (req, res) {
  try {
    const { provider_id, name, capabilities, pricing } = req.body;
    if (!provider_id || !name) {
      return res.status(400).json({ error: "provider_id and name required" });
    }
    const result = await pool.query(
      "INSERT INTO ai_models (provider_id, name, capabilities, pricing, is_available) VALUES ($1, $2, $3, $4, true) RETURNING *",
      [provider_id, name, capabilities ? JSON.stringify(capabilities) : null, pricing ? JSON.stringify(pricing) : null]
    );
    res.json({ model: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] create model error:", err.message);
    res.status(500).json({ error: "Failed to create model" });
  }
});

// PATCH /ai-config/models/:id — update model
router.patch("/models/:id", async function (req, res) {
  try {
    const { name, capabilities, pricing, is_available } = req.body;
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (capabilities !== undefined) { updates.push(`capabilities = $${paramIdx++}`); params.push(capabilities ? JSON.stringify(capabilities) : null); }
    if (pricing !== undefined) { updates.push(`pricing = $${paramIdx++}`); params.push(pricing ? JSON.stringify(pricing) : null); }
    if (is_available !== undefined) { updates.push(`is_available = $${paramIdx++}`); params.push(is_available); }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    params.push(req.params.id);
    const sql = `UPDATE ai_models SET ${updates.join(", ")} WHERE id = $${paramIdx} RETURNING *`;
    const result = await pool.query(sql, params);

    if (result.rows.length === 0) return res.status(404).json({ error: "Model not found" });
    res.json({ model: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] update model error:", err.message);
    res.status(500).json({ error: "Failed to update model" });
  }
});

// DELETE /ai-config/models/:id — delete model
router.delete("/models/:id", async function (req, res) {
  try {
    const result = await pool.query("DELETE FROM ai_models WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Model not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai-config] delete model error:", err.message);
    res.status(500).json({ error: "Failed to delete model" });
  }
});

// GET /ai-config/defaults — list default configurations
router.get("/defaults", async function (req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, default_provider, default_model, fallback_chain, config FROM ai_defaults ORDER BY created_at DESC"
    );
    res.json({ defaults: result.rows });
  } catch (err) {
    console.error("[ai-config] defaults error:", err.message);
    res.status(500).json({ error: "Failed to fetch defaults" });
  }
});

// POST /ai-config/defaults — create default configuration
router.post("/defaults", async function (req, res) {
  try {
    const { name, default_provider, default_model, fallback_chain, config } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const result = await pool.query(
      "INSERT INTO ai_defaults (name, default_provider, default_model, fallback_chain, config) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, default_provider || null, default_model || null, fallback_chain ? JSON.stringify(fallback_chain) : null, config ? JSON.stringify(config) : null]
    );
    res.json({ default: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] create default error:", err.message);
    res.status(500).json({ error: "Failed to create default" });
  }
});

// PATCH /ai-config/defaults/:id — update default configuration
router.patch("/defaults/:id", async function (req, res) {
  try {
    const { name, default_provider, default_model, fallback_chain, config } = req.body;
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (default_provider !== undefined) { updates.push(`default_provider = $${paramIdx++}`); params.push(default_provider || null); }
    if (default_model !== undefined) { updates.push(`default_model = $${paramIdx++}`); params.push(default_model || null); }
    if (fallback_chain !== undefined) { updates.push(`fallback_chain = $${paramIdx++}`); params.push(fallback_chain ? JSON.stringify(fallback_chain) : null); }
    if (config !== undefined) { updates.push(`config = $${paramIdx++}`); params.push(config ? JSON.stringify(config) : null); }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    params.push(req.params.id);
    const sql = `UPDATE ai_defaults SET ${updates.join(", ")} WHERE id = $${paramIdx} RETURNING *`;
    const result = await pool.query(sql, params);

    if (result.rows.length === 0) return res.status(404).json({ error: "Default not found" });
    res.json({ default: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] update default error:", err.message);
    res.status(500).json({ error: "Failed to update default" });
  }
});

// DELETE /ai-config/defaults/:id — delete default configuration
router.delete("/defaults/:id", async function (req, res) {
  try {
    const result = await pool.query("DELETE FROM ai_defaults WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Default not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai-config] delete default error:", err.message);
    res.status(500).json({ error: "Failed to delete default" });
  }
});

// GET /ai-config/locks — list model locks
router.get("/locks", async function (req, res) {
  try {
    const result = await pool.query(
      "SELECT id, model_id, reason, locked_until, created_by FROM ai_model_locks ORDER BY created_at DESC"
    );
    res.json({ locks: result.rows });
  } catch (err) {
    console.error("[ai-config] locks error:", err.message);
    res.status(500).json({ error: "Failed to fetch locks" });
  }
});

// POST /ai-config/locks — create model lock
router.post("/locks", async function (req, res) {
  try {
    const { model_id, reason, locked_until } = req.body;
    if (!model_id) return res.status(400).json({ error: "model_id required" });

    const result = await pool.query(
      "INSERT INTO ai_model_locks (model_id, reason, locked_until, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [model_id, reason || null, locked_until || null, req.user.id]
    );
    res.json({ lock: result.rows[0] });
  } catch (err) {
    console.error("[ai-config] create lock error:", err.message);
    res.status(500).json({ error: "Failed to create lock" });
  }
});

// DELETE /ai-config/locks/:id — delete model lock
router.delete("/locks/:id", async function (req, res) {
  try {
    const result = await pool.query("DELETE FROM ai_model_locks WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Lock not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai-config] delete lock error:", err.message);
    res.status(500).json({ error: "Failed to delete lock" });
  }
});

module.exports = router;
