// BLUN - AI Organisator | MIT License
const express = require("express");
const { pool } = require("../db");
const { requireAdmin } = require("../middleware/auth");

var router = express.Router();
router.use(requireAdmin);

// Ensure tables exist
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_configs (
      id SERIAL PRIMARY KEY,
      plan_name TEXT UNIQUE NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_plan_overrides (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      overrides JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    );
  `);
}
ensureTables().catch(function(e) { console.error("[admin-plans] table init:", e.message); });

var DEFAULT_PLANS = {
  free: {
    label: "Free", price: 0,
    max_local_models: 2, max_cloud_models: 0, cloud_access: false,
    max_agents: 1, max_domains: 0, domain_budget: 0,
    max_team_members: 0, storage_gb: 1,
    features: { voice_chat: false, blun_code: false, website_builder: false, software_builder: false, federation: false }
  },
  pro: {
    label: "Pro", price: 20,
    max_local_models: 10, max_cloud_models: 3, cloud_access: true,
    max_agents: 5, max_domains: 1, domain_budget: 20,
    max_team_members: 0, storage_gb: 10,
    features: { voice_chat: true, blun_code: true, website_builder: true, software_builder: false, federation: false }
  },
  max: {
    label: "Max", price: 100,
    max_local_models: -1, max_cloud_models: -1, cloud_access: true,
    max_agents: 20, max_domains: 3, domain_budget: 60,
    max_team_members: 3, storage_gb: 50,
    features: { voice_chat: true, blun_code: true, website_builder: true, software_builder: true, federation: true }
  },
  enterprise: {
    label: "Enterprise", price: -1,
    max_local_models: -1, max_cloud_models: -1, cloud_access: true,
    max_agents: -1, max_domains: -1, domain_budget: -1,
    max_team_members: -1, storage_gb: -1,
    features: { voice_chat: true, blun_code: true, website_builder: true, software_builder: true, federation: true }
  }
};

// GET / — all plans
router.get("/", async function(req, res) {
  try {
    var result = await pool.query("SELECT plan_name, config, updated_at FROM plan_configs ORDER BY id");
    var plans = {};
    for (var k in DEFAULT_PLANS) plans[k] = Object.assign({}, DEFAULT_PLANS[k]);
    for (var row of result.rows) {
      if (plans[row.plan_name]) plans[row.plan_name] = Object.assign(plans[row.plan_name], row.config);
    }
    res.json({ plans: plans });
  } catch(e) {
    console.error("[admin-plans] GET:", e.message);
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// PUT /:id — update plan
router.put("/:id", async function(req, res) {
  try {
    var planName = req.params.id;
    if (!DEFAULT_PLANS[planName]) return res.status(400).json({ error: "Unknown plan: " + planName });
    var config = req.body;
    await pool.query(
      `INSERT INTO plan_configs (plan_name, config, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (plan_name) DO UPDATE SET config = $2, updated_at = NOW()`,
      [planName, JSON.stringify(config)]
    );
    res.json({ ok: true });
  } catch(e) {
    console.error("[admin-plans] PUT:", e.message);
    res.status(500).json({ error: "Failed to save plan" });
  }
});

// GET /users/search?q= — search users
router.get("/users/search", async function(req, res) {
  try {
    var q = req.query.q || "";
    if (q.length < 2) return res.json({ users: [] });
    var result = await pool.query(
      "SELECT id, email, name, role, plan FROM users WHERE email ILIKE $1 OR name ILIKE $1 ORDER BY email LIMIT 20",
      ["%" + q + "%"]
    );
    res.json({ users: result.rows });
  } catch(e) {
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /users/:userId — user effective limits
router.get("/users/:userId", async function(req, res) {
  try {
    var user = await pool.query("SELECT id, email, name, plan FROM users WHERE id = $1", [req.params.userId]);
    if (!user.rows.length) return res.status(404).json({ error: "User not found" });
    var u = user.rows[0];
    var override = await pool.query("SELECT overrides FROM user_plan_overrides WHERE user_id = $1", [req.params.userId]);
    var planRow = await pool.query("SELECT config FROM plan_configs WHERE plan_name = $1", [u.plan || "free"]);
    var base = Object.assign({}, DEFAULT_PLANS[u.plan || "free"] || DEFAULT_PLANS.free);
    if (planRow.rows.length) Object.assign(base, planRow.rows[0].config);
    var overrides = override.rows.length ? override.rows[0].overrides : {};
    res.json({ user: u, plan_config: base, overrides: overrides, effective: Object.assign({}, base, overrides) });
  } catch(e) {
    res.status(500).json({ error: "Failed to load user limits" });
  }
});

// PUT /users/:userId/override
router.put("/users/:userId/override", async function(req, res) {
  try {
    var userId = req.params.userId;
    var check = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (!check.rows.length) return res.status(404).json({ error: "User not found" });
    var overrides = req.body;
    await pool.query(
      `INSERT INTO user_plan_overrides (user_id, overrides, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET overrides = $2, updated_at = NOW()`,
      [userId, JSON.stringify(overrides)]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: "Failed to save override" });
  }
});

// DELETE /users/:userId/override
router.delete("/users/:userId/override", async function(req, res) {
  try {
    await pool.query("DELETE FROM user_plan_overrides WHERE user_id = $1", [req.params.userId]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: "Failed to delete override" });
  }
});

module.exports = router;
