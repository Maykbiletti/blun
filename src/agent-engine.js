// BLUN - AI Organisator | MIT License
var codeTools = require("./code-tools");
var { callClaudeCLIStream } = require("./claude-stream");
/**
 * Agent Runtime Engine — heartbeat-driven agent loop with LLM integration.
 */

const { query, queryOne } = require("./db");
const { v4: uuid } = require("uuid");

const LLAMA_URL = process.env.LLAMA_URL || "http://127.0.0.1:8090";
// === Load Balancer: 4 llama-server instances ===
var modelsRouter = require("./routes/models");
function getLLMPools() {
  var pools = [];
  var running = modelsRouter.running || {};
  Object.keys(running).forEach(function(id) {
    if (running[id] && running[id].port) {
      pools.push({ port: running[id].port, name: id, busy: 0, max: 2 });
    }
  });
  var ext = modelsRouter.externalRunning || {};
  Object.keys(ext).forEach(function(filename) {
    if (ext[filename] && ext[filename].port) {
      pools.push({ port: ext[filename].port, name: filename, busy: 0, max: 2 });
    }
  });
  if (pools.length === 0) {
    pools.push({ port: 8091, name: "gemma-4-31b", busy: 0, max: 2 });
  }
  return pools;
}
function pickPool() {
  var pools = getLLMPools();
  var best = pools[0];
  for (var i = 1; i < pools.length; i++) {
    if (pools[i].busy < best.busy) best = pools[i];
  }
  return best;
}
// === End Load Balancer ===

const crypto = require("crypto");
const ENC_KEY = process.env.BLUN_ENCRYPTION_KEY || "blun-dev-encryption-key-32chars!";

function decryptKey(data) {
  var parts = data.split(":");
  var iv = Buffer.from(parts[0], "hex");
  var tag = Buffer.from(parts[1], "hex");
  var encrypted = parts[2];
  var decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "utf8").slice(0, 32), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}


// ===== RATE LIMIT WATCHER (Proactive) =====
// Tracks remaining quota per provider, pauses BEFORE hitting 429
const agentSessions = {};  // Track CLI session IDs per agent for --resume

const rateLimitState = {
  anthropic: { blocked: false, retryAfter: 0, remaining: null, limit: null, resetAt: 0, usage: 0, windowStart: Date.now() },
  openai: { blocked: false, retryAfter: 0, remaining: null, limit: null, resetAt: 0, usage: 0, windowStart: Date.now() },
  google: { blocked: false, retryAfter: 0, remaining: null, limit: null, resetAt: 0, usage: 0, windowStart: Date.now() },
  local: { blocked: false, retryAfter: 0, remaining: null, limit: null, resetAt: 0, usage: 0, windowStart: Date.now() }
};
const PAUSE_THRESHOLD = 0.2; // Pause when only 20% of quota remaining

function getProvider(model) {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) return "openai";
  if (model.includes("gemini") || model.includes("gemma")) return "google";
  return "local";
}

function isRateLimited(provider) {
  var state = rateLimitState[provider];
  if (!state) return false;

  // Hard block (from 429)
  if (state.blocked) {
    if (Date.now() > state.retryAfter) {
      state.blocked = false;
      console.log("[rate-limit] " + provider + " cooldown ended, resuming requests");
      return false;
    }
    return true;
  }

  // Proactive pause: if we know the quota and it's low
  if (state.remaining !== null && state.limit !== null && state.limit > 0) {
    var pct = state.remaining / state.limit;
    if (pct <= PAUSE_THRESHOLD && state.remaining < 5) {
      var resetIn = Math.max(0, state.resetAt - Date.now());
      if (resetIn > 0) {
        console.log("[rate-limit] " + provider + " Mittagspause! Nur noch " + state.remaining + "/" + state.limit + " Requests (" + Math.round(pct*100) + "%). Pause " + Math.round(resetIn/1000) + "s bis Reset.");
        state.blocked = true;
        state.retryAfter = state.resetAt;
        return true;
      }
    }
  }

  return false;
}

