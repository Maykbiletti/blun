// BLUN - AI Organisator | MIT License
// Thin wrapper — modules in src/agent/
var codeTools = require("./code-tools");
var { callClaudeCLIStream } = require("./claude-stream");

const { query, queryOne } = require("./db");
const { v4: uuid } = require("uuid");

// === MODULE IMPORTS ===
var llm = require("./agent/llm");
var perf = require("./agent/performance");
var messaging = require("./agent/messaging");
var codeGraph = require("./agent/code-graph");
var visualQA = require("./agent/visual-qa");
var memLayers = require("./agent/memory-layers");
var dream = require("./agent/dream");
var skillsLoader = require("./agent/skills-loader");
var taskRunner = require("./agent/task-runner");

// Re-export from modules
var callLLM = llm.callLLM;
var callClaudeCLI = llm.callClaudeCLI;
var callCodexCLI = llm.callCodexCLI;
var callCLI = llm.callCLI;
var getRateLimitStatus = llm.getRateLimitStatus;
var acquireCliSlot = llm.acquireCliSlot;
var releaseCliSlot = llm.releaseCliSlot;
var pauseCli = llm.pauseCli;
var decryptKey = llm.decryptKey;
var fetchWithRateLimit = llm.fetchWithRateLimit;

var selfHealTask = perf.selfHealTask;
var mentorReview = perf.mentorReview;
var awardXP = perf.awardXP;
var scoreTask = perf.scoreTask;
var updatePerformance = perf.updatePerformance;
var routeTask = perf.routeTask;
var splitTask = perf.splitTask;
var getLeaderboard = perf.getLeaderboard;
var autoScoreTask = perf.autoScoreTask;

var sendAgentMessage = messaging.sendAgentMessage;
var getAgentInbox = messaging.getAgentInbox;
var markMessageRead = messaging.markMessageRead;
var replyToMessage = messaging.replyToMessage;
var broadcastMessage = messaging.broadcastMessage;
var getUnreadSummary = messaging.getUnreadSummary;

var indexFileToGraph = codeGraph.indexFileToGraph;
var findRelatedFiles = codeGraph.findRelatedFiles;
var suggestAgentForFile = codeGraph.suggestAgentForFile;

var visualQACheck = visualQA.visualQACheck;
var autoVisualQA = visualQA.autoVisualQA;

var saveLayeredMemory = memLayers.saveLayeredMemory;
var loadLayeredMemory = memLayers.loadLayeredMemory;
var promoteMemory = memLayers.promoteMemory;
var filterNoiseFromDecisions = memLayers.filterNoiseFromDecisions;

var dreamCycle = dream.dreamCycle;
var startDreamCycle = dream.startDreamCycle;
var stopDreamCycle = dream.stopDreamCycle;

// Wire circular dependencies

// Active agent loops
const activeAgents = new Map();

// === MEMORY FUNCTIONS (kept inline — tightly coupled to heartbeat) ===

async function loadAgentMemory(agentId) {
  var rows = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1", [agentId]);
  var mem = {};
  for (var i = 0; i < rows.length; i++) mem[rows[i].key] = rows[i].value;
  return mem;
}

async function loadSmartMemory(agentId, userMessage, maxChars) {
  maxChars = maxChars || 8000;
  var rows = await query("SELECT key, content as value, updated_at FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [agentId]);
  if (!rows.length) return "";
  var priority = ["identity", "personality", "rules", "security", "rename", "vision", "skill_", "task_", "zuletzt_", "direct_"];
  var selected = [];
  var totalChars = 0;
  var msg = (userMessage || "").toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    var dominated = false;
    for (var p = 0; p < priority.length; p++) {
      if (rows[i].key.indexOf(priority[p]) !== -1) { dominated = true; break; }
    }
    if (dominated && totalChars + rows[i].value.length < maxChars) {
      selected.push(rows[i]);
      totalChars += rows[i].value.length;
    }
  }
  // Always load last 10 completed tasks into context
  for (var ti = 0; ti < rows.length && ti < 20; ti++) {
    if (rows[ti].key.indexOf("task_") === 0 && totalChars + rows[ti].value.length < maxChars) {
      var alreadyThere = false;
      for (var st = 0; st < selected.length; st++) { if (selected[st].key === rows[ti].key) { alreadyThere = true; break; } }
      if (!alreadyThere) { selected.push(rows[ti]); totalChars += rows[ti].value.length; }
    }
  }
  if (msg.length > 5) {
    try {
      var fuzzyRows = await query(
        "SELECT key, content as value, updated_at, similarity(content, $2) as sim FROM agent_memory WHERE agent_id = $1 AND similarity(content, $2) > 0.05 ORDER BY sim DESC LIMIT 10",
        [agentId, userMessage.substring(0, 200)]
      );
      for (var fi = 0; fi < fuzzyRows.length; fi++) {
        if (selected.indexOf(fuzzyRows[fi]) !== -1) continue;
        if (totalChars >= maxChars) break;
        var alreadyIn = false;
        for (var si = 0; si < selected.length; si++) {
          if (selected[si].key === fuzzyRows[fi].key) { alreadyIn = true; break; }
        }
        if (!alreadyIn && totalChars + fuzzyRows[fi].value.length < maxChars) {
          selected.push(fuzzyRows[fi]);
          totalChars += fuzzyRows[fi].value.length;
        }
      }
    } catch(fzErr) {}
  }
  var words = msg.split(/\s+/).filter(function(w) { return w.length > 3; });
  for (var i = 0; i < rows.length; i++) {
    if (selected.indexOf(rows[i]) !== -1) continue;
    if (totalChars >= maxChars) break;
    var keyLow = (rows[i].key + " " + rows[i].value.substring(0, 200)).toLowerCase();
    var match = false;
    for (var w = 0; w < words.length; w++) {
      if (keyLow.indexOf(words[w]) !== -1) { match = true; break; }
    }
    if (match && totalChars + rows[i].value.length < maxChars) {
      selected.push(rows[i]);
      totalChars += rows[i].value.length;
    }
  }
  for (var i = 0; i < rows.length; i++) {
    if (selected.indexOf(rows[i]) !== -1) continue;
    if (totalChars >= maxChars) break;
    if (totalChars + rows[i].value.length < maxChars) {
      selected.push(rows[i]);
      totalChars += rows[i].value.length;
    }
  }
  if (!selected.length) return "";
  return "\n\nDein Gedaechtnis (" + selected.length + "/" + rows.length + " Erinnerungen geladen):\n" + selected.map(function(r) { return r.key + ": " + r.value; }).join("\n");
}

