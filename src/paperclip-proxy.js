// Paperclip API Proxy — translates BLUN dashboard calls to Paperclip engine
var http = require("http");

var PAPERCLIP_BASE = "http://127.0.0.1:3100";
var COMPANY_ID = "59dcf77d-fe64-4700-a5f9-ef32957ac28c";

async function pcFetch(path, opts) {
  var url = PAPERCLIP_BASE + path;
  var resp = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error("Paperclip " + resp.status + ": " + errText.substring(0, 200));
  }
  return resp.json();
}

// Transform Paperclip agent to BLUN format
function transformAgent(pa) {
  return {
    id: pa.urlKey || pa.id,
    pc_id: pa.id,
    name: pa.name,
    role: pa.role || "general",
    model: (pa.adapterConfig && pa.adapterConfig.model) || pa.adapterType || "unknown",
    status: pa.status || "idle",
    department: pa.role || "",
    company_id: pa.companyId,
    company_name: "BLUN AI",
    personality: "",
    system_prompt: "",
    heartbeat_interval: 30,
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

async function getAgents() {
  var agents = await pcFetch("/api/companies/" + COMPANY_ID + "/agents");
  return agents.map(transformAgent);
}

async function getAgent(idOrKey) {
  var agents = await getAgents();
  return agents.find(function(a) { return a.id === idOrKey || a.pc_id === idOrKey || a.name.toLowerCase() === (idOrKey + "").toLowerCase(); });
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
  return transformAgent(pa);
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

module.exports = { pcFetch, getAgents, getAgent, createAgent, startAgent, stopAgent, chatWithAgent, transformAgent, COMPANY_ID, PAPERCLIP_BASE };