// Get rate limit status for dashboard API
function getRateLimitStatus() {
  var status = {};
  var providers = ["anthropic", "openai", "google", "local"];
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i];
    var s = rateLimitState[p];
    var pct = (s.remaining !== null && s.limit) ? Math.round((s.remaining / s.limit) * 100) : null;
    var signal = "green";
    if (s.blocked) signal = "red";
    else if (pct !== null && pct <= 40) signal = "yellow";
    else if (pct !== null && pct <= 20) signal = "red";
    status[p] = {
      signal: signal,
      remaining: s.remaining,
      limit: s.limit,
      blocked: s.blocked,
      retryAfter: s.blocked ? Math.max(0, Math.round((s.retryAfter - Date.now()) / 1000)) : 0,
      percent: pct
    };
  }
  return status;
}

function setRateLimited(provider, retryAfterSec) {
  var waitMs = (retryAfterSec || 60) * 1000;
  rateLimitState[provider] = { blocked: true, retryAfter: Date.now() + waitMs };
  console.log("[rate-limit] " + provider + " hit 429 — pausing for " + (retryAfterSec || 60) + "s");
}

async function fetchWithRateLimit(url, options, provider) {
  // Check if provider is currently blocked
  if (isRateLimited(provider)) {
    var waitSec = Math.ceil((rateLimitState[provider].retryAfter - Date.now()) / 1000);
    console.log("[rate-limit] " + provider + " Mittagspause laeuft noch " + waitSec + "s...");
    await new Promise(function(r) { setTimeout(r, waitSec * 1000 + 500); });
    // Reset after waiting
    rateLimitState[provider].blocked = false;
  }

  var resp = await fetch(url, options);

  // Read rate limit headers from response
  var state = rateLimitState[provider];
  var rlRemaining = resp.headers.get("x-ratelimit-remaining") || resp.headers.get("x-ratelimit-limit-requests-remaining");
  var rlLimit = resp.headers.get("x-ratelimit-limit") || resp.headers.get("x-ratelimit-limit-requests");
  var rlReset = resp.headers.get("x-ratelimit-reset") || resp.headers.get("x-ratelimit-reset-requests");
  // Anthropic specific
  if (!rlRemaining) rlRemaining = resp.headers.get("anthropic-ratelimit-requests-remaining");
  if (!rlLimit) rlLimit = resp.headers.get("anthropic-ratelimit-requests-limit");
  if (!rlReset) rlReset = resp.headers.get("anthropic-ratelimit-requests-reset");

  if (rlRemaining !== null) state.remaining = parseInt(rlRemaining);
  if (rlLimit !== null) state.limit = parseInt(rlLimit);
  if (rlReset) {
    var resetDate = new Date(rlReset);
    if (!isNaN(resetDate.getTime())) state.resetAt = resetDate.getTime();
    else {
      // Could be seconds
      var secs = parseInt(rlReset);
      if (!isNaN(secs)) state.resetAt = Date.now() + secs * 1000;
    }
  }
  state.usage++;

  if (resp.status === 429) {
    var retryHeader = resp.headers.get("retry-after");
    var waitTime = retryHeader ? parseInt(retryHeader) : 60;
    if (isNaN(waitTime) || waitTime < 5) waitTime = 60;
    setRateLimited(provider, waitTime);

    console.log("[rate-limit] " + provider + " 429! Mittagspause " + waitTime + "s...");
    await new Promise(function(r) { setTimeout(r, waitTime * 1000); });
    resp = await fetch(url, options);

    if (resp.status === 429) {
      setRateLimited(provider, waitTime * 2);
      throw new Error("Rate limited by " + provider + " — Mittagspause " + (waitTime * 2) + "s.");
    }
  }

  return resp;
}

// ===== END RATE LIMIT WATCHER =====

// Active agent loops: agentId -> { timer, running }
const activeAgents = new Map();

// ===== CLI SUBPROCESS ADAPTERS =====
var child_process = require("child_process");

