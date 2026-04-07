// BLUN - AI Organisator | MIT License
var { Router } = require("express");
var { query, queryOne } = require("../db");
var { authenticate } = require("../middleware/auth");
var engine = require("../agent-engine");
var router = Router();

var API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";
router.use("/", function(req, res, next) {
  var key = req.headers["x-blun-key"];
  if (key && key === API_KEY) return next();
  authenticate(req, res, function() {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    next();
  });
});

// === COMPANIES ===
router.get("/companies", async function(req, res) {
  try {
    var companies = await query(
      "SELECT c.*, (SELECT COUNT(*) FROM blun_agents WHERE company_id = c.id) as agent_count FROM companies c ORDER BY c.name"
    );
    res.json(companies);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/companies", async function(req, res) {
  try {
    var { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    var c = await queryOne("INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *", [name, { description: description || "" }]);
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/companies/:id", async function(req, res) {
  try {
    var { name, description } = req.body;
    var c = await queryOne("UPDATE companies SET name = COALESCE($1, name), config = jsonb_set(COALESCE(config,'{}'::jsonb), '{description}', to_jsonb($2::text)) WHERE id = $3 RETURNING *", [name, description || "", req.params.id]);
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/companies/:id", async function(req, res) {
  try {
    await query("DELETE FROM companies WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === AGENTS ===
router.get("/agents", async function(req, res) {
  try {
    var where = "";
    var params = [];
    if (req.query.company_id) { where = " WHERE a.company_id = $1"; params = [req.query.company_id]; }
    var agents = await query(
      "SELECT a.*, c.name as company_name, (SELECT COUNT(*) FROM agent_tasks WHERE agent_id = a.id AND status = 'pending') as pending_tasks FROM blun_agents a LEFT JOIN companies c ON c.id = a.company_id" + where + " ORDER BY a.name",
      params
    );
    var activeIds = engine.getActiveAgents();
    agents.forEach(function(a) { a.runtime_active = activeIds.indexOf(a.id) >= 0; });
    res.json(agents);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents", async function(req, res) {
  try {
    var { name, role, model, system_prompt, personality, heartbeat_interval, company_id } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    var dup = await queryOne("SELECT id FROM blun_agents WHERE LOWER(name) = LOWER($1) AND company_id = $2", [name, company_id || null]);
    if (dup) return res.status(409).json({ error: "Agent mit diesem Namen existiert bereits" });
    var agent = await queryOne(
      "INSERT INTO blun_agents (name, role, model, system_prompt, personality, heartbeat_interval, company_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [name, role || "assistant", model || "tinyllama-1.1b", system_prompt || "", personality || "", heartbeat_interval || 60, company_id || null]
    );
    res.json(agent);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/agents/:id", async function(req, res) {
  try {
    var { name, role, model, system_prompt, personality, heartbeat_interval, company_id, department } = req.body;
    var agent = await queryOne(
      "UPDATE blun_agents SET name=COALESCE($1,name), role=COALESCE($2,role), model=COALESCE($3,model), system_prompt=COALESCE($4,system_prompt), personality=COALESCE($5,personality), heartbeat_interval=COALESCE($6,heartbeat_interval), company_id=COALESCE($7,company_id), department=COALESCE($8,department), updated_at=NOW() WHERE id=$9 RETURNING *",
      [name, role, model, system_prompt, personality, heartbeat_interval, company_id, department, req.params.id]
    );
    if (!agent) return res.status(404).json({ error: "Not found" });
    res.json(agent);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/agents/:id", async function(req, res) {
  try {
    engine.stopAgent(req.params.id);
    await query("DELETE FROM blun_agents WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/start", async function(req, res) {
  try { engine.startAgent(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/stop", async function(req, res) {
  try { engine.stopAgent(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/task", async function(req, res) {
  try {
    var { task } = req.body;
    if (!task) return res.status(400).json({ error: "task required" });
    var row = await queryOne("INSERT INTO agent_tasks (agent_id, task) VALUES ($1, $2) RETURNING *", [req.params.id, task]);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get("/agents/:id/tasks", async function(req, res) {
  try { res.json(await query("SELECT * FROM agent_tasks WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50", [req.params.id])); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get("/agents/:id/memory", async function(req, res) {
  try { res.json(await query("SELECT key, content as value, updated_at FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [req.params.id])); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/memory", async function(req, res) {
  try {
    var { key, value } = req.body;
    await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1,$2,$3) ON CONFLICT (agent_id, key) DO UPDATE SET content=$3, updated_at=NOW()", [req.params.id, key, value]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/agents/:id/memory/:key", async function(req, res) {
  try {
    await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [req.params.id, decodeURIComponent(req.params.key)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get("/agents/:id/conversations", async function(req, res) {
  try { res.json(await query("SELECT role, content, created_at FROM agent_conversations WHERE agent_id = $1 ORDER BY created_at ASC LIMIT 100", [req.params.id])); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/chat", async function(req, res) {
  try {
    var { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    var result = await engine.chatWithAgent(req.params.id, message);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === STATS ===
router.get("/stats", async function(req, res) {
  try {
    var [agents, tasks, costs, companies] = await Promise.all([
      query("SELECT status, COUNT(*)::int as count FROM blun_agents GROUP BY status"),
      queryOne("SELECT COUNT(*)::int as total FROM agent_tasks WHERE status = 'completed'"),
      queryOne("SELECT COALESCE(SUM(cost),0)::numeric as total FROM agent_heartbeats WHERE created_at > NOW() - INTERVAL '30 days'"),
      queryOne("SELECT COUNT(*)::int as total FROM companies"),
    ]);
    var total = 0, active = 0;
    agents.forEach(function(r) { total += r.count; if (r.status === "active" || r.status === "working") active += r.count; });
    res.json({ total_agents: total, active_agents: active, tasks_completed: tasks ? tasks.total : 0, total_cost: costs ? parseFloat(costs.total) : 0, total_companies: companies ? companies.total : 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === UNIVERSITY ===
router.get("/university", async function(req, res) {
  try { res.json(await query("SELECT u.*, a.name as agent_name FROM agent_university u JOIN blun_agents a ON a.id = u.agent_id ORDER BY u.started_at DESC")); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/university/enroll", async function(req, res) {
  try {
    var { agent_id, course_name } = req.body;
    var row = await queryOne("INSERT INTO agent_university (agent_id, course_name) VALUES ($1, $2) RETURNING *", [agent_id, course_name]);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === HEARTBEATS ===
router.get("/agents/:id/heartbeats", async function(req, res) {
  try {
    var limit = parseInt(req.query.limit) || 60;
    res.json(await query("SELECT id, agent_id, status, cost, tokens_used, created_at FROM agent_heartbeats WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2", [req.params.id, limit]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === MARKETPLACE ===
router.get("/marketplace", async function(req, res) {
  try { res.json(await query("SELECT m.*, a.name as agent_name, a.role, a.model FROM agent_marketplace m JOIN blun_agents a ON a.id = m.agent_id WHERE m.status = 'published' ORDER BY m.clone_count DESC")); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

require("./upload-route")(router, query);
require("./skills-route")(router, query, queryOne);

module.exports = router;
