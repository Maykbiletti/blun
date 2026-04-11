// BLUN - AI Organisator | MIT License
var { Router } = require("express");
var { query, queryOne } = require("../db");
var { authenticate } = require("../middleware/auth");
var engine = require("../agent-engine");
var pc = require("../paperclip-proxy");
var router = Router();

var API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";
router.use("/", function(req, res, next) {
  var key = req.headers["x-blun-key"] || req.headers["x-api-key"];
  if (req.user) return next(); // Already authenticated by server middleware
  if (key && key === API_KEY) return next();
  authenticate(req, res, function() {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    next();
  });
});


// TENANT SCOPING 2026-04-10: force non-admin users to their active company
// Admin users may still pass x-company-id header to browse specific companies.
function getCompanyId(req) {
  if (req.user && req.user.role !== "admin") {
    // Non-admin: ALWAYS force active company; ignore header spoofing.
    return req.activeCompanyId || -1;
  }
  var cid = req.headers["x-company-id"] || req.query.company_id;
  if (cid) return parseInt(cid);
  // admin: skip stale activeCompanyId fallback so all agents are visible
  return null;
}

// Helper: returns array of company_ids the user has access to.
// For admins returns null (meaning no filter / all companies).
function userCompanyIds(req) {
  if (!req.user) return [];
  if (req.user.role === "admin") return null;
  return req.companyIds || [];
}