async function callCLI(cliPath, args, env, input, timeoutMs) {
  return new Promise(function(resolve, reject) {
    // Sandbox: only pass safe env vars to CLI subprocesses — no DB creds, encryption keys, etc.
    var safeBaseEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME || "/tmp",
      LANG: process.env.LANG || "en_US.UTF-8",
      NODE_ENV: process.env.NODE_ENV || "production",
    };
    var proc = child_process.spawn(cliPath, args, {
      env: Object.assign({}, safeBaseEnv, env),
      cwd: "/tmp",
      stdio: ["pipe", "pipe", "pipe"]
    });
    var out = "", err = "";
    proc.stdout.on("data", function(d){ out += d.toString(); });
    proc.stderr.on("data", function(d){ err += d.toString(); });
    proc.on("close", function(code) {
      if (out.trim()) resolve(out.trim());
      else reject(new Error("CLI error: " + (err||"no output") + " (exit " + code + ")"));
    });
    var timer = setTimeout(function(){ proc.kill(); reject(new Error("CLI timeout")); }, timeoutMs || 90000);
    proc.on("close", function(){ clearTimeout(timer); });
    if (input) { proc.stdin.write(input); } proc.stdin.end();
  });
}


async function callCodexCLI(messages, model) {
  // Build prompt from messages - pass via stdin for long content
  var systemMsg = messages.find(function(m){return m.role==="system";});
  var userMsg = messages.filter(function(m){return m.role!=="system";}).map(function(m){return m.role+": "+m.content;}).join("\n\n");
  // For Codex exec: keep prompt focused and short - extract key identity from system
  // Long personality texts confuse codex exec (task mode, not chat mode)
  var sysContent = systemMsg ? systemMsg.content : "Du bist ein hilfreicher Agent.";
  // Keep only first 400 chars of system content for Codex (key identity info)
  var sysShort = sysContent.substring(0, 400);
  var prompt = sysShort + "\n\nUser: " + userMsg + "\nAntworte natuerlich als diese Persona (1-3 Saetze):";

  var result = await callCLI("codex", ["exec", "--skip-git-repo-check", prompt], {}, null, 90000);
  // Extract just the response (codex adds session info, strip it)
  var lines = result.split("\n");
  var responseStart = false;
  var responseLines = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] === "codex") { responseStart = true; continue; }
    if (responseStart && lines[i].startsWith("tokens used")) break;
    if (responseStart) responseLines.push(lines[i]);
  }
  var response = responseLines.join("\n").trim() || result.split("\n").pop().trim();
  return { content: response, tokens: 5000, cost: 0 }; // Codex uses ChatGPT Pro subscription
}

async function callClaudeCLI(messages, apiKey, model, agentId) {
  var systemMsg = messages.find(function(m){return m.role==="system";});
  var userMsg = messages.filter(function(m){return m.role!=="system";}).map(function(m){return m.role+": "+m.content;}).join("\n\n");
  var prompt = (systemMsg ? "Context: " + systemMsg.content + "\n\n" : "") + userMsg;
  var env = apiKey ? { ANTHROPIC_API_KEY: apiKey } : {};
  var args = ["--print", "-"];
  if (model) args.push("--model", model);
  // Resume existing session for this agent if available
  var sessionKey = "agent_" + (agentId || "default");
  if (agentSessions[sessionKey]) {
    args.push("--resume", agentSessions[sessionKey]);
  }
  var result = await callCLI("claude", args, env, prompt, 60000);
  // Parse stream-json: extract session_id and final text
  var content = "";
  var lines = result.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    try {
      var evt = JSON.parse(line);
      if (evt.type === "system" && evt.session_id) {
        agentSessions[sessionKey] = evt.session_id;
      }
      if (evt.type === "assistant" && evt.message && evt.message.content) {
        for (var j = 0; j < evt.message.content.length; j++) {
          if (evt.message.content[j].type === "text") {
            content = evt.message.content[j].text;
          }
        }
      }
      if (evt.type === "result" && evt.result) {
        content = evt.result;
      }
    } catch(e) {
      // Not JSON, might be raw text
      if (!line.startsWith("{")) content += line + "\n";
    }
  }
  return { content: (content || result).trim(), tokens: 3000, cost: 0 };
}


