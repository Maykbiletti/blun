// BLUN - AI Organisator | MIT License
// Hybrid: Agent operations via Paperclip Engine, local DB for livefeed/stats
var { Router } = require("express");
var { query, queryOne } = require("../db");
var { authenticate } = require("../middleware/auth");
var pc = require("../paperclip-proxy");
var router = Router();

var API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";
router.use("/", function(req, res, next) {
  var key = req.headers["x-blun-key"] || req.headers["x-api-key"];
  if (req.user) return next();
  if (key && key === API_KEY) return next();
  authenticate(req, res, function() {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    next();
  });
});

// === COMPANIES (Paperclip) ===
router.get("/companies", async function(req, res) {
  try {
    var companies = await pc.pcFetch("/api/companies");
    res.json(companies.map(function(c) { return { id: c.id, name: c.name, agent_count: 0, config: { description: c.description || "" } }; }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/companies", async function(req, res) {
  try {
    var c = await pc.pcFetch("/api/companies", { method: "POST", body: JSON.stringify({ name: req.body.name }) });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/companies/:id", async function(req, res) {
  try {
    await pc.pcFetch("/api/companies/" + req.params.id, { method: "DELETE" });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === AGENTS (Paperclip) ===
router.get("/agents", async function(req, res) {
  try { res.json(await pc.getAgents()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents", async function(req, res) {
  try { res.json(await pc.createAgent(req.body)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/create", async function(req, res) {
  try { res.json(await pc.createAgent(req.body)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/agents/:id", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var pa = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id, {
      method: "PATCH",
      body: JSON.stringify(req.body)
    });
    res.json(pc.transformAgent(pa));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/agents/:id", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id, { method: "DELETE" });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/start", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    await pc.startAgent(agent.pc_id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/agents/:id/stop", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    await pc.stopAgent(agent.pc_id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === TASKS (Paperclip) ===
router.post("/agents/:id/task", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var task = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id + "/tasks", {
      method: "POST", body: JSON.stringify({ title: req.body.task, description: req.body.task })
    });
    res.json(task);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get("/agents/:id/tasks", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var tasks = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id + "/tasks");
    res.json(tasks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === CHAT (Paperclip) ===
router.post("/agents/:id/chat", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var result = await pc.chatWithAgent(agent.pc_id, req.body.message);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === CONVERSATIONS (Paperclip) ===
router.get("/agents/:id/conversations", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var convos = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id + "/conversations");
    res.json(convos);
  } catch(e) { res.json([]); }
});

// === MEMORY ===
router.get("/agents/:id/memory", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var mem = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id + "/memory");
    res.json(mem);
  } catch(e) { res.json([]); }
});

// === HEARTBEATS (Paperclip) ===
router.get("/agents/:id/heartbeats", async function(req, res) {
  try {
    var agent = await pc.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Not found" });
    var beats = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/agents/" + agent.pc_id + "/heartbeats?limit=" + (req.query.limit || 60));
    res.json(beats);
  } catch(e) { res.json([]); }
});

// === STATS (Paperclip) ===
router.get("/stats", async function(req, res) {
  try {
    var agents = await pc.getAgents();
    var active = agents.filter(function(a) { return a.status === "running" || a.status === "active"; }).length;
    res.json({ total_agents: agents.length, active_agents: active, tasks_completed: 0, total_cost: 0, total_companies: 1 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === LIVEFEED (Paperclip events) ===
router.get("/livefeed", async function(req, res) {
  try {
    var events = await pc.pcFetch("/api/companies/" + pc.COMPANY_ID + "/events?limit=80");
    res.json(events);
  } catch(e) { res.json([]); }
});

// === OVERVIEW ===
router.get("/overview", async function(req, res) {
  try {
    var agents = await pc.getAgents();
    res.json({ tasks: [], agents: agents });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === UNIVERSITY (stub) ===
router.get("/university", async function(req, res) { res.json([]); });
router.post("/university/enroll", async function(req, res) { res.json({ ok: true }); });

// === MARKETPLACE (stub) ===
router.get("/marketplace", async function(req, res) { res.json([]); });

// === TASK COMMENTS (stub) ===
router.post("/tasks/:id/comment", async function(req, res) { res.json({ ok: true }); });
router.get("/tasks/:id/comments", async function(req, res) { res.json([]); });

// Upload + Skills routes (keep local)
try { require("./upload-route")(router, query); } catch(e) {}
try { require("./skills-route")(router, query, queryOne); } catch(e) {}

module.exports = router;