async function saveAgentMemory(agentId, key, value, tags, category) {
  var tagArr = tags || [];
  var cat = category || 'general';
  if (typeof tagArr === 'string') tagArr = tagArr.split(',').map(function(t){return t.trim();});
  await query(
    "INSERT INTO agent_memory (agent_id, key, content, tags, category, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, tags = $4, category = $5, updated_at = NOW()",
    [agentId, key, value, tagArr, cat]
  );
}

async function searchAgentMemory(agentId, searchQuery, limit) {
  limit = limit || 5;
  var rows = await query(
    "SELECT key, content as value, tags, category, similarity(content, $2) as relevance FROM agent_memory WHERE agent_id = $1 AND (similarity(content, $2) > 0.05 OR content ILIKE $3) ORDER BY relevance DESC NULLS LAST LIMIT $4",
    [agentId, searchQuery.substring(0, 200), '%' + searchQuery.substring(0, 50) + '%', limit]
  );
  return rows;
}

async function searchMemoryByTag(agentId, tag) {
  var rows = await query(
    "SELECT key, content as value, tags, category FROM agent_memory WHERE agent_id = $1 AND $2 = ANY(tags) ORDER BY updated_at DESC",
    [agentId, tag]
  );
  return rows;
}
// Wire circular dependencies (after all functions defined)perf.setDeps({ sendAgentMessage: sendAgentMessage, saveAgentMemory: saveAgentMemory, routeTask: routeTask, callLLM: callLLM });visualQA.setDeps({ saveAgentMemory: saveAgentMemory, sendAgentMessage: sendAgentMessage, callLLM: callLLM });dream.setDeps({ callLLM: callLLM, saveAgentMemory: saveAgentMemory });

// === CREWAI PATTERNS: Sequential Pipeline + Delegation ===

async function runPipeline(tasks, companyId) {
  // Sequential pipeline: each task output becomes context for the next
  var context = "";
  var results = [];
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var agentId = task.agentId;
    if (!agentId && task.department) {
      // Dynamic routing by department (CrewAI hierarchical pattern)
      var routed = await routeTask(task.description, companyId);
      agentId = routed ? routed.agentId : null;
    }
    if (!agentId) { results.push({ step: i, error: "No agent found" }); continue; }

    // Inject previous step context
    var fullTask = task.description;
    if (context) fullTask = "KONTEXT AUS VORHERIGEM SCHRITT:\n" + context + "\n\nDEINE AUFGABE:\n" + task.description;

    await query("INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW())", [agentId, fullTask, task.parentTaskId || null]);
    console.log("[pipeline] Step " + i + " -> Agent " + agentId + ": " + task.description.substring(0, 80));

    // Wait for completion (poll)
    var maxWait = task.timeoutMs || 300000;
    var start = Date.now();
    var result = null;
    while (Date.now() - start < maxWait) {
      var row = await queryOne("SELECT status, result FROM agent_tasks WHERE agent_id = $1 AND task = $2 ORDER BY id DESC LIMIT 1", [agentId, fullTask]);
      if (row && (row.status === 'completed' || row.status === 'completed_no_code' || row.status === 'error')) {
        result = row;
        break;
      }
      await new Promise(function(r) { setTimeout(r, 10000); });
    }

    if (result) {
      context = (result.result || "").substring(0, 3000);
      results.push({ step: i, agentId: agentId, status: result.status, output: context.substring(0, 500) });
    } else {
      results.push({ step: i, agentId: agentId, status: "timeout" });
      break;
    }
  }
  return results;
}

async function delegateTask(fromAgentId, toAgentId, task, reason) {
  // CrewAI-style delegation: one agent delegates to another
  await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES ($1, $2, 'pending', NOW())", [toAgentId, task]);
  await sendAgentMessage(fromAgentId, toAgentId, "Delegation", "Ich delegiere dir: " + task + (reason ? "\nGrund: " + reason : ""), "high");
  console.log("[delegate] Agent " + fromAgentId + " -> Agent " + toAgentId + ": " + task.substring(0, 80));
  return { delegated: true, toAgentId: toAgentId };
}

// === HEARTBEAT (core orchestration) ===
async function heartbeat(agentId) {
  var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent || agent.status === "idle") { stopAgent(agentId); return; }

  // Check for pending task
  var pendingTask = await queryOne(
    "SELECT * FROM agent_tasks WHERE agent_id = $1 AND status IN ('pending') ORDER BY created_at ASC LIMIT 1",
    [agentId]
  );

  // Skip operator — handled by dieter-daemon
  var isOperator = false;
  if (agent.company_id) {
    var firstAgent = await queryOne("SELECT id FROM blun_agents WHERE company_id = $1 ORDER BY id LIMIT 1", [agent.company_id]);
    isOperator = firstAgent && firstAgent.id === agentId;
  }

  if (!pendingTask) {
    // Record idle heartbeat
    await query("INSERT INTO agent_heartbeats (agent_id, status, tokens_used, cost) VALUES ($1, 'idle', 0, 0)", [agentId]);
    return;
  }

  if (isOperator) {
    // Operator doesn't code — skip
    await query("INSERT INTO agent_heartbeats (agent_id, status, tokens_used, cost) VALUES ($1, 'dispatching', 0, 0)", [agentId]);
    return;
  }

  // === TASK RUNNER: Execute task with validation ===
  try {
    var result = await taskRunner.runAgentTasks(agent, query, queryOne);
    var status = result.pass ? "completed" : (result.idle ? "idle" : "retry");
    var tokens = result.pass ? 500 : 0;
    await query("INSERT INTO agent_heartbeats (agent_id, status, tokens_used, cost) VALUES ($1, $2, $3, $4)",
      [agentId, status, tokens, tokens * 0.000003]);
    
    // Log to conversations for UI visibility
    if (result.pass) {
      await query("INSERT INTO agent_conversations (agent_id, role, content, internal) VALUES ($1, 'assistant', $2, true)",
        [agentId, "Task erledigt: " + result.commits + " Commits, " + result.files + " Dateien geaendert."]);
    }
  } catch(taskErr) {
    console.error("[heartbeat] Task runner error for " + agent.name + ":", taskErr.message);
    await query("INSERT INTO agent_heartbeats (agent_id, status, tokens_used, cost) VALUES ($1, 'error', 0, 0)", [agentId]);
  }
}