async function callLLM(model, messages, agentId) {
  var isLocal = model.startsWith("local:") || model.includes("llama") || model.includes("tiny") || model.includes("mistral") || model.includes("phi") || model.includes("deepseek") || model.includes("gemma") || model.includes("qwen");
  if (model.startsWith("local:")) model = model.replace("local:", "");

  var url, headers, body;

  // Route CLI-based models: gpt-* via Codex CLI, claude-* via Claude CLI
  // Haiku: skip CLI, use direct API (much faster)
  if (model.startsWith("claude") && !model.includes("api:")) {
    try { return await callClaudeCLI(messages, null, model, agentId); } catch(e) {
      console.error("[claude-cli] " + e.message + " — Fallback auf Codex CLI");
      try { return await callCodexCLI(messages, 'gpt-4o'); } catch(e2) {
        console.error("[codex-cli] Fallback auch fehlgeschlagen: " + e2.message);
        return { content: "Alle Modelle im Rate Limit. Bitte spaeter nochmal.", tokens: 0, cost: 0 };
      }
    }
  }
  var modelLow = model.toLowerCase();
  if (model.startsWith("codex:") || modelLow.startsWith("gpt-") || model.toUpperCase().startsWith("GPT-") || modelLow.startsWith("o1") || modelLow.startsWith("o3") || modelLow.startsWith("o4")) {
    var cleanModel = model.replace("codex:", "");
    try { return await callCodexCLI(messages, cleanModel); } catch(e) { console.error("[codex-cli]", e.message); return { content: "Fehler: " + e.message, tokens: 0, cost: 0 }; }
  }
  if (isLocal) {
    var _pool = pickPool(); _pool.busy++; url = "http://127.0.0.1:" + _pool.port + "/v1/chat/completions"; var _releasePool = function() { _pool.busy = Math.max(0, _pool.busy - 1); };
    headers = { "Content-Type": "application/json" };
    body = { model: model, messages: messages, max_tokens: 200, temperature: 0.7 };
  } else {
    var provider = model.startsWith("claude") ? "anthropic" : (model.startsWith("gpt") || model.startsWith("o3") || model.startsWith("o1")) ? "openai" : "google";
    var conn = await queryOne(
      "SELECT * FROM ai_connections WHERE provider = $1 AND status = 'active' LIMIT 1",
      [provider]
    );
    if (!conn) throw new Error("No active connection for model: " + model);

    var apiKey;
    try { apiKey = decryptKey(conn.api_key_encrypted); } catch(e) { throw new Error("Failed to decrypt API key: " + e.message); }
    // Check if this is an OAuth token (JSON with access_token)
    try { var oauthData = JSON.parse(apiKey); if (oauthData.access_token) { apiKey = oauthData.access_token; } } catch(e) { /* plain API key, use as-is */ }
    var config = { api_key: apiKey };

    if (model.startsWith("claude")) {
      url = "https://api.anthropic.com/v1/messages";
      // Always try CLI first for Claude models
      try { return await callClaudeCLI(messages, config.api_key); } catch(e) { console.error("[claude-cli]", e.message); }
      // Fallback to REST API — detect OAuth token vs API key
      if (config.api_key && config.api_key.length > 80) {
        // OAuth token: use Authorization Bearer
        headers = { "Content-Type": "application/json", "Authorization": "Bearer " + config.api_key, "anthropic-version": "2023-06-01" };
      } else {
        // Regular API key: use x-api-key
        headers = { "Content-Type": "application/json", "x-api-key": config.api_key, "anthropic-version": "2023-06-01" };
      }
      var sys = messages.find(function(m) { return m.role === "system"; });
      var msgs = messages.filter(function(m) { return m.role !== "system"; });
      body = { model: model, messages: msgs, max_tokens: 2048 };
      if (sys) body.system = sys.content;
    } else if (model.startsWith("gpt")) {
      url = "https://api.openai.com/v1/chat/completions";
      headers = { "Content-Type": "application/json", "Authorization": "Bearer " + config.api_key };
      body = { model: model, messages: messages, max_tokens: 2048 };
    } else {
      url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + config.api_key;
      headers = { "Content-Type": "application/json" };
      var sysMsg = messages.find(function(m) { return m.role === "system"; });
      body = {
        contents: messages.filter(function(m) { return m.role !== "system"; }).map(function(m) { return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }; }),
        systemInstruction: { parts: [{ text: sysMsg ? sysMsg.content : "" }] }
      };
    }
  }

  var _provider = isLocal ? "local" : getProvider(model); var _ctrl = new AbortController(); var _fetchTimeout = setTimeout(function(){ _ctrl.abort(); }, 120000); var resp; try { resp = await fetchWithRateLimit(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: _ctrl.signal }, _provider); } finally { clearTimeout(_fetchTimeout); }
  var data = await resp.json();
  if (typeof _releasePool === "function") _releasePool();

  var content, tokens = 0;
  if (isLocal || model.startsWith("gpt")) {
    content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || (data.error && data.error.message) || "No response";
    tokens = ((data.usage && data.usage.prompt_tokens) || 0) + ((data.usage && data.usage.completion_tokens) || 0);
  } else if (model.startsWith("claude")) {
    content = (data.content && data.content[0] && data.content[0].text) || (data.error && data.error.message) || "No response";
    tokens = ((data.usage && data.usage.input_tokens) || 0) + ((data.usage && data.usage.output_tokens) || 0);
  } else {
    content = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "No response";
    tokens = (data.usageMetadata && data.usageMetadata.totalTokenCount) || 0;
  }

  var cost = 0;
  if (!isLocal) {
    if (model.startsWith("claude")) cost = tokens * 0.000003;
    else if (model.startsWith("gpt")) cost = tokens * 0.000005;
    else cost = tokens * 0.000001;
  }

  return { content: content, tokens: tokens, cost: cost };
}

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
  // Priority: identity, rules, vision always loaded
  var priority = ["identity", "rules", "security", "rename", "vision"];
  var selected = [];
  var totalChars = 0;
  var msg = (userMessage || "").toLowerCase();
  // First pass: priority keys
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
  // Second pass: keyword match from user message
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
  // Third pass: most recent memories to fill remaining budget
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

