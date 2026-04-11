// BLUN - AI Organisator | MIT License
const express = require("express");
const { pool } = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { logActivity } = require("../middleware/activity");

var router = express.Router();
// Serve admin panel page
router.get("/", authenticate, function(req, res) {
  if (!req.user) return res.redirect("/login");
  if (req.user.role !== "admin" && req.user.role !== "owner") return res.redirect("/dashboard");
  res.sendFile(require("path").join(__dirname, "../../dashboard/admin-panel.html"));
});

router.use(authenticate, requireAdmin);

// GET /admin-panel/users — paginated user list with search
router.get("/users", async function (req, res) {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var where = "";
    var params = [];
    if (search) {
      where = " WHERE u.email ILIKE $1 OR u.name ILIKE $1";
      params.push("%" + search + "%");
    }
    var countRes = await pool.query("SELECT COUNT(*) FROM users u" + where, params);
    var total = parseInt(countRes.rows[0].count);
    var sql = "SELECT u.id, u.email, u.name, u.role, u.plan, u.avatar_url, u.oauth_provider, u.created_at, u.last_login, " +
      "(SELECT COUNT(*) FROM agents a WHERE a.owner_id = u.id) AS agent_count " +
      "FROM users u" + where + " ORDER BY u.created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(limit, offset);
    var result = await pool.query(sql, params);
    res.json({ users: result.rows, total: total, page: page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[admin-panel] users error:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET /admin-panel/users/:id — user detail
router.get("/users/:id", async function (req, res) {
  try {
    var user = await pool.query(
      "SELECT id, email, name, role, plan, avatar_url, oauth_provider, created_at, last_login FROM users WHERE id = $1", [req.params.id]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: "User not found" });
    var agents = await pool.query("SELECT id, name, model, status, created_at FROM agents WHERE owner_id = $1 ORDER BY created_at DESC", [req.params.id]);
    var sub = await pool.query("SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [req.params.id]);
    var costs = await pool.query("SELECT COALESCE(SUM(cost_usd), 0) AS total_cost FROM cost_events WHERE user_id = $1", [req.params.id]);
    res.json({ user: user.rows[0], agents: agents.rows, subscription: sub.rows[0] || null, total_cost: parseFloat(costs.rows[0].total_cost) });
  } catch (err) {
    console.error("[admin-panel] user detail error:", err.message);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// PATCH /admin-panel/users/:id — update user
router.patch("/users/:id", async function (req, res) {
  try {
    var allowed = ["role", "plan", "name"];
    var sets = []; var params = []; var idx = 1;
    for (var key of allowed) {
      if (req.body[key] !== undefined) { sets.push(key + " = $" + idx); params.push(req.body[key]); idx++; }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No valid fields to update" });
    params.push(req.params.id);
    var result = await pool.query("UPDATE users SET " + sets.join(", ") + " WHERE id = $" + idx + " RETURNING id, email, name, role, plan", params);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    logActivity(req.user.id, "admin_update_user", { target: req.params.id, changes: req.body }, ip);
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("[admin-panel] update user error:", err.message);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /admin-panel/users/:id — GDPR delete
router.delete("/users/:id", async function (req, res) {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
    var check = await pool.query("SELECT id, email FROM users WHERE id = $1", [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: "User not found" });
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM agents WHERE owner_id = $1", [req.params.id]);
    await pool.query("DELETE FROM conversations WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM cost_events WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [req.params.id]);
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    logActivity(req.user.id, "admin_delete_user", { target_email: check.rows[0].email }, ip);
    res.json({ ok: true, deleted: check.rows[0].email });
  } catch (err) {
    console.error("[admin-panel] delete user error:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// GET /admin-panel/stats — platform stats
router.get("/stats", async function (req, res) {
  try {
    var users = await pool.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL 7 days) AS active_7d FROM users");
    var agents = await pool.query("SELECT COUNT(*) AS total FROM agents");
    var subs = await pool.query("SELECT COUNT(*) AS active FROM subscriptions WHERE status = active");
    var revenue = await pool.query("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_events");
    var plans = await pool.query("SELECT plan, COUNT(*) AS count FROM users GROUP BY plan ORDER BY count DESC");
    res.json({
      users: { total: parseInt(users.rows[0].total), active_7d: parseInt(users.rows[0].active_7d) },
      agents: parseInt(agents.rows[0].total),
      active_subscriptions: parseInt(subs.rows[0].active),
      total_revenue: parseFloat(revenue.rows[0].total),
      plan_distribution: plans.rows
    });
  } catch (err) {
    console.error("[admin-panel] stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /admin-panel/tenants — paginated company list with owner + member count
router.get("/tenants", async function (req, res) {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var where = "";
    var params = [];
    if (search) {
      where = " WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR u.email ILIKE $1";
      params.push("%" + search + "%");
    }
    var countRes = await pool.query(
      "SELECT COUNT(*) FROM companies c LEFT JOIN users u ON u.id = c.owner_user_id" + where, params
    );
    var total = parseInt(countRes.rows[0].count);
    var sql = "SELECT c.id, c.name, c.email, c.schema_name, c.created_at, c.config," +
      " u.id AS owner_id, u.email AS owner_email, u.name AS owner_name," +
      " (SELECT COUNT(*) FROM company_members cm WHERE cm.company_id = c.id) AS member_count" +
      " FROM companies c LEFT JOIN users u ON u.id = c.owner_user_id" + where +
      " ORDER BY c.created_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(limit, offset);
    var result = await pool.query(sql, params);
    res.json({ tenants: result.rows, total: total, page: page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[admin-panel] tenants error:", err.message);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// GET /admin-panel/tenants/:id — tenant detail with members and agents
router.get("/tenants/:id", async function (req, res) {
  try {
    var company = await pool.query(
      "SELECT c.*, u.id AS owner_id, u.email AS owner_email, u.name AS owner_name" +
      " FROM companies c LEFT JOIN users u ON u.id = c.owner_user_id WHERE c.id = $1",
      [req.params.id]
    );
    if (company.rows.length === 0) return res.status(404).json({ error: "Tenant not found" });
    var members = await pool.query(
      "SELECT cm.user_id, cm.role, cm.created_at, u.email, u.name, u.plan FROM company_members cm" +
      " JOIN users u ON u.id = cm.user_id WHERE cm.company_id = $1 ORDER BY cm.created_at",
      [req.params.id]
    );
    var agents = [];
    var schema = company.rows[0].schema_name;
    if (schema && /^[a-zA-Z0-9_]+$/.test(schema)) {
      try {
        var agRes = await pool.query(
          'SELECT id, name, model, status, created_at FROM "' + schema + '".agents ORDER BY created_at DESC LIMIT 50'
        );
        agents = agRes.rows;
      } catch (e) {
        // schema may not exist yet
      }
    }
    res.json({ tenant: company.rows[0], members: members.rows, agents: agents });
  } catch (err) {
    console.error("[admin-panel] tenant detail error:", err.message);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

// PATCH /admin-panel/tenants/:id — update tenant (name, email, description, plan/status via config)
router.patch("/tenants/:id", async function (req, res) {
  try {
    var check = await pool.query("SELECT id, config FROM companies WHERE id = $1", [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: "Tenant not found" });
    var sets = []; var params = []; var idx = 1;
    var allowed = ["name", "email", "description"];
    for (var key of allowed) {
      if (req.body[key] !== undefined) { sets.push(key + " = $" + idx); params.push(req.body[key]); idx++; }
    }
    var cfg = check.rows[0].config || {};
    var cfgChanged = false;
    if (req.body.status !== undefined) { cfg.status = req.body.status; cfgChanged = true; }
    if (req.body.plan !== undefined) { cfg.plan = req.body.plan; cfgChanged = true; }
    if (cfgChanged) { sets.push("config = $" + idx); params.push(JSON.stringify(cfg)); idx++; }
    if (sets.length === 0) return res.status(400).json({ error: "No valid fields to update" });
    params.push(req.params.id);
    var result = await pool.query(
      "UPDATE companies SET " + sets.join(", ") + " WHERE id = $" + idx + " RETURNING id, name, email, description, schema_name, config, created_at",
      params
    );
    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    logActivity(req.user.id, "admin_update_tenant", { target: req.params.id, changes: req.body }, ip);
    res.json({ tenant: result.rows[0] });
  } catch (err) {
    console.error("[admin-panel] update tenant error:", err.message);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// DELETE /admin-panel/tenants/:id — delete tenant, drop schema, cascade members
router.delete("/tenants/:id", async function (req, res) {
  var client = await pool.connect();
  try {
    var check = await client.query("SELECT id, name, schema_name FROM companies WHERE id = $1", [req.params.id]);
    if (check.rows.length === 0) { client.release(); return res.status(404).json({ error: "Tenant not found" }); }
    var schema = check.rows[0].schema_name;
    await client.query("BEGIN");
    if (schema) {
      await client.query("DROP SCHEMA IF EXISTS " + JSON.stringify(schema) + " CASCADE");
    }
    await client.query("DELETE FROM company_members WHERE company_id = $1", [req.params.id]);
    await client.query("DELETE FROM sessions WHERE active_company_id = $1", [req.params.id]);
    await client.query("DELETE FROM companies WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    logActivity(req.user.id, "admin_delete_tenant", { tenant_name: check.rows[0].name, schema: schema }, ip);
    res.json({ ok: true, deleted: check.rows[0].name });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[admin-panel] delete tenant error:", err.message);
    res.status(500).json({ error: "Failed to delete tenant" });
  } finally {
    client.release();
  }
});

// GET /admin-panel/activity — recent activity log
router.get("/activity", async function (req, res) {
  try {
    var limit = Math.min(100, parseInt(req.query.limit) || 50);
    var result = await pool.query(
      "SELECT al.*, u.email, u.name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT $1",
      [limit]
    );
    res.json({ activity: result.rows });
  } catch (err) {
    console.error("[admin-panel] activity error:", err.message);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

module.exports = router;