function startAgent(agentId) {
  if (activeAgents.has(agentId)) return;

  // Set status to active FIRST, before any heartbeat runs
  startDreamCycle(agentId);
  query("UPDATE blun_agents SET status = $1, last_heartbeat = NOW() WHERE id = $2", ["active", agentId]).then(function() {
    var run = async function() {
      try { await heartbeat(agentId); } catch (e) { console.error("[agent-engine] Heartbeat error:", e.message); }
    };

    queryOne("SELECT heartbeat_interval FROM blun_agents WHERE id = $1", [agentId]).then(function(row) {
      var interval = ((row && row.heartbeat_interval) || 60) * 1000;
      var timer = setInterval(run, interval);
      activeAgents.set(agentId, { timer: timer, running: true });
      // Run first heartbeat after a short delay
      setTimeout(run, 1000);
    });
  });
}

function stopAgent(agentId) {
  stopDreamCycle(agentId);
  var entry = activeAgents.get(agentId);
  if (entry) {
    clearInterval(entry.timer);
    activeAgents.delete(agentId);
  }
  query("UPDATE blun_agents SET status = $1 WHERE id = $2", ["idle", agentId]).catch(function() {});
}

function getActiveAgents() {
  return Array.from(activeAgents.keys());
}

async function chatWithAgent(agentId, message, isInternal) {
  var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent) throw new Error("Agent not found");

  // Auto-generate IDENTITY if not set
  var identityRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'IDENTITY'", [agentId]);
  if (!identityRow) {
    var identityContent = "# " + (agent.name || "Agent") + "\n" +
      "- Rolle: " + (agent.role || "KI-Agent") + "\n" +
      (agent.department ? "- Abteilung: " + agent.department + "\n" : "") +
      "- Team: BLUN.ai Agent-Team\n" +
      "- Sprache: Deutsch\n" +
      (agent.personality ? "- Vibe: " + agent.personality.substring(0, 150).split("\n")[0] + "\n" : "") +
      "\nIch bin " + (agent.name || "ein Agent") + " und Teil des BLUN Agent-Teams. Ich kenne meine Rolle und handle entsprechend.";
    await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, 'IDENTITY', $2) ON CONFLICT (agent_id, key) DO NOTHING", [agentId, identityContent]);
    identityRow = { content: identityContent };
  }

  var memBudget = (agent.model && (agent.model.startsWith("local:") || agent.model.includes("gemma") || agent.model.includes("llama"))) ? 500 : 8000;
  var memStr = await loadSmartMemory(agentId, message, memBudget);
  var agentSkills = await query(
    "SELECT s.name, s.code, s.description FROM skills s JOIN agent_skills as2 ON as2.skill_id = s.id WHERE as2.agent_id = $1 AND s.safe = true",
    [agentId]
  );
  var nl = String.fromCharCode(10);
  var skillStr = "";
      if (agentSkills.length) {
        skillStr = nl+nl+"=== DEINE SKILLS (AKTIV NUTZEN!) ==="+nl;
        skillStr += "Du MUSST die folgenden Skills bei jeder Aufgabe aktiv anwenden. Sie enthalten Regeln, Frameworks und Methoden die deine Arbeit leiten."+nl+nl;
        for (var si = 0; si < agentSkills.length; si++) {
          var sk = agentSkills[si];
          var content = (sk.code || sk.description || "").substring(0, 3000);
          skillStr += "### SKILL: " + sk.name + nl + content + nl + nl;
        }
      }
  var history = await query(
    "SELECT role, content FROM agent_conversations WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10",
    [agentId]
  );
  history.reverse();
  var messages = [
    { role: "system", content: (identityRow ? identityRow.content + "\n\n" : "") + (agent.system_prompt || "Du bist ein hilfreicher Agent.") + skillStr + memStr }
  ].concat(history).concat([
    { role: "user", content: message }
  ]);

  var result = await callLLM(agent.model, messages, agentId);

  await query("INSERT INTO agent_conversations (agent_id, role, content, internal) VALUES ($1, $2, $3, $4)", [agentId, "user", message, !!isInternal]);
  await query("INSERT INTO agent_conversations (agent_id, role, content, internal) VALUES ($1, $2, $3, $4)", [agentId, "assistant", result.content, !!isInternal]);
  // Auto-memory: save last activity
  try {
    var today = new Date().toISOString().substring(0,10);
    var summary = (result.content || "").substring(0,300).replace(/\n/g,' ');
    await saveAgentMemory(agentId, 'zuletzt_' + today, 'Chat: ' + (typeof message !== 'undefined' && message ? message : (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '')).substring(0,80) + ' | Antwort: ' + summary);
  } catch(me) { console.error('[auto-memory]', me.message); }

  if (result.tokens > 0) {
    await query("INSERT INTO agent_heartbeats (agent_id, status, model, tokens_used, cost) VALUES ($1, $2, $3, $4, $5)", [agentId, "chat", agent.model, result.tokens, result.cost]);
  }

  try {
    var toolResult = await executeTools(agentId, message, result.content);
    if (toolResult) {
      var fuMessages = messages.concat([{role:"assistant",content:result.content},{role:"user",content:"Tool-Ergebnisse:\n"+toolResult+"\n\nAntworte auf Basis dieser Ergebnisse."}]);
      var fu = await callLLM(agent.model, fuMessages);
      await query("INSERT INTO agent_conversations (agent_id, role, content, internal) VALUES ($1, $2, $3, $4)", [agentId, "assistant", fu.content, !!isInternal]);
      return { response: fu.content, tokens: result.tokens, cost: result.cost };
    }
  } catch(te) { console.error("[tools]", te.message); }
  return { response: result.content, tokens: result.tokens, cost: result.cost };
}
module.exports = { runPipeline, delegateTask, startAgent, stopAgent, getActiveAgents, chatWithAgent, callLLM, loadAgentMemory, saveAgentMemory, activeAgents, getRateLimitStatus, dreamCycle, startDreamCycle, stopDreamCycle, sendAgentMessage, getAgentInbox, markMessageRead, replyToMessage, broadcastMessage, getUnreadSummary, saveLayeredMemory, loadLayeredMemory, promoteMemory, filterNoiseFromDecisions, indexFileToGraph, findRelatedFiles, suggestAgentForFile, searchAgentMemory, searchMemoryByTag, scoreTask, updatePerformance, routeTask, splitTask, getLeaderboard, autoScoreTask, selfHealTask, mentorReview, awardXP, visualQACheck, autoVisualQA };