async function saveAgentMemory(agentId, key, value) {
  await query(
    "INSERT INTO agent_memory (agent_id, key, content, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()",
    [agentId, key, value]
  );
}

async function heartbeat(agentId) {
  var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent || agent.status === "idle") {
    stopAgent(agentId);
    return;
  }

  var pendingTask = await queryOne(
    "SELECT * FROM agent_tasks WHERE agent_id = $1 AND status IN ('pending', 'in_progress') ORDER BY created_at ASC LIMIT 1",
    [agentId]
  );

  var status = "active";
  var tokens = 0, cost = 0;

  if (pendingTask) {
    status = "working";
    await query("UPDATE blun_agents SET status = $1, last_heartbeat = NOW() WHERE id = $2", ["working", agentId]);
    await query("UPDATE agent_tasks SET status = $1 WHERE id = $2", ["processing", pendingTask.id]);

    try {
      // Load identity
      var identityRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'IDENTITY'", [agentId]);
      if (!identityRow) {
        var identityContent = "# " + (agent.name || "Agent") + "\n" +
          "- Rolle: " + (agent.role || "KI-Agent") + "\n" +
          (agent.department ? "- Abteilung: " + agent.department + "\n" : "") +
          "- Team: BLUN.ai Agent-Team\n" +
          "- Sprache: Deutsch\n" +
          "Ich bin " + (agent.name || "ein Agent") + " und Teil des BLUN Agent-Teams.";
        await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, 'IDENTITY', $2) ON CONFLICT (agent_id, key) DO NOTHING", [agentId, identityContent]);
        identityRow = { content: identityContent };
      }
      // Load skills
      var agentSkills = await query(
        "SELECT s.name, s.code, s.description FROM skills s JOIN agent_skills as2 ON as2.skill_id = s.id WHERE as2.agent_id = $1 AND s.safe = true",
        [agentId]
      );
      var nl = String.fromCharCode(10);
      var skillStr = agentSkills.length ? nl+nl+"DEINE SKILLS:"+nl + agentSkills.map(function(s){ return "- " + s.name + ": " + (s.code || s.description); }).join(nl) : "";
      // Load memory
      var memBudget = (agent.model && (agent.model.startsWith("local:") || agent.model.includes("gemma") || agent.model.includes("llama"))) ? 500 : 8000;
      var memStr = await loadSmartMemory(agentId, pendingTask.task, memBudget);

      var messages = [
        { role: "system", content: (identityRow ? identityRow.content + "\n\n" : "") + (agent.system_prompt || "Du bist ein hilfreicher Agent.") + skillStr + memStr },
        { role: "user", content: "Task: " + pendingTask.task }
      ];

      var result = await callLLM(agent.model, messages, agentId);
      tokens = result.tokens;
      cost = result.cost;

      // Execute any tools in the response (CHAT_AGENT, FILE_READ, etc.)
      var toolResult = await executeTools(agentId, pendingTask.task, result.content);
      var finalContent = result.content;
      if (toolResult) {
        finalContent += String.fromCharCode(10) + String.fromCharCode(10) + "Tool-Ergebnisse:" + String.fromCharCode(10) + toolResult;
      }
      await query("UPDATE agent_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3", ["completed", finalContent, pendingTask.id]);
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "user", pendingTask.task]);
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", finalContent]);
  // Auto-memory: save last activity
  try {
    var today = new Date().toISOString().substring(0,10);
    var summary = result.content.substring(0,300).replace(/\n/g,' ');
    await saveAgentMemory(agentId, 'zuletzt_' + today, 'Chat: ' + (typeof message !== 'undefined' && message ? message : (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '')).substring(0,80) + ' | Antwort: ' + summary);
  } catch(me) { console.error('[auto-memory]', me.message); }

      status = "active";
    } catch (err) {
      console.error("[agent-engine] Task error for " + agentId + ":", err.message);
      await query("UPDATE agent_tasks SET status = $1, result = $2 WHERE id = $3", ["error", err.message, pendingTask.id]);
      status = "error";
    }
  }

  await query("UPDATE blun_agents SET status = $1, last_heartbeat = NOW() WHERE id = $2", [status, agentId]);
  await query("INSERT INTO agent_heartbeats (agent_id, status, model, tokens_used, cost) VALUES ($1, $2, $3, $4, $5)", [agentId, status, agent.model, tokens, cost]);
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

