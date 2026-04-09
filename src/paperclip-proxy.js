// Paperclip API Proxy — translates BLUN dashboard calls to Paperclip engine
// Enriches Paperclip data with legacy BLUN DB fields for UI compatibility
var { query } = require("./db");

var PAPERCLIP_BASE = "http://127.0.0.1:3100";
var COMPANY_ID = "59dcf77d-fe64-4700-a5f9-ef32957ac28c";

// Cache old BLUN agent data for UI fields
var _blunCache = null;
var _blunCacheTs = 0;
async function getBlunAgents() {
  if (_blunCache && Date.now() - _blunCacheTs < 30000) return _blunCache;
  try {
    _blunCache = await query("SELECT id, name, role, model, department, system_prompt, personality, heartbeat_interval FROM blun_agents");
    _blunCacheTs = Date.now();
  } catch(e) { _blunCache = []; }
  return _blunCache;
}

async function pcFetch(path, opts) {
  var url = PAPERCLIP_BASE + path;
  var resp = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error("Paperclip " + resp.status + ": " + errText.substring(0, 200));
  }
  return resp.json();
}

// Transform Paperclip agent to BLUN format, enriched with old DB fields
function transformAgent(pa, blunData) {
  var old = blunData ? blunData.find(function(b) { return b.name.toLowerCase() === pa.name.toLowerCase(); }) : null;
  return {
    id: old ? old.id : pa.urlKey || pa.id,
    pc_id: pa.id,
    name: pa.name,
    role: old ? old.role : (pa.title || pa.role || "general"),
    model: old ? old.model : ((pa.adapterConfig && pa.adapterConfig.model) || pa.adapterType || "unknown"),
    status: pa.status || "idle",
    department: old ? (old.department || "") : (pa.role || ""),
    company_id: pa.companyId,
    company_name: "BLUN AI",
    personality: old ? (old.personality || "") : "",
    system_prompt: old ? (old.system_prompt || "") : "",
    heartbeat_interval: old ? (old.heartbeat_interval || 60) : 30,
    last_heartbeat: pa.lastHeartbeatAt,
    pending_tasks: 0,
    runtime_active: pa.status === "running" || pa.status === "active",
    skills: pa.capabilities || [],
    skill_urls: {},
    created_at: pa.createdAt,
    updated_at: pa.updatedAt,
    adapter_type: pa.adapterType,
    reports_to: pa.reportsTo
  };
}

function invalidateCache() { _blunCache = null; _blunCacheTs = 0; }

async function getAgents() {
  var agents = await pcFetch("/api/companies/" + COMPANY_ID + "/agents");
  var blunData = await getBlunAgents();
  return agents.map(function(a) { return transformAgent(a, blunData); });
}

async function getAgent(idOrKey) {
  var agents = await getAgents();
  return agents.find(function(a) { return a.id == idOrKey || a.pc_id === idOrKey || a.name.toLowerCase() === (idOrKey + "").toLowerCase(); });
}

async function createAgent(data) {
  var roleMap = { assistant: "general", developer: "engineer", tester: "qa" };
  var role = roleMap[data.role] || data.role || "general";
  var validRoles = ["ceo","cto","cmo","cfo","engineer","designer","pm","qa","devops","researcher","general"];
  if (validRoles.indexOf(role) === -1) role = "general";
  var pa = await pcFetch("/api/companies/" + COMPANY_ID + "/agents", {
    method: "POST",
    body: JSON.stringify({ name: data.name, role: role, adapterType: data.adapter_type || "claude_local" })
  });
  return transformAgent(pa, null);
}

async function startAgent(pcId) {
  return pcFetch("/api/companies/" + COMPANY_ID + "/agents/" + pcId + "/start", { method: "POST" });
}

async function stopAgent(pcId) {
  return pcFetch("/api/companies/" + COMPANY_ID + "/agents/" + pcId + "/stop", { method: "POST" });
}

async function chatWithAgent(pcId, message) {
  return pcFetch("/api/companies/" + COMPANY_ID + "/agents/" + pcId + "/chat", {
    method: "POST",
    body: JSON.stringify({ message: message })
  });
}

module.exports = { invalidateCache, pcFetch, getAgents, getAgent, createAgent, startAgent, stopAgent, chatWithAgent, transformAgent, COMPANY_ID, PAPERCLIP_BASE };