// === DIETER TOOL CALLING ===
var http = require('http');

function callLocalAPI(method, path, body) {
  return new Promise(function(resolve, reject) {
    var port = process.env.BLUN_PORT || 3200;
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: '127.0.0.1', port: port, path: path, method: method,
      headers: { 'Content-Type': 'application/json', 'x-blun-key': process.env.BLUN_API_KEY || 'blun-dev-key' }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { resolve({ raw: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(600000); // 10 min timeout for local models
    if (data) req.write(data);
    req.end();
  });
}


async function resolveAgentRef(ref) {
  if (/^d+$/.test(ref)) return ref;
  var agent = await queryOne("SELECT id FROM blun_agents WHERE LOWER(name) = LOWER($1) LIMIT 1", [ref]);
  return agent ? String(agent.id) : null;
}

function sleepMs(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
async function executeTools(agentId, message, aiResponse) {
  // Detect tool commands in AI response
  var cmds = [];
  var lines = aiResponse.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m;
    if ((m = lines[i].match(/\[TOOL:LIST_MODELS\]/i))) cmds.push({ tool: 'list_models' });
    if ((m = lines[i].match(/\[TOOL:DOWNLOAD_MODEL:([^\]]+)\]/i))) cmds.push({ tool: 'download_model', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:START_MODEL:([^\]]+)\]/i))) cmds.push({ tool: 'start_model', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:STOP_MODEL:([^\]]+)\]/i))) cmds.push({ tool: 'stop_model', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:MODEL_STATUS:([^\]]+)\]/i))) cmds.push({ tool: 'model_status', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:LIST_AGENTS\]/i))) cmds.push({ tool: 'list_agents' });
    if ((m = lines[i].match(/\[TOOL:SERVER_STATUS\]/i))) cmds.push({ tool: 'server_status' });
    if ((m = lines[i].match(/\[TOOL:CREATE_AGENT:([^|]+)\|([^|]+)\|([^|\]]+)\|?([^\]]*)\]/i))) cmds.push({ tool: 'create_agent', name: m[1].trim(), role: m[2].trim(), model: m[3].trim(), department: (m[4]||'').trim() });
    if ((m = lines[i].match(/\[TOOL:DELETE_AGENT:(\d+)\]/i))) cmds.push({ tool: 'delete_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:RESET_AGENT:(\d+)\]/i))) cmds.push({ tool: 'reset_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:AGENT_MEMORY:(\d+)\]/i))) cmds.push({ tool: 'agent_memory', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:SET_MEMORY:(\d+)\|([^|]+)\|([^\]]+)\]/i))) cmds.push({ tool: 'set_memory', id: m[1].trim(), key: m[2].trim(), value: m[3].trim() });
    if ((m = lines[i].match(/\[TOOL:CHAT_AGENT:(\d+)\|([^\]]+)\]/i))) cmds.push({ tool: 'chat_agent', id: m[1].trim(), message: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:CREATE_AGENT:([^|]+)\|([^|]+)\|([^|\]]+)\|?([^\]]*)\]/i))) cmds.push({ tool: 'create_agent', name: m[1].trim(), role: m[2].trim(), model: m[3].trim(), department: (m[4]||'').trim() });
    if ((m = lines[i].match(/\[TOOL:DELETE_AGENT:([^\\]]+)\]/i))) cmds.push({ tool: 'delete_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:RESET_AGENT:([^\\]]+)\]/i))) cmds.push({ tool: 'reset_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:AGENT_MEMORY:([^\\]]+)\]/i))) cmds.push({ tool: 'agent_memory', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:SET_MEMORY:([^|]+)\|([^|]+)\|([^\]]+)\]/i))) cmds.push({ tool: 'set_memory', id: m[1].trim(), key: m[2].trim(), value: m[3].trim() });
    if ((m = lines[i].match(/\[TOOL:CHAT_AGENT:([^|]+)\|([^\]]+?)(?:\|PRIORITY:\d+)?\]/i))) cmds.push({ tool: 'chat_agent', ref: m[1].trim(), message: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:CREATE_COMPANY:([^\]]+)\]/i))) cmds.push({ tool: 'create_company', name: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:LIST_COMPANIES\]/i))) cmds.push({ tool: 'list_companies' });
    if ((m = lines[i].match(/\[TOOL:LIST_SKILLS\]/i))) cmds.push({ tool: 'list_skills' });
    if ((m = lines[i].match(/\[TOOL:ASSIGN_TASK:([^|]+)\|([^\]]+?)(?:\|PRIORITY:\d+)?\]/i))) cmds.push({ tool: 'assign_task', agent_ref: m[1].trim(), description: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:LIST_TASKS\]/i))) cmds.push({ tool: 'list_tasks' });
    if ((m = lines[i].match(/\[TOOL:REBALANCE(?::(\d+))?\]/i))) cmds.push({ tool: 'rebalance', cap: m[1] ? parseInt(m[1]) : 12 });
    if ((m = lines[i].match(/\[TOOL:DECOMPOSE:(\d+)\|([^\]]+)\]/i))) cmds.push({ tool: 'decompose', parentId: parseInt(m[1]), subtasks: m[2].split(';').map(function(x){return x.trim();}).filter(Boolean) });
    if ((m = lines[i].match(/\[TOOL:REPRIORITIZE\]/i))) cmds.push({ tool: 'reprioritize' });
    if ((m = lines[i].match(/\[TOOL:BLOCKER_SCAN\]/i))) cmds.push({ tool: 'blocker_scan' });
    if ((m = lines[i].match(/\[TOOL:NEXT_WAVE:([^\]]+)\]/i))) cmds.push({ tool: 'next_wave', tasks: m[1].split(';').map(function(x){return x.trim();}).filter(Boolean) });
    if ((m = lines[i].match(/\[TOOL:BUILD_COMPANY:([^|]+)\|([^\]]+)\]/i))) cmds.push({ tool: 'build_company', name: m[1].trim(), description: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:GIT_COMMIT:([^\]]+)\]/i))) cmds.push({ tool: "git_commit", msg: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:GIT_PUSH:([^\]]+)\]/i))) cmds.push({ tool: "git_commit", msg: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:GIT_REMOTE\]/i))) cmds.push({ tool: "git_remote" });
    if ((m = lines[i].match(/\[TOOL:DEPLOY\]/i))) cmds.push({ tool: "deploy" });
    codeTools.parseLine(lines[i], cmds);
  }
  if (cmds.length === 0) return null;

  var results = [];
  for (var j = 0; j < cmds.length; j++) {
    var cmd = cmds[j];
    try {
      if (cmd.tool === 'list_models') {
        var models = await callLocalAPI('GET', '/api/models');
        var list = (models && models.models) ? models.models : (models || []);
        var summary = list.map(function(m) {
          return m.name + ' (' + m.id + ') — ' + (m.sizeGB || m.size_gb || '?') + ' — Status: ' + (m.status || 'available');
        }).join('\n');
        results.push('Verfuegbare Modelle:\n' + summary);
      } else if (cmd.tool === 'download_model') {
        var r = await callLocalAPI('POST', '/api/models/' + cmd.id + '/download');
        results.push('Download ' + cmd.id + ': ' + (r.message || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'start_model') {
        var r = await callLocalAPI('POST', '/api/models/' + cmd.id + '/load');
        results.push('Start ' + cmd.id + ': ' + (r.message || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'stop_model') {
        var r = await callLocalAPI('POST', '/api/models/' + cmd.id + '/unload');
        results.push('Stop ' + cmd.id + ': ' + (r.message || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'model_status') {
        var r = await callLocalAPI('GET', '/api/models/' + cmd.id + '/status');
        results.push('Status ' + cmd.id + ': ' + JSON.stringify(r));
      } else if (cmd.tool === 'list_agents') {
        var r = await callLocalAPI('GET', '/api/organisator/agents');
        var list = (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
        var summary = list.map(function(a) { return a.name + ' (' + (a.role||'agent') + ') — ' + (a.status||'unknown'); }).join('\n');
        results.push('Agents:\n' + summary);
      } else if (cmd.tool === 'create_agent') {
        var r = await callLocalAPI('POST', '/api/organisator/agents', {
          name: cmd.name,
          role: cmd.role,
          department: cmd.department || '',
          model: cmd.model,
          status: 'active',
          company_id: agent.company_id || 1,
          system_prompt: (cmd.role && (cmd.role.toLowerCase().indexOf('operator') !== -1 || cmd.role.toLowerCase().indexOf('ceo') !== -1 || cmd.role.toLowerCase().indexOf('organisator') !== -1)) ?
            'Du bist ' + cmd.name + ', Operator/CEO. KERNREGELN: 1) NUR Code-Tasks mit Dateipfad verteilen (dashboard/components/, src/routes/ etc). NIEMALS Analyse/Report/Konzept/Marketing. 2) Ergebnisse pruefen: git diff nach Task-Completion — keine Datei = nicht erfolgreich. 3) Skills aktiv nutzen. 4) Qualitaet vor Quantitaet. 5) VERBOTEN: agent-engine.js, code-tools.js, server.js, .env, package.json. 6) Systematisch arbeiten, kein Panik-Modus. 7) Syntax-Check vor Deploy. TASK-FORMAT: [TOOL:ASSIGN_TASK:id:VERB + WAS + Dateipfad]. REBALANCE: [TOOL:REBALANCE] oder [TOOL:REBALANCE:CAP] verteilt ueberlastete Agents um (Default CAP=12). TRIGGER: "verteil neu"=REBALANCE, "zerleg #id in X;Y;Z"=[TOOL:DECOMPOSE:id|sub1;sub2], "was ist wichtig"=[TOOL:REPRIORITIZE], "wo haengts"=[TOOL:BLOCKER_SCAN], "naechste welle: a;b;c"=[TOOL:NEXT_WAVE:a;b;c].' :
            'Du bist ' + cmd.name + ', ein ' + cmd.role + '. Du sprichst Deutsch, schreibst echten Code und hilfst proaktiv. Bei jeder Aufgabe MUSST du Dateien aendern (.js/.css/.html). Nutze alle zugewiesenen Skills aktiv.'
        });
        results.push('Agent erstellt: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'delete_agent') {
        var r = await callLocalAPI('DELETE', '/api/organisator/agents/' + cmd.id);
        results.push('Agent ' + cmd.id + ' geloescht: ' + (r.ok ? 'OK' : (r.error || JSON.stringify(r))));
      } else if (cmd.tool === 'reset_agent') {
        var r = await callLocalAPI('PUT', '/api/organisator/agents/' + cmd.id, { status: 'active' });
        results.push('Agent ' + cmd.id + ' resettet: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'agent_memory') {
        var r = await callLocalAPI('GET', '/api/organisator/agents/' + cmd.id + '/memory');
        var mem = r || {};
        var entries = Object.keys(mem).map(function(k) { return k + ': ' + mem[k]; }).join('\n');
        results.push('Memory Agent ' + cmd.id + ':\n' + (entries || 'leer'));
      } else if (cmd.tool === 'set_memory') {
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + cmd.id + '/memory', { key: cmd.key, content: cmd.value });
        results.push('Memory gesetzt: ' + cmd.key + ' fuer Agent ' + cmd.id);
      } else if (cmd.tool === 'chat_agent') {
        var chatId = await resolveAgentRef(cmd.ref);
        if (!chatId) { results.push('Agent "' + cmd.ref + '" nicht gefunden'); continue; }
        // Also create a task so the agent works on it via CLI
        var tdl = cmd.message.toLowerCase();
        var hasFile = /\.(js|css|html|json|ts)/.test(tdl) || tdl.indexOf("src/") !== -1 || tdl.indexOf("dashboard/") !== -1;
        if (hasFile) {
          await callLocalAPI('POST', '/api/organisator/agents/' + chatId + '/task', { task: cmd.message, priority: 'normal' });
          console.log("[operator] CHAT_AGENT -> Task created for " + cmd.ref + ": " + cmd.message.substring(0,80));
        }
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + chatId + '/chat', { message: cmd.message });
        results.push('Task+Chat an ' + cmd.ref + ': ' + (r.response || r.error || JSON.stringify(r)).substring(0,200));
        await sleepMs(2000); // Wait before next agent call
      } else if (cmd.tool === 'create_company') {
        var r = await callLocalAPI('POST', '/api/organisator/companies', { name: cmd.name, description: '' });
        results.push('Firma erstellt: ' + (r.name || r.error || JSON.stringify(r)) + (r.id ? ' (ID: ' + r.id + ')' : ''));
      } else if (cmd.tool === 'list_companies') {
        var r = await callLocalAPI('GET', '/api/organisator/companies');
        var list = Array.isArray(r) ? r : (r.rows || []);
        var summary = list.map(function(c) { return c.name + ' (ID: ' + c.id + ', ' + (c.agent_count || 0) + ' Agents)'; }).join('\n');
        results.push('Firmen:\n' + (summary || 'keine'));
      } else if (cmd.tool === 'list_skills') {
        var r = await callLocalAPI('GET', '/api/skills');
        var skills = Array.isArray(r) ? r : (r.skills || []);
        var summary = skills.map(function(s) { return (s.name || s.id) + ' — ' + (s.description || ''); }).join('\n');
        results.push('Verfuegbare Skills:\n' + (summary || 'keine'));
      } else if (cmd.tool === 'assign_task') {
        var resolvedId = await resolveAgentRef(cmd.agent_ref);
        if (!resolvedId) { results.push('Agent "' + cmd.agent_ref + '" nicht gefunden'); continue; }
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + resolvedId + '/task', { task: cmd.description, priority: 'normal' });
        results.push('Aufgabe zugewiesen an ' + cmd.agent_ref + ' (ID ' + resolvedId + '): ' + cmd.description);
      } else if (cmd.tool === 'list_tasks') {
        var r = await callLocalAPI('GET', '/api/organisator/agents/1/tasks');
        var tasks = Array.isArray(r) ? r : (r.rows || []);
        var summary = tasks.slice(0, 20).map(function(t) { return '#' + t.id + ' [' + t.status + '] ' + (t.description || '').substring(0, 60); }).join('\n');
        results.push('Aufgaben:\n' + (summary || 'keine'));
      } else if (cmd.tool === 'rebalance') {
        try {
          var CAP = cmd.cap || 12;
          var hot = await query("SELECT a.id, a.name, COUNT(t.id)::int AS open FROM blun_agents a LEFT JOIN agent_tasks t ON t.agent_id = a.id AND t.status IN ('pending','processing') WHERE a.id != 1 AND a.status = 'active' GROUP BY a.id, a.name HAVING COUNT(t.id) > " + CAP + " ORDER BY open DESC");
          var cold = await query("SELECT a.id, a.name, COUNT(t.id)::int AS open FROM blun_agents a LEFT JOIN agent_tasks t ON t.agent_id = a.id AND t.status IN ('pending','processing') WHERE a.id != 1 AND a.status = 'active' GROUP BY a.id, a.name HAVING COUNT(t.id) < " + CAP + " ORDER BY open ASC");
          var hotRows = Array.isArray(hot) ? hot : (hot.rows || []);
          var coldRows = Array.isArray(cold) ? cold : (cold.rows || []);
          var moved = 0; var moves = [];
          for (var h = 0; h < hotRows.length; h++) {
            var over = hotRows[h].open - CAP;
            var movable = await query("SELECT id FROM agent_tasks WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT $2", [hotRows[h].id, over]);
            var movRows = Array.isArray(movable) ? movable : (movable.rows || []);
            var ci = 0;
            for (var mi = 0; mi < movRows.length; mi++) {
              if (!coldRows.length) break;
              var target = coldRows[ci % coldRows.length];
              await query("UPDATE agent_tasks SET agent_id = $1 WHERE id = $2", [target.id, movRows[mi].id]);
              target.open = (target.open || 0) + 1;
              moves.push('#' + movRows[mi].id + ' ' + hotRows[h].name + '->' + target.name);
              moved++; ci++;
            }
          }
          results.push('Rebalance (CAP=' + CAP + '): ' + moved + ' Tasks verschoben. ' + (moves.slice(0,10).join(', ') || 'nichts zu tun'));
        } catch(re) { results.push('Rebalance Fehler: ' + re.message); }
      } else if (cmd.tool === 'decompose') {
        try {
          var parent = await query("SELECT id, task, agent_id, company_id FROM agent_tasks WHERE id = $1", [cmd.parentId]);
          var pRows = Array.isArray(parent) ? parent : (parent.rows || []);
          if (!pRows.length) { results.push('Decompose: parent #' + cmd.parentId + ' nicht gefunden'); continue; }
          var pr = pRows[0];
          var created = [];
          for (var di = 0; di < cmd.subtasks.length; di++) {
            var ins = await query("INSERT INTO agent_tasks (task, status, parent_task_id, company_id, agent_id, priority) VALUES ($1, 'pending', $2, $3, $4, $5) RETURNING id",
              [cmd.subtasks[di], pr.id, pr.company_id, pr.agent_id, 0]);
            var iRows = Array.isArray(ins) ? ins : (ins.rows || []);
            if (iRows.length) created.push('#' + iRows[0].id);
          }
          await query("UPDATE agent_tasks SET status = 'decomposed' WHERE id = $1", [pr.id]);
          results.push('Decompose #' + pr.id + ': ' + created.length + ' Subtasks erzeugt (' + created.join(', ') + ')');
        } catch(de) { results.push('Decompose Fehler: ' + de.message); }
      } else if (cmd.tool === 'reprioritize') {
        try {
          var HIGH_KW = ['bug','blocker','critical','urgent','broken','kaputt','crash','prod','fix','security','dringend','kritisch'];
          var LOW_KW  = ['nice-to-have','optional','spaeter','cleanup','doku','readme','kommentar','refactor'];
          var pend = await query("SELECT id, task FROM agent_tasks WHERE status = 'pending'");
          var pRows = Array.isArray(pend) ? pend : (pend.rows || []);
          var bumped = 0, lowered = 0;
          for (var ri = 0; ri < pRows.length; ri++) {
            var t = (pRows[ri].task || '').toLowerCase();
            var isHigh = HIGH_KW.some(function(k){ return t.indexOf(k) !== -1; });
            var isLow  = LOW_KW.some(function(k){ return t.indexOf(k) !== -1; });
            var prio = isHigh ? 10 : (isLow ? -5 : 0);
            await query("UPDATE agent_tasks SET priority = $1 WHERE id = $2", [prio, pRows[ri].id]);
            if (prio > 0) bumped++; else if (prio < 0) lowered++;
          }
          results.push('Reprioritize: ' + pRows.length + ' Tasks geprueft, ' + bumped + ' hoch, ' + lowered + ' runter');
        } catch(pe) { results.push('Reprioritize Fehler: ' + pe.message); }
      } else if (cmd.tool === 'blocker_scan') {
        try {
          var stuck = await query("SELECT t.id, t.task, t.status, a.name, EXTRACT(EPOCH FROM (NOW() - t.created_at))/3600 AS age_h FROM agent_tasks t LEFT JOIN blun_agents a ON a.id = t.agent_id WHERE t.status IN ('processing','in_progress') AND t.created_at < NOW() - INTERVAL '1 hour' ORDER BY t.created_at ASC LIMIT 20");
          var sRows = Array.isArray(stuck) ? stuck : (stuck.rows || []);
          var failed = await query("SELECT t.id, t.task, a.name FROM agent_tasks t LEFT JOIN blun_agents a ON a.id = t.agent_id WHERE t.status = 'failed' OR t.result LIKE '%RETRY%' OR t.result LIKE '%no code output%' ORDER BY t.created_at DESC LIMIT 20");
          var fRows = Array.isArray(failed) ? failed : (failed.rows || []);
          var parts = [];
          parts.push('Hanging (>1h processing): ' + sRows.length);
          sRows.slice(0,5).forEach(function(r){ parts.push('  #' + r.id + ' ' + (r.name||'?') + ' ' + Math.round(r.age_h) + 'h: ' + (r.task||'').substring(0,50)); });
          parts.push('Failed/Retry: ' + fRows.length);
          fRows.slice(0,5).forEach(function(r){ parts.push('  #' + r.id + ' ' + (r.name||'?') + ': ' + (r.task||'').substring(0,50)); });
          results.push(parts.join('\n'));
        } catch(be) { results.push('Blocker-Scan Fehler: ' + be.message); }
      } else if (cmd.tool === 'next_wave') {
        try {
          var created = [];
          for (var wi = 0; wi < cmd.tasks.length; wi++) {
            var ins = await query("INSERT INTO agent_tasks (task, status, agent_id, priority) VALUES ($1, 'pending', 2, 0) RETURNING id", [cmd.tasks[wi]]);
            var iRows = Array.isArray(ins) ? ins : (ins.rows || []);
            if (iRows.length) created.push('#' + iRows[0].id);
          }
          results.push('Next Wave: ' + created.length + ' Tasks erzeugt (' + created.join(', ') + '), Dieter Junior verteilt im naechsten Zyklus');
        } catch(ne) { results.push('Next-Wave Fehler: ' + ne.message); }
      } else if (cmd.tool === 'build_company') {
        // Proactive company builder: creates company + suggests agents
        var company = await callLocalAPI('POST', '/api/organisator/companies', { name: cmd.name, description: cmd.description });
        var companyId = company.id;
        results.push('Firma "' + cmd.name + '" erstellt (ID: ' + companyId + '). Beschreibung: ' + cmd.description);
        results.push('Erstelle jetzt passende Agents fuer diese Firma...');
        // The AI will then use CREATE_AGENT tools in the follow-up based on these results
      } else if (cmd.tool === 'git_remote') {
        try {
          var agentRow = await queryOne('SELECT company_id FROM blun_agents WHERE id = $1', [agentId]);
          var conns = await query('SELECT name, config FROM user_connections WHERE type = $1 AND company_id = $2', ['git', agentRow ? agentRow.company_id : null]);
          if (conns.length) {
            results.push('Git Remotes: ' + conns.map(function(c){ var cfg = typeof c.config === 'string' ? JSON.parse(c.config) : c.config; return c.name + ' = ' + (cfg.url || 'no url') + ' (SSH Key: ' + (cfg.ssh_key || 'default') + ')'; }).join(', '));
          } else {
            results.push('Keine Git-Repos in Verbindungen eingetragen.');
          }
        } catch(dbErr) { results.push('DB Error: ' + dbErr.message); }
      } else if (cmd.tool === 'deploy') {
        try {
          // Syntax check all key files before restart
          var cp2 = require('child_process');
          var check = await new Promise(function(res){ cp2.exec('node -c /root/blun/server.js && node -c /root/blun/src/agent-engine.js && node -c /root/blun/src/code-tools.js', {timeout:10000}, function(e,o,er){ res({err:e,out:(o||'')+(er||'')}); }); });
          if (check.err) {
            results.push('DEPLOY_ERR: Syntax check failed: ' + check.out);
          } else {
            var restart = await new Promise(function(res){ cp2.exec('pm2 restart blun', {timeout:15000}, function(e,o,er){ res((o||'')+(er||'')); }); });
            results.push('DEPLOY: pm2 restart done. ' + restart.substring(0,500));
          }
        } catch(e) { results.push('DEPLOY_ERR: ' + e.message); }
            } else if (cmd.tool === "bash" || cmd.tool === "file_read" || cmd.tool === "file_write" || cmd.tool === "list_files" || cmd.tool === "git_commit") {
        await codeTools.handleCmd(cmd, results, agentId);
      } else if (cmd.tool === 'create_agent') {
        var r = await callLocalAPI('POST', '/api/organisator/agents', {
          name: cmd.name,
          role: cmd.role,
          department: cmd.department || '',
          model: cmd.model,
          status: 'active',
          company_id: agent.company_id || 1,
          system_prompt: (cmd.role && (cmd.role.toLowerCase().indexOf('operator') !== -1 || cmd.role.toLowerCase().indexOf('ceo') !== -1 || cmd.role.toLowerCase().indexOf('organisator') !== -1)) ?
            'Du bist ' + cmd.name + ', Operator/CEO. KERNREGELN: 1) NUR Code-Tasks mit Dateipfad verteilen (dashboard/components/, src/routes/ etc). NIEMALS Analyse/Report/Konzept/Marketing. 2) Ergebnisse pruefen: git diff nach Task-Completion — keine Datei = nicht erfolgreich. 3) Skills aktiv nutzen. 4) Qualitaet vor Quantitaet. 5) VERBOTEN: agent-engine.js, code-tools.js, server.js, .env, package.json. 6) Systematisch arbeiten, kein Panik-Modus. 7) Syntax-Check vor Deploy. TASK-FORMAT: [TOOL:ASSIGN_TASK:id:VERB + WAS + Dateipfad]. REBALANCE: [TOOL:REBALANCE] oder [TOOL:REBALANCE:CAP] verteilt ueberlastete Agents um (Default CAP=12). TRIGGER: "verteil neu"=REBALANCE, "zerleg #id in X;Y;Z"=[TOOL:DECOMPOSE:id|sub1;sub2], "was ist wichtig"=[TOOL:REPRIORITIZE], "wo haengts"=[TOOL:BLOCKER_SCAN], "naechste welle: a;b;c"=[TOOL:NEXT_WAVE:a;b;c].' :
            'Du bist ' + cmd.name + ', ein ' + cmd.role + '. Du sprichst Deutsch, schreibst echten Code und hilfst proaktiv. Bei jeder Aufgabe MUSST du Dateien aendern (.js/.css/.html). Nutze alle zugewiesenen Skills aktiv.'
        });
        results.push('Agent erstellt: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'delete_agent') {
        var r = await callLocalAPI('DELETE', '/api/organisator/agents/' + cmd.id);
        results.push('Agent ' + cmd.id + ' geloescht: ' + (r.ok ? 'OK' : (r.error || JSON.stringify(r))));
      } else if (cmd.tool === 'reset_agent') {
        var r = await callLocalAPI('PUT', '/api/organisator/agents/' + cmd.id, { status: 'active' });
        results.push('Agent ' + cmd.id + ' resettet: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'agent_memory') {
        var r = await callLocalAPI('GET', '/api/organisator/agents/' + cmd.id + '/memory');
        var mem = r || {};
        var entries = Object.keys(mem).map(function(k) { return k + ': ' + mem[k]; }).join('\n');
        results.push('Memory Agent ' + cmd.id + ':\n' + (entries || 'leer'));
      } else if (cmd.tool === 'set_memory') {
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + cmd.id + '/memory', { key: cmd.key, content: cmd.value });
        results.push('Memory gesetzt: ' + cmd.key + ' fuer Agent ' + cmd.id);
      } else if (cmd.tool === 'chat_agent') {
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + cmd.id + '/chat', { message: cmd.message });
        results.push('Antwort von Agent ' + cmd.id + ': ' + (r.response || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'server_status') {
        var r = await callLocalAPI('GET', '/api/monitor/stats');
        results.push('Server: ' + JSON.stringify(r));
      }
    } catch(e) { results.push(cmd.tool + ' Fehler: ' + e.message); }
  }
  return results.join('\n\n');
}

module.exports.executeTools = executeTools;

module.exports.executeTools = executeTools;