async function chatWithAgent(agentId, message) {
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
  var skillStr = agentSkills.length ? nl+nl+"DEINE SKILLS:"+nl + agentSkills.map(function(s){ return "- " + s.name + ": " + (s.code || s.description); }).join(nl) : "";
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

  await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "user", message]);
  await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", result.content]);
  // Auto-memory: save last activity
  try {
    var today = new Date().toISOString().substring(0,10);
    var summary = result.content.substring(0,300).replace(/\n/g,' ');
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
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", fu.content]);
      return { response: fu.content, tokens: result.tokens, cost: result.cost };
    }
  } catch(te) { console.error("[tools]", te.message); }
  return { response: result.content, tokens: result.tokens, cost: result.cost };
}



// === AUTO-DREAM: Memory Consolidation ===
// Runs periodically for each agent — consolidates, deduplicates, cleans old memories
var dreamIntervals = {};

async function dreamCycle(agentId) {
  try {
    var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
    if (!agent || agent.status === 'idle') return;

    var memories = await query("SELECT key, content, updated_at FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [agentId]);
    if (memories.length < 5) return; // not enough to consolidate

    // Find old daily logs (zuletzt_*) older than 3 days
    var now = Date.now();
    var threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    var oldDailyKeys = [];
    for (var i = 0; i < memories.length; i++) {
      if (memories[i].key.startsWith('zuletzt_') && memories[i].updated_at) {
        var age = now - new Date(memories[i].updated_at).getTime();
        if (age > threeDaysMs) oldDailyKeys.push(memories[i]);
      }
    }

    // Consolidate old daily logs into a summary
    if (oldDailyKeys.length >= 3) {
      var summaryParts = oldDailyKeys.map(function(m) { return m.key + ': ' + m.content.substring(0,150); });
      var nl = String.fromCharCode(10); var dreamPrompt = 'Fasse diese ' + oldDailyKeys.length + ' Tageseintraege in EINEM kurzen Absatz zusammen (max 200 Woerter). Nur die wichtigsten Fakten und Entscheidungen:' + nl + nl + summaryParts.join(nl);

      var dreamResult = await callLLM(agent.model || 'claude-haiku-4-5-20251001', [
        { role: 'user', content: dreamPrompt }
      ], agentId);

      if (dreamResult && dreamResult.content) {
        var weekKey = 'woche_' + new Date().toISOString().substring(0,10);
        await saveAgentMemory(agentId, weekKey, dreamResult.content.substring(0,500));

        // Delete old daily entries
        for (var j = 0; j < oldDailyKeys.length; j++) {
          await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, oldDailyKeys[j].key]);
        }
        console.log('[dream] ' + agent.name + ': consolidated ' + oldDailyKeys.length + ' daily logs into ' + weekKey);
      }
    }

    // Remove duplicate memories (same content, different keys)
    var seen = {};
    var dupes = [];
    for (var k = 0; k < memories.length; k++) {
      var hash = memories[k].content.substring(0,100).toLowerCase().trim();
      if (seen[hash]) {
        dupes.push(memories[k].key);
      } else {
        seen[hash] = true;
      }
    }
    if (dupes.length > 0) {
      for (var d = 0; d < dupes.length; d++) {
        await query("DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, dupes[d]]);
      }
      console.log('[dream] ' + agent.name + ': removed ' + dupes.length + ' duplicate memories');
    }

  } catch(err) {
    console.error('[dream] ' + agentId + ' error:', err.message);
  }
}