// Helper: guard middleware that ensures the agent in :id belongs to user's companies.
async function assertAgentAccess(req, res, next) {
  try {
    if (req.user && req.user.role === "admin") return next();
    var cids = req.companyIds || [];
    if (cids.length === 0) return res.status(403).json({ error: "no company access" });
    var a = await queryOne("SELECT company_id FROM blun_agents WHERE id = $1", [req.params.id]);
    if (!a) return res.status(404).json({ error: "Agent not found" });
    if (cids.indexOf(a.company_id) === -1) return res.status(403).json({ error: "access denied" });
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}


// Tenant guard for all /agents/:id/* sub-routes. Placed BEFORE routes so Express
// runs it first for any matching path.
router.use("/agents/:id", assertAgentAccess);

// === COMPANIES ===
router.get("/companies", async function(req, res) {
  try {
    var userId = req.user ? req.user.id : null;
    if (!userId) return res.status(401).json({ error: "auth required" });
    var sql, params;
    if (req.user.role === "admin" && req.query.all === "1") {
      sql = "SELECT c.*, (SELECT COUNT(*) FROM blun_agents WHERE company_id = c.id) as agent_count FROM companies c ORDER BY c.name";
      params = [];
    } else {
      sql = "SELECT c.*, (SELECT COUNT(*) FROM blun_agents WHERE company_id = c.id) as agent_count " +
            "FROM companies c JOIN company_members cm ON cm.company_id = c.id " +
            "WHERE cm.user_id = $1 ORDER BY c.name";
      params = [userId];
    }
    var companies = await query(sql, params);
    res.json(companies);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/companies", async function(req, res) {
  try {
    var { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    var ownerId = req.user ? req.user.id : null;
    if (!ownerId) return res.status(401).json({ error: "auth required" });
    // Transaction: create company + membership
    var client = await require("../db").pool.connect();
    try {
      await client.query("BEGIN");
      var c = (await client.query(
        "INSERT INTO companies (name, config, owner_id) VALUES ($1, $2, $3) RETURNING *",
        [name, { description: description || "" }, ownerId]
      )).rows[0];
      await client.query(
        "INSERT INTO company_members (user_id, company_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
        [ownerId, c.id]
      );
      await client.query("COMMIT");
      res.json(c);
    } catch (txE) {
      await client.query("ROLLBACK");
      throw txE;
    } finally {
      client.release();
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/companies/:id", async function(req, res) {
  try {
    var { name, description } = req.body;
    var uid = req.user ? req.user.id : null; var c = await queryOne("UPDATE companies SET name = COALESCE($1, name), config = jsonb_set(COALESCE(config,'{}'::jsonb), '{description}', to_jsonb($2::text)) WHERE id = $3 AND owner_id = $4 RETURNING *", [name, description || "", req.params.id, uid]); if (!c) return res.status(404).json({ error: "not found" });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/companies/:id", async function(req, res) {
  try {
    var uid = req.user ? req.user.id : null; var r = await query("DELETE FROM companies WHERE id = $1 AND owner_id = $2 RETURNING id", [req.params.id, uid]); if (!r || !r.length) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === AGENTS ===
router.get("/agents", async function(req, res) {
  try {
    var cid = getCompanyId(req);
    var agents = await pc.getAgents(cid);
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      try {
        var qs = await queryOne("SELECT COUNT(*)::int as c FROM agent_tasks WHERE agent_id = $1 AND status = 'pending'", [a.id]);
        a.queue_size = qs ? qs.c : 0;
      } catch(e1) { a.queue_size = 0; }
      try {
        var dt = await queryOne("SELECT COUNT(*)::int as c FROM agent_tasks WHERE agent_id = $1 AND status = 'completed' AND LENGTH(result) > 200 AND COALESCE((result::jsonb->>'changed_files_count')::int,0) >= 1 AND created_at >= NOW() - INTERVAL '24 hours'", [a.id]);
        a.completed_today = dt ? dt.c : 0;
      } catch(eX) { a.completed_today = 0; }
      try {
        var tt = await queryOne("SELECT COUNT(*)::int as c FROM agent_tasks WHERE agent_id = $1", [a.id]);
        a.tasks_total = tt ? tt.c : 0;
      } catch(eY) { a.tasks_total = 0; }
      try {
        var running = await queryOne("SELECT id, task, created_at FROM agent_tasks WHERE agent_id = $1 AND status IN ('processing','in_progress') ORDER BY created_at DESC LIMIT 1", [a.id]);
        if (running) {
          a.running_task_id = running.id;
          a.current_task = running.task;
          a.running_since = running.created_at;
          a.is_running = true;
        } else {
          a.running_task_id = null;
          a.current_task = null;
          a.running_since = null;
          a.is_running = false;
        }
      } catch(e2) { a.is_running = false; a.current_task = null; a.running_since = null; a.running_task_id = null; }
      a.pending_tasks = a.queue_size + (a.is_running ? 1 : 0);
      try { var skills = await query("SELECT s.name, s.repo_url FROM agent_skills as2 JOIN skills s ON s.id = as2.skill_id WHERE as2.agent_id = $1 AND as2.enabled = true", [a.id]); a.skills = skills.map(function(x){return x.name;}); a.skill_urls = {}; skills.forEach(function(x){if(x.repo_url)a.skill_urls[x.name]=x.repo_url;}); } catch(e3) { a.skills = []; a.skill_urls = {}; }
    }
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




router.get("/agents/running", async function(req, res) {
  try {
    var running = engine.getActiveAgents();
    res.json({ running: running });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/tasks/reset", async function(req, res) {
  try {
    var result = await query("UPDATE tasks SET status = 'pending' WHERE status IN ('in_progress', 'error')");
    res.json({ ok: true, count: result.rowCount || 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/bulk-start", async function(req, res) {
  try {
    var cid = getCompanyId(req);
    var agents = cid ? await query("SELECT id FROM blun_agents WHERE company_id = $1", [cid]) : await query("SELECT id FROM blun_agents");
    var count = 0;
    for (var i = 0; i < agents.length; i++) {
      try { engine.startAgent(agents[i].id); count++; } catch(e) {}
    }
    if (cid) await query("UPDATE blun_agents SET status = 'active' WHERE company_id = $1", [cid]); else await query("UPDATE blun_agents SET status = 'active'");
    res.json({ ok: true, count: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/bulk-stop", async function(req, res) {
  try {
    var cid = getCompanyId(req);
    var agents = cid ? await query("SELECT id FROM blun_agents WHERE company_id = $1", [cid]) : await query("SELECT id FROM blun_agents");
    var count = 0;
    for (var i = 0; i < agents.length; i++) {
      try { engine.stopAgent(agents[i].id); count++; } catch(e) {}
    }
    if (cid) await query("UPDATE blun_agents SET status = 'idle' WHERE company_id = $1", [cid]); else await query("UPDATE blun_agents SET status = 'idle'");
    res.json({ ok: true, count: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/agents/bulk-model", async function(req, res) {
  try {
    var { model } = req.body;
    if (!model) return res.status(400).json({ error: "model required" });
    var cid = getCompanyId(req);
    var result = cid ? await query("UPDATE blun_agents SET model = $1, updated_at = NOW() WHERE company_id = $2", [model, cid]) : await query("UPDATE blun_agents SET model = $1, updated_at = NOW()", [model]);
    pc.invalidateCache();
    res.json({ ok: true, count: result.rowCount || 15 });
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
    pc.invalidateCache();
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
  try { engine.startAgent(parseInt(req.params.id)); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/stop", async function(req, res) {
  try { engine.stopAgent(parseInt(req.params.id)); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/create", async function(req, res) {
  try {
    var { name, role, department, model, system_prompt } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    var dup = await queryOne("SELECT id FROM blun_agents WHERE LOWER(name) = LOWER($1)", [name]);
    if (dup) return res.status(409).json({ error: "Agent mit diesem Namen existiert bereits" });
    var agent = await queryOne(
      "INSERT INTO blun_agents (name, role, department, model, system_prompt) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, role || "assistant", department || "", model || "tinyllama-1.1b", system_prompt || ""]
    );
    try { engine.startAgent(agent.id); } catch(e2) {}
    res.json(agent);
  } catch(e) { res.status(500).json({ error: e.message }); }
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

router.put("/agents/:id/tasks/:taskId", async function(req, res) {
  try {
    var { status } = req.body;
    if (!['pending','in_progress','completed','failed'].includes(status)) return res.status(400).json({ error: "invalid status" });
    var updates = "status = $1";
    var params = [status, req.params.taskId, req.params.id];
    if (status === 'completed') updates += ", completed_at = NOW()";
    var row = await queryOne("UPDATE agent_tasks SET " + updates + " WHERE id = $2 AND agent_id = $3 RETURNING *", params);
    if (!row) return res.status(404).json({ error: "task not found" });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/agents/:id/tasks/:taskId", async function(req, res) {
  try {
    await query("DELETE FROM agent_tasks WHERE id = $1 AND agent_id = $2", [req.params.taskId, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
  try { res.json(await query("SELECT * FROM (SELECT role, content, created_at FROM agent_conversations WHERE agent_id = $1 AND internal = false ORDER BY created_at DESC LIMIT 100) sub ORDER BY created_at ASC", [req.params.id])); }
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

// Internal chat: used by dieter-daemon for task delegation; hidden from user UI
router.post("/agents/:id/internal-chat", async function(req, res) {
  try {
    var { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    var result = await engine.chatWithAgent(req.params.id, message, true);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === STATS ===
router.get("/stats", async function(req, res) {
  try {
    var uid = req.user ? req.user.id : null;
    if (!uid) return res.status(401).json({ error: "auth required" });
    var [agents, tasks, costs, companies] = await Promise.all([
      query("SELECT a.status, COUNT(*)::int as count FROM blun_agents a JOIN company_members cm ON cm.company_id = a.company_id WHERE cm.user_id = $1 GROUP BY a.status", [uid]),
      queryOne("SELECT (SELECT COUNT(*)::int FROM agent_tasks at JOIN blun_agents a ON a.id = at.agent_id JOIN company_members cm ON cm.company_id = a.company_id WHERE cm.user_id = $1 AND at.status = 'completed' AND LENGTH(at.result) > 200 AND COALESCE((at.result::jsonb->>'changed_files_count')::int,0) >= 1) as total", [uid]),
      queryOne("SELECT COALESCE(SUM(h.cost),0)::numeric as total FROM agent_heartbeats h JOIN blun_agents a ON a.id = h.agent_id JOIN company_members cm ON cm.company_id = a.company_id WHERE cm.user_id = $1 AND h.created_at > NOW() - INTERVAL '30 days'", [uid]),
      queryOne("SELECT COUNT(*)::int as total FROM company_members WHERE user_id = $1", [uid]),
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


// === DIETER DIRECT EXECUTION ===
// Dieter executes a task himself via Claude CLI (no delegation to other agents)
router.post("/direct-exec", async function(req, res) {
  try {
    var { task } = req.body;
    if (!task) return res.status(400).json({ error: "task required" });
    var taskRunner = require("../agent/task-runner");
    var dieter = await queryOne("SELECT * FROM blun_agents WHERE id = 1");
    if (!dieter) return res.status(404).json({ error: "Dieter agent not found" });
    // Create task record
    var row = await queryOne(
      "INSERT INTO agent_tasks (agent_id, task, status, priority) VALUES (1, $1, 'processing', 10) RETURNING *",
      [task]
    );
    // Respond immediately with task ID, execute async
    res.json({ id: row.id, status: "processing", message: "Dieter fuehrt aus..." });
    // Execute in background
    (async function() {
      try {
        var result = await taskRunner.executeTask(dieter, row, query);
        await query("UPDATE agent_tasks SET status='completed', result=$1, completed_at=NOW() WHERE id=$2",
          [JSON.stringify(result), row.id]);
      } catch(e) {
        await query("UPDATE agent_tasks SET status='failed', result=$1, completed_at=NOW() WHERE id=$2",
          [JSON.stringify({ error: e.message }), row.id]);
      }
    })();
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// === SLASH COMMAND ROUTES ===
// GET /slash/status — system health
router.get("/slash/status", async function(req, res) {
  try {
    var cp = require("child_process");
    var pm2 = ""; try { pm2 = cp.execSync("pm2 jlist 2>/dev/null", { timeout: 5000 }).toString(); } catch(e) { pm2 = "[]"; }
    var procs = JSON.parse(pm2).map(function(p) { return { name: p.name, status: p.pm2_env.status, uptime: p.pm2_env.pm_uptime, memory: Math.round((p.monit.memory || 0) / 1048576) + "MB", restarts: p.pm2_env.restart_time }; });
    var disk = ""; try { disk = cp.execSync("df -h / | tail -1", { timeout: 3000 }).toString().trim(); } catch(e) {}
    var db = await queryOne("SELECT COUNT(*)::int as total FROM blun_agents WHERE status IN ('active','working')");
    res.json({ procs: procs, disk: disk, active_agents: db ? db.total : 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /slash/logs — last livefeed entries
router.get("/slash/logs", async function(req, res) {
  try {
    var rows = await query("SELECT id, agent_id, status, model, created_at FROM agent_heartbeats ORDER BY created_at DESC LIMIT 15");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /slash/deploy — git pull + pm2 restart
router.post("/slash/deploy", async function(req, res) {
  try {
    var cp = require("child_process");
    var pull = cp.execSync("cd /root/blun && git pull pro admin-arch-base 2>&1", { timeout: 15000, env: Object.assign({}, process.env, { BLUN_DEPLOYER: "dieter" }) }).toString();
    var restart = cp.execSync("pm2 restart blun 2>&1", { timeout: 10000 }).toString();
    res.json({ pull: pull.trim(), restart: restart.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /slash/agents — all agents overview
router.get("/slash/agents", async function(req, res) {
  try {
    var rows = await query("SELECT id, name, role, status, model FROM blun_agents ORDER BY id");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /slash/kill — cancel a stuck task
router.post("/slash/kill", async function(req, res) {
  try {
    var { task_id } = req.body;
    if (!task_id) return res.status(400).json({ error: "task_id required" });
    var row = await queryOne("UPDATE agent_tasks SET status='failed', result=$1, completed_at=NOW() WHERE id=$2 AND status IN ('processing','in_progress','pending') RETURNING id, status",
      [JSON.stringify({ killed_by: "slash_command" }), task_id]);
    if (!row) return res.status(404).json({ error: "Task not found or already done" });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /slash/priority — set task priority
router.post("/slash/priority", async function(req, res) {
  try {
    var { task_id, priority } = req.body;
    if (!task_id || priority === undefined) return res.status(400).json({ error: "task_id and priority required" });
    var row = await queryOne("UPDATE agent_tasks SET priority=$1, updated_at=NOW() WHERE id=$2 RETURNING id, priority", [parseInt(priority), task_id]);
    if (!row) return res.status(404).json({ error: "Task not found" });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /slash/merge — merge agent branch
router.post("/slash/merge", async function(req, res) {
  try {
    var { task_id } = req.body;
    if (!task_id) return res.status(400).json({ error: "task_id required" });
    var task = await queryOne("SELECT t.*, a.name as agent_name FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id WHERE t.id = $1", [task_id]);
    if (!task) return res.status(404).json({ error: "Task not found" });
    var cp = require("child_process");
    var branch = "agent/" + (task.agent_name || "unknown").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    var result = cp.execSync("cd /root/blun && BLUN_DEPLOYER=dieter git merge " + branch + " --no-edit 2>&1", { timeout: 15000, env: Object.assign({}, process.env, { BLUN_DEPLOYER: "dieter" }) }).toString();
    res.json({ merged: branch, output: result.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /slash/stats — completion stats
router.get("/slash/stats", async function(req, res) {
  try {
    var stats = await queryOne("SELECT (SELECT COUNT(*)::int FROM agent_tasks WHERE status='completed' AND created_at > NOW()-INTERVAL '24 hours') as completed_24h, (SELECT COUNT(*)::int FROM agent_tasks WHERE status='failed' AND created_at > NOW()-INTERVAL '24 hours') as failed_24h, (SELECT COUNT(*)::int FROM agent_tasks WHERE status IN ('pending','processing','in_progress')) as open_now, (SELECT COALESCE(SUM(cost),0)::numeric FROM agent_heartbeats WHERE created_at > NOW()-INTERVAL '24 hours') as cost_24h");
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

require("./upload-route")(router, query);
require("./skills-route")(router, query, queryOne);


// Livefeed: combined activity stream
router.get('/livefeed', async function(req, res) {
  try {
    var cids = userCompanyIds(req);
    var scope, params;
    if (cids === null) { scope = ""; params = []; }
    else if (cids.length === 0) { return res.json([]); }
    else { scope = " WHERE a.company_id = ANY($1)"; params = [cids]; }

    var chats = await query(
      "SELECT c.id, c.agent_id, a.name as agent_name, c.role, LEFT(c.content, 120) as content, c.created_at, 'chat' as type FROM agent_conversations c JOIN blun_agents a ON a.id = c.agent_id" + scope + " ORDER BY c.created_at DESC LIMIT 30",
      params
    );
    var tasks = await query(
      "SELECT t.id, t.agent_id, a.name as agent_name, LEFT(t.task, 120) as content, t.status, t.created_at, t.completed_at, 'task' as type FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id" + scope + " ORDER BY t.created_at DESC LIMIT 20",
      params
    );
    var beats = await query(
      "SELECT h.id, h.agent_id, a.name as agent_name, h.status, h.tokens_used, h.cost, h.created_at, 'heartbeat' as type FROM agent_heartbeats h JOIN blun_agents a ON a.id = h.agent_id" + scope + " ORDER BY h.created_at DESC LIMIT 20",
      params
    );
    var activity = (cids === null)
      ? await query("SELECT id, user_id, action, details, created_at, ip_address, 'activity' as type FROM activity_log ORDER BY created_at DESC LIMIT 10")
      : await query("SELECT id, user_id, action, details, created_at, ip_address, 'activity' as type FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [req.user.id]);
    var all = [].concat(
      chats.map(function(r){ return {type:'chat', agent:r.agent_name||'?', role:r.role, content:r.content, ts:r.created_at}; }),
      tasks.map(function(r){ return {type:'task', agent:r.agent_name||'?', status:r.status, content:r.content, ts:r.completed_at||r.created_at}; }),
      beats.map(function(r){ return {type:'heartbeat', agent:r.agent_name||'?', status:r.status, tokens:r.tokens_used, cost:r.cost, ts:r.created_at}; }),
      activity.map(function(r){ var d=typeof r.details==='string'?JSON.parse(r.details||'{}'):r.details||{}; return {type:'activity', action:r.action, detail:d.email||JSON.stringify(d).substring(0,60), ip:r.ip_address, ts:r.created_at}; })
    );
    all.sort(function(a,b){ return new Date(b.ts)-new Date(a.ts); });
    res.json(all.slice(0, 80));
  } catch(e) {
    console.error('livefeed error:', e.message);
    res.status(500).json({error: e.message});
  }
});

// === CEO-PANEL: OVERVIEW (All Tasks + Comments) ===
router.get("/overview", async function(req, res) {
  try {
    var cids = userCompanyIds(req);
    var tasks;
    if (cids === null) {
      tasks = await query("SELECT t.id, t.task as title, t.status, t.created_at, t.updated_at FROM agent_tasks t ORDER BY t.created_at DESC");
    } else if (cids.length === 0) {
      tasks = [];
    } else {
      tasks = await query(
        "SELECT t.id, t.task as title, t.status, t.created_at, t.updated_at FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id WHERE a.company_id = ANY($1) ORDER BY t.created_at DESC",
        [cids]
      );
    }
    res.json({ tasks: tasks });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === TASK COMMENTS ===
router.post("/tasks/:id/comment", async function(req, res) {
  try {
    var { user_id, comment } = req.body;
    if (!comment) return res.status(400).json({ error: "comment required" });
    var row = await queryOne(
      "INSERT INTO agent_task_comments (task_id, user_id, comment) VALUES ($1, $2, $3) RETURNING *",
      [req.params.id, user_id || null, comment]
    );
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get("/tasks/:id/comments", async function(req, res) {
  try {
    var comments = await query(
      "SELECT id, task_id, user_id, comment, created_at FROM agent_task_comments WHERE task_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json(comments);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// === COMPANY LOGO UPLOAD ===
var path = require("path");
var fsx = require("fs");
router.post("/companies/:id/logo", async function(req, res) {
  try {
    if (!req.files || !req.files.logo) return res.status(400).json({ error: "logo file required" });
    var logo = req.files.logo;
    var ext = path.extname(logo.name) || ".png";
    var fname = "company_" + req.params.id + "_logo" + ext;
    var uploadDir = "/root/blun/dashboard/uploads";
    if (!fsx.existsSync(uploadDir)) fsx.mkdirSync(uploadDir, { recursive: true });
    var dest = path.join(uploadDir, fname);
    await logo.mv(dest);
    var url = "/uploads/" + fname;
    await queryOne("UPDATE companies SET logo_url = $1 WHERE id = $2 RETURNING *", [url, req.params.id]);
    res.json({ ok: true, logo_url: url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === SET ACTIVE COMPANY ===
router.post("/set-company", async function(req, res) {
  try {
    var { company_id } = req.body;
    if (!company_id) return res.status(400).json({ error: "company_id required" });
    var c = await queryOne("SELECT * FROM companies WHERE id = $1", [company_id]);
    if (!c) return res.status(404).json({ error: "Company not found" });
    res.json({ ok: true, company: c });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// === AGENT TASK OUTPUT (Code, Diff, Files) ===
router.get("/agents/:id/output", async function(req, res) {
  try {
    var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [req.params.id]);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    var wtDir = "/root/blun-worktrees/agent-" + agent.name.toLowerCase();
    var cp = require("child_process");
    var fsx = require("fs");
    if (!fsx.existsSync(wtDir)) return res.json({ commits: [], diff: "", files: [], status: "no worktree", agent: agent.name });
    var execP = function(cmd) { return new Promise(function(r) { cp.exec(cmd, {timeout:10000,maxBuffer:500000,cwd:wtDir}, function(e,o){ r((o||"").trim()); }); }); };
    var log = await execP("git log main..HEAD --oneline 2>/dev/null");
    var diffStat = await execP("git diff main..HEAD --stat 2>/dev/null");
    var diffFull = await execP("git diff main..HEAD 2>/dev/null");
    var names = await execP("git diff main..HEAD --name-only 2>/dev/null");
    var latestTask = await queryOne("SELECT * FROM agent_tasks WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1", [req.params.id]);
    res.json({
      agent: agent.name,
      worktree: wtDir,
      commits: log ? log.split(String.fromCharCode(10)) : [],
      diff_stat: diffStat,
      diff_full: diffFull ? diffFull.substring(0, 50000) : "",
      files: names ? names.split(String.fromCharCode(10)).filter(function(x){return x;}) : [],
      latest_task: latestTask ? { id: latestTask.id, task: latestTask.task, status: latestTask.status } : null,
      status: log ? "has_changes" : "clean"
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === MERGE AGENT BRANCH ===
router.post("/agents/:id/merge", async function(req, res) {
  try {
    var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [req.params.id]);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    var branchName = "agent/" + agent.name.toLowerCase();
    var cp = require("child_process");
    var result = await new Promise(function(r) {
      cp.exec("cd /root/blun && git merge " + branchName + " --no-edit 2>&1 || echo MERGE_FAILED", {timeout:15000}, function(e,o){ r((o||"").trim()); });
    });
    if (result.indexOf("MERGE_FAILED") !== -1) return res.json({ ok: false, error: "Merge conflict", output: result });
    res.json({ ok: true, output: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// === KANBAN ===
router.get("/kanban", async function(req, res) {
  try {
    var cid = getCompanyId(req);
    var sql = "SELECT t.id, t.agent_id, t.task, t.status, t.score, t.created_at, t.completed_at, a.name as agent_name, a.role as agent_role FROM agent_tasks t JOIN blun_agents a ON t.agent_id = a.id WHERE (t.status != 'completed' OR (LENGTH(t.result) > 200 AND COALESCE((t.result::jsonb->>'changed_files_count')::int,0) >= 1))";
    var params = [];
    if (cid) { sql += " AND t.company_id = $1"; params.push(cid); }
    sql += " ORDER BY (CASE WHEN t.status = 'pending' THEN t.priority ELSE 0 END) DESC, t.created_at DESC";
    var tasks = await query(sql, params);
    res.json(tasks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/agents/:agentId/tasks/:taskId", async function(req, res) {
  try {
    var status = req.body.status;
    if (["pending","processing","completed","failed"].indexOf(status) === -1) return res.status(400).json({ error: "Invalid status" });
    await query("UPDATE agent_tasks SET status = $1, updated_at = NOW() WHERE id = $2", [status, req.params.taskId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


router.get("/tasks/:id/details", async function(req, res) {
  try {
    var cid = getCompanyId(req);
    var sql = "SELECT t.id, t.agent_id, t.task, t.status, t.score, t.result, t.feedback, t.created_at, t.completed_at, t.updated_at, t.company_id, t.priority, a.name as agent_name, a.role as agent_role, a.adapter_type as agent_adapter, a.model as agent_model FROM agent_tasks t LEFT JOIN blun_agents a ON t.agent_id = a.id WHERE t.id = $1";
    var params = [req.params.id];
    if (cid) { sql += " AND (t.company_id = $2 OR t.company_id IS NULL)"; params.push(cid); }
    var t = await queryOne(sql, params);
    if (!t) return res.status(404).json({ error: "task not found" });
    var parsed = null;
    if (t.result) { try { parsed = JSON.parse(t.result); } catch(e) { parsed = { raw_output: String(t.result).substring(0, 4000) }; } }
    t.parsed = parsed;
    res.json(t);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


router.post("/tasks/reorder", async function(req, res) {
  try {
    var ids = req.body.ids; // array of task ids in desired order (top first = highest priority)
    if (!Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
    var n = ids.length;
    for (var i = 0; i < n; i++) {
      var prio = n - i; // top gets highest
      await query("UPDATE agent_tasks SET priority = $1, updated_at = NOW() WHERE id = $2", [prio, ids[i]]);
    }
    res.json({ ok: true, count: n });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


router.post("/tasks/:id/retry", async function(req, res) {
  try {
    var newAgent = req.body && req.body.agent_id ? parseInt(req.body.agent_id, 10) : null;
    if (newAgent) {
      await query("UPDATE agent_tasks SET status='pending', feedback=NULL, result=NULL, agent_id=$1, updated_at=NOW() WHERE id=$2", [newAgent, req.params.id]);
    } else {
      await query("UPDATE agent_tasks SET status='pending', feedback=NULL, result=NULL, updated_at=NOW() WHERE id=$1", [req.params.id]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


router.get("/code-feed", async function(req, res) {
  try {
    var cp = require("child_process");
    cp.exec("cd /root/blun && git log -30 --pretty=format:'%H|%an|%ar|%s' --name-status", { maxBuffer: 4*1024*1024 }, function(err, stdout) {
      if (err) return res.status(500).json({ error: err.message });
      var commits = [];
      var current = null;
      stdout.split(String.fromCharCode(10)).forEach(function(line) {
        if (!line) { if (current) { commits.push(current); current = null; } return; }
        if (line.indexOf("|") !== -1 && line.split("|").length >= 4) {
          if (current) commits.push(current);
          var parts = line.split("|");
          current = { sha: parts[0], author: parts[1], when: parts[2], msg: parts.slice(3).join("|"), files: [] };
        } else if (current && /^[A-Z]	/.test(line)) {
          var p = line.split("	");
          current.files.push({ status: p[0], path: p[1] });
        }
      });
      if (current) commits.push(current);
      res.json(commits);
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


router.get("/next-deploy", async function(req, res) {
  try {
    var fs = require("fs");
    var INTERVAL = 150 * 60 * 1000; // 2.5h
    var last = 0;
    try { last = parseInt(fs.readFileSync("/tmp/blun_last_deploy.txt","utf8"),10) || 0; } catch(e) {}
    var now = Date.now();
    var nextAt = last > 0 ? last + INTERVAL : now + INTERVAL;
    var msLeft = Math.max(0, nextAt - now);
    var todayStart = new Date(); todayStart.setHours(0,0,0,0);
    var dt = await query("SELECT COUNT(*)::int as c FROM agent_tasks WHERE status='completed' AND COALESCE((result::jsonb->>'deployed')::text,'')='true' AND completed_at >= $1", [todayStart]);
    res.json({ next_deploy_at: nextAt, ms_left: msLeft, deployed_today: (dt && dt.c) || 0, interval_ms: INTERVAL });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


router.get("/dashboard-pages", async function(req, res) {
  try {
    var fs = require("fs"); var path = require("path");
    var dir = path.join(__dirname, "..", "..", "dashboard", "pages");
    var meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, "_meta.json"),"utf8")); } catch(e) {}
    var files = fs.readdirSync(dir).filter(function(f) { return f.endsWith(".html"); });
    var pages = files.map(function(f) {
      var slug = f.replace(".html","");
      var m = meta[slug] || {};
      var label = m.label || slug.split("-").map(function(w){ return w.charAt(0).toUpperCase()+w.slice(1); }).join(" ");
      return { slug: slug, label: label, url: "/dashboard/pages/" + f, category: m.category || "Mehr", icon: m.icon || "doc", order: m.order || 99 };
    });
    pages.sort(function(a,b){ if (a.category !== b.category) return a.category.localeCompare(b.category); return (a.order||99)-(b.order||99); });
    var grouped = {};
    pages.forEach(function(p){ (grouped[p.category] = grouped[p.category] || []).push(p); });
    res.json({ pages: pages, grouped: grouped });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;