function startDreamCycle(agentId) {
  if (dreamIntervals[agentId]) return;
  // Run every 6 hours
  dreamIntervals[agentId] = setInterval(function() { dreamCycle(agentId); }, 6 * 60 * 60 * 1000);
  // First dream after 30 minutes
  setTimeout(function() { dreamCycle(agentId); }, 30 * 60 * 1000);
}

function stopDreamCycle(agentId) {
  if (dreamIntervals[agentId]) {
    clearInterval(dreamIntervals[agentId]);
    delete dreamIntervals[agentId];
  }
}


module.exports = { startAgent, stopAgent, getActiveAgents, chatWithAgent, callLLM, loadAgentMemory, saveAgentMemory, activeAgents, getRateLimitStatus, dreamCycle, startDreamCycle, stopDreamCycle };

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
          system_prompt: 'Du bist ' + cmd.name + ', ein ' + cmd.role + '. Du sprichst Deutsch und hilfst proaktiv.'
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
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + chatId + '/chat', { message: cmd.message });
        results.push('Antwort von ' + cmd.ref + ': ' + (r.response || r.error || JSON.stringify(r)));
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
          var check = await new Promise(function(res){ cp2.exec('node -c /root/blun/src/server.js && node -c /root/blun/src/agent-engine.js && node -c /root/blun/src/code-tools.js', {timeout:10000}, function(e,o,er){ res({err:e,out:(o||'')+(er||'')}); }); });
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
          system_prompt: 'Du bist ' + cmd.name + ', ein ' + cmd.role + '. Du sprichst Deutsch und hilfst proaktiv.'
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
