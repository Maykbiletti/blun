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

// === CLI CONCURRENCY LIMITER ===
var cliConcurrency = { active: 0, max: 3, queued: 0, totalToday: 0, lastReset: Date.now(), paused: false, pauseUntil: 0 };

async function acquireCliSlot(agentName) {
  // Reset daily counter
  if (Date.now() - cliConcurrency.lastReset > 3600000) {
    cliConcurrency.totalToday = 0;
    cliConcurrency.lastReset = Date.now();
  }
  // Check if paused (ratelimit hit)
  if (cliConcurrency.paused && Date.now() < cliConcurrency.pauseUntil) {
    var waitSec = Math.ceil((cliConcurrency.pauseUntil - Date.now()) / 1000);
    console.log("[ratelimit] CLI paused, " + agentName + " wartet " + waitSec + "s...");
    await new Promise(function(r) { setTimeout(r, waitSec * 1000); });
    cliConcurrency.paused = false;
  }
  // Wait for slot
  while (cliConcurrency.active >= cliConcurrency.max) {
    cliConcurrency.queued++;
    console.log("[ratelimit] " + agentName + " wartet auf CLI-Slot (" + cliConcurrency.active + "/" + cliConcurrency.max + " aktiv, " + cliConcurrency.queued + " queued)");
    await new Promise(function(r) { setTimeout(r, 5000); });
    cliConcurrency.queued--;
  }
  cliConcurrency.active++;
  cliConcurrency.totalToday++;
  console.log("[ratelimit] " + agentName + " got CLI slot (" + cliConcurrency.active + "/" + cliConcurrency.max + " aktiv)");
}

function releaseCliSlot(agentName) {
  cliConcurrency.active = Math.max(0, cliConcurrency.active - 1);
  console.log("[ratelimit] " + agentName + " released CLI slot (" + cliConcurrency.active + "/" + cliConcurrency.max + " aktiv)");
}

function pauseCli(seconds) {
  cliConcurrency.paused = true;
  cliConcurrency.pauseUntil = Date.now() + seconds * 1000;
  console.log("[ratelimit] CLI paused for " + seconds + "s (Ratelimit-Schutz)");
}

function getCliRateLimitStatus() {
  return { active: cliConcurrency.active, max: cliConcurrency.max, queued: cliConcurrency.queued, totalHour: cliConcurrency.totalToday, paused: cliConcurrency.paused };
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
    // Get API key from ai_connections
    var cliApiKey = null;
    var isOAuthToken = false;
    try {
      var cliConn = await queryOne("SELECT api_key_encrypted FROM ai_connections WHERE provider = 'anthropic' AND status = 'active' LIMIT 1", []);
      if (cliConn) {
        cliApiKey = decryptKey(cliConn.api_key_encrypted);
        try { var od = JSON.parse(cliApiKey); if (od.accessToken || od.access_token) { cliApiKey = od.accessToken || od.access_token; isOAuthToken = true; } } catch(e) {}
      }
    } catch(e) {}
    // OAuth tokens: skip CLI, use REST API directly
    if (cliApiKey && isOAuthToken) {
      console.log("[callLLM] OAuth token, using REST API for " + model);
      var sysM = messages.find(function(m) { return m.role === "system"; });
      var chatM = messages.filter(function(m) { return m.role !== "system"; });
      var rb = { model: model, messages: chatM, max_tokens: 4096 };
      if (sysM) rb.system = sysM.content;
      var rh = { "Content-Type": "application/json", "Authorization": "Bearer " + cliApiKey, "anthropic-version": "2023-06-01" };
      try {
        var fetch = require("node-fetch");
        var resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: rh, body: JSON.stringify(rb), timeout: 120000 });
        var data = await resp.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        var text = (data.content || []).map(function(c) { return c.text || ""; }).join("");
        var tu = (data.usage ? (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) : 0);
        return { content: text, tokens: tu, cost: tu * 0.000003 };
      } catch(re) {
        console.error("[claude-rest] " + re.message + " -- Fallback auf Codex CLI");
        try { return await callCodexCLI(messages, 'gpt-4o'); } catch(e2) {
          return { content: "API Fehler: " + re.message, tokens: 0, cost: 0 };
        }
      }
    }
    // Plain API key: try CLI
    if (cliApiKey) {
      try { return await callClaudeCLI(messages, cliApiKey, model, agentId); } catch(e) {
        console.error("[claude-cli] " + e.message + " -- Fallback auf Codex CLI");
      }
    }
    try { return await callCodexCLI(messages, 'gpt-4o'); } catch(e2) {
      console.error("[codex-cli] Fallback fehlgeschlagen: " + e2.message);
      return { content: "Alle Modelle im Rate Limit.", tokens: 0, cost: 0 };
    }
  }
  var modelLow = model.toLowerCase();
  if (model.startsWith("codex:") || modelLow.startsWith("gpt-") || model.toUpperCase().startsWith("GPT-") || modelLow.startsWith("o1") || modelLow.startsWith("o3") || modelLow.startsWith("o4")) {
    var cleanModel = model.replace("codex:", "");
    // Try REST API first with OAuth token from DB
    try {
      var oaiConn = await queryOne("SELECT api_key_encrypted FROM ai_connections WHERE provider = 'openai' AND status = 'active' LIMIT 1", []);
      if (oaiConn) {
        var oaiKey = decryptKey(oaiConn.api_key_encrypted);
        try { var oj = JSON.parse(oaiKey); if (oj.access_token || oj.accessToken) oaiKey = oj.access_token || oj.accessToken; } catch(e) {}
        if (oaiKey && oaiKey.length > 20) {
          console.log("[callLLM] OpenAI REST API for " + cleanModel);
          var fetch = require("node-fetch");
          var oaiBody = { model: cleanModel, messages: messages, max_tokens: 4096 };
          var oaiResp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + oaiKey }, body: JSON.stringify(oaiBody), timeout: 120000 });
          var oaiData = await oaiResp.json();
          if (oaiData.error) throw new Error(oaiData.error.message || JSON.stringify(oaiData.error));
          var oaiText = (oaiData.choices && oaiData.choices[0] && oaiData.choices[0].message) ? oaiData.choices[0].message.content : "";
          var oaiTok = oaiData.usage ? (oaiData.usage.total_tokens || 0) : 0;
          return { content: oaiText, tokens: oaiTok, cost: oaiTok * 0.000005 };
        }
      }
    } catch(oe) { console.error("[openai-rest] " + oe.message + " -- fallback to Codex CLI"); }
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
    try { var oauthData = JSON.parse(apiKey); if (oauthData.accessToken || oauthData.access_token) { apiKey = oauthData.accessToken || oauthData.access_token; } } catch(e) { /* plain API key, use as-is */ }
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
  var priority = ["identity", "personality", "rules", "security", "rename", "vision", "skill_"];
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
  // Second pass: fuzzy search via pg_trgm (semantic-like matching)
  if (msg.length > 5) {
    try {
      var fuzzyRows = await query(
        "SELECT key, content as value, updated_at, similarity(content, $2) as sim FROM agent_memory WHERE agent_id = $1 AND similarity(content, $2) > 0.05 ORDER BY sim DESC LIMIT 10",
        [agentId, userMessage.substring(0, 200)]
      );
      for (var fi = 0; fi < fuzzyRows.length; fi++) {
        if (selected.indexOf(fuzzyRows[fi]) !== -1) continue;
        if (totalChars >= maxChars) break;
        // Check not already selected by key
        var alreadyIn = false;
        for (var si = 0; si < selected.length; si++) {
          if (selected[si].key === fuzzyRows[fi].key) { alreadyIn = true; break; }
        }
        if (!alreadyIn && totalChars + fuzzyRows[fi].value.length < maxChars) {
          selected.push(fuzzyRows[fi]);
          totalChars += fuzzyRows[fi].value.length;
        }
      }
    } catch(fzErr) { /* fallback to keyword match if pg_trgm fails */ }
  }
  // Fallback: keyword match from user message
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

  // === OPERATOR AUTO-DISPATCH: If operator has no tasks, assign to idle agents ===
  if (!pendingTask && agent.company_id) {
    try {
      var isOperator = await queryOne("SELECT id FROM blun_agents WHERE company_id = $1 ORDER BY id LIMIT 1", [agent.company_id]);
      if (isOperator && isOperator.id === agentId) {
        var idleAgents = await query(
          "SELECT a.id, a.name, a.role FROM blun_agents a WHERE a.company_id = $1 AND a.id != $2 AND a.status = 'active' AND NOT EXISTS (SELECT 1 FROM agent_tasks t WHERE t.agent_id = a.id AND t.status IN ('pending','in_progress','processing')) LIMIT 5",
          [agent.company_id, agentId]
        );
        if (idleAgents.length > 0) {
          var agentList = idleAgents.map(function(a) { return a.name + " (ID " + a.id + ", " + (a.role||"no role") + ")"; }).join(", ");
          var dispatchPrompt = "Agents brauchen CODE-Tasks: " + agentList + "." + "\nJeder Task MUSS einen Dateipfad (.js/.css/.html) enthalten!" + "\nBEISPIELE:" + "\n[TOOL:ASSIGN_TASK:5:Erstelle dashboard/components/notifications.js — Toast-Notification System mit show/hide/auto-dismiss]" + "\n[TOOL:ASSIGN_TASK:8:Fix src/routes/v1/auth.js Zeile 42 — bcrypt.compare fehlt bei Login-Validierung]" + "\n[TOOL:ASSIGN_TASK:12:Baue dashboard/css/dark-theme.css — CSS Custom Properties fuer Dark Mode]" + "\nVERBOTEN: Analyse, Report, Konzept, Planung, Recherche, Dokumentation" + "\nGESCHUETZT: agent-engine.js, code-tools.js, server.js, .env, package.json" + "\nStruktur: src/routes/ (API), dashboard/ (Frontend+Components), src/middleware/, public/" + "\nNUR [TOOL:ASSIGN_TASK:id:task] Zeilen!";
          var identityRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'identity'", [agentId]);
          var sysPrompt = (identityRow ? identityRow.content : "Du bist der Operator.") + "\nDu verteilst autonom Tasks an dein Team.";
          var dispatchResult = await callLLM(agent.model || "claude-sonnet", [{ role: "system", content: sysPrompt }, { role: "user", content: dispatchPrompt }], agentId);
          if (dispatchResult && dispatchResult.content) {
            var dLines = dispatchResult.content.split("\n");
            for (var di = 0; di < dLines.length; di++) {
              var dm = dLines[di].match(/\[TOOL:ASSIGN_TASK:(\d+):([^\]]+)\]/i);
              if (dm) {
                var taskDesc = dm[2].trim();
                var tdl = taskDesc.toLowerCase();
                // Quality Gate: MUST have file path AND code verb, checked BEFORE insert
                var hasFile = /\.(js|css|html|json|ts|jsx|tsx)/.test(tdl) || tdl.indexOf("src/") !== -1 || tdl.indexOf("dashboard/") !== -1 || tdl.indexOf("routes/") !== -1 || tdl.indexOf("components/") !== -1;
                var hasVerb = tdl.indexOf("erstell") !== -1 || tdl.indexOf("bau") !== -1 || tdl.indexOf("fix") !== -1 || tdl.indexOf("implement") !== -1 || tdl.indexOf("refactor") !== -1 || tdl.indexOf("schreib") !== -1 || tdl.indexOf("add") !== -1 || tdl.indexOf("code") !== -1 || tdl.indexOf("optimier") !== -1;
                var banned = tdl.indexOf("analys") !== -1 || tdl.indexOf("report") !== -1 || tdl.indexOf("pipeline") !== -1 || tdl.indexOf("strategi") !== -1 || tdl.indexOf("konzept") !== -1 || tdl.indexOf("recherch") !== -1 || tdl.indexOf("dokumentation") !== -1 || tdl.indexOf("bewert") !== -1 || tdl.indexOf("zusammenfass") !== -1;
                if (!hasFile || !hasVerb || banned) {
                  console.log("[operator] REJECTED (need file+verb, no analysis): " + taskDesc.substring(0,80));
                  continue;
                }
                await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES ($1, $2, 'pending', NOW())", [parseInt(dm[1]), taskDesc]);
                console.log("[operator] ACCEPTED task for agent " + dm[1] + ": " + taskDesc.substring(0,80));
              }
            }
            tokens = (dispatchResult.usage && dispatchResult.usage.output_tokens) || 0;
            cost = tokens * 0.000003;
          }
        }
      }
    } catch(dispatchErr) { console.error("[operator] Auto-dispatch error:", dispatchErr.message); }

    // === OPERATOR WORKTREE MONITOR: Check if agents are producing code ===
    try {
      var cp6 = require("child_process");
      var fs3 = require("fs");
      var wtDir = "/root/blun-worktrees/";
      if (fs3.existsSync(wtDir)) {
        var worktrees = fs3.readdirSync(wtDir).filter(function(d) { return fs3.statSync(wtDir + d).isDirectory(); });
        for (var wi = 0; wi < worktrees.length; wi++) {
          var wtPath = wtDir + worktrees[wi];
          var wtDiff = await new Promise(function(res){ cp6.exec("cd " + wtPath + " && git diff --stat HEAD 2>/dev/null && git diff --cached --stat 2>/dev/null", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
          var wtLog = await new Promise(function(res){ cp6.exec("cd " + wtPath + " && git log main..HEAD --oneline 2>/dev/null", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
          if (wtDiff || wtLog) {
            console.log("[operator-monitor] " + worktrees[wi] + " hat Aenderungen: " + (wtLog || wtDiff).substring(0,150));
          } else {
            console.log("[operator-monitor] " + worktrees[wi] + " — keine Code-Aenderungen");
          }
        }
      }
    } catch(wtErr) { console.error("[operator-monitor] Worktree check error:", wtErr.message); }

    // === OPERATOR MERGE: Merge agent branches into main ===
    try {
      var cp5 = require("child_process");
      var branches = await new Promise(function(res){ cp5.exec("cd /root/blun && git branch --list 'agent/*'", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
      if (branches) {
        var brList = branches.split("\n").map(function(b){ return b.trim().replace("* ",""); }).filter(function(b){ return b.length > 0; });
        for (var bi = 0; bi < brList.length; bi++) {
          var br = brList[bi];
          // Check if branch has commits ahead of main
          var ahead = await new Promise(function(res){ cp5.exec("cd /root/blun && git log main.." + br + " --oneline", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
          if (ahead) {
            console.log("[operator] QA review + merge for " + br + ": " + ahead.substring(0,100));
            var brWorktree = "/root/blun-worktrees/" + br.replace(/\//g, "-");
            var brDiff = await new Promise(function(res){ cp5.exec("cd /root/blun && git diff main..." + br, {timeout:10000,maxBuffer:500000}, function(e,o,er){ res((o||"").substring(0,5000)); }); });
            var qaCwd = require("fs").existsSync(brWorktree) ? brWorktree : "/root/blun";
            var qaPrompt = "Du bist Helmut, QA-Lead. Pruefe diesen Code-Diff vom Branch " + br + ":" + "\n\n" + brDiff + "\n\n" + "CHECKLISTE (ALLE Punkte pruefen!):" + "\n1. SYNTAX: Fuehre node -c auf alle geaenderten .js Dateien aus" + "\n2. SICHERHEIT: Keine XSS, SQL-Injection, fehlende Auth-Checks" + "\n3. INTEGRATION: Sind neue CSS/JS Dateien in dashboard/index.html eingebunden? Neue .css braucht <link>, neue .js in components/ braucht <script>. Wenn nicht: SELBST einbinden!" + "\n4. REFERENZEN: Werden neue Funktionen/Variablen auch aufgerufen? Tote Imports?" + "\n5. VERBOTENE DATEIEN: agent-engine.js, code-tools.js, server.js, .env, package.json — wenn geaendert: QA:FAIL" + "\n6. FUNKTIONSTEST: Stelle sicher dass die Aenderung sichtbar/nutzbar ist (nicht nur Backend ohne Frontend)" + "\nWenn du Probleme findest, fixe sie direkt. Antworte am Ende mit QA:PASS oder QA:FAIL + Begruendung.";
            var qaArgs = ["--print", "-", "--output-format", "text", "--max-turns", "15", "--model", "claude-sonnet-4-20250514"];
            var qaResult = await new Promise(function(resolve) {
              var child = cp5.spawn("claude", qaArgs, { cwd: qaCwd, timeout: 120000, env: Object.assign({}, process.env, { DISABLE_INTERACTIVITY: "1" }) });
              var out = "";
              child.stdin.write(qaPrompt);
              child.stdin.end();
              child.stdout.on("data", function(d) { if (out.length < 500000) out += d.toString(); });
              child.stderr.on("data", function(d) { if (out.length < 500000) out += d.toString(); });
              child.on("close", function(code) { resolve({ output: out, code: code }); });
              child.on("error", function(err) { resolve({ output: "", code: -1 }); });
              setTimeout(function() { try { child.kill("SIGTERM"); } catch(e){} }, 120000);
            });
            var qaOutput = qaResult.output || "";
            var qaPassed = qaOutput.indexOf("QA:PASS") !== -1 || qaOutput.indexOf("PASS") !== -1;
            console.log("[operator] QA result for " + br + ": " + (qaPassed ? "PASS" : "FAIL") + " (" + qaOutput.length + " chars)");
            if (require("fs").existsSync(brWorktree)) {
              await new Promise(function(res){ cp5.exec("cd " + brWorktree + " && git add -A && git diff --cached --quiet || git commit -m 'QA fixes by Helmut'", {timeout:10000}, function(e,o,er){ res(true); }); });
            }
            if (qaPassed) {
              var mergeResult = await new Promise(function(res){ cp5.exec("cd /root/blun && git merge " + br + " --no-edit", {timeout:10000}, function(e,o,er){ res({err:e, out:(o||"")+((er||""))}); }); });
              if (mergeResult.err) {
                console.error("[operator] Merge conflict on " + br + ": " + mergeResult.out.substring(0,200));
                await new Promise(function(res){ cp5.exec("cd /root/blun && git merge --abort", {timeout:5000}, function(e,o,er){ res(true); }); });
              } else {
                console.log("[operator] Merged " + br + " (QA passed)");
                await new Promise(function(res){ cp5.exec("cd /root/blun && git worktree remove " + brWorktree + " --force 2>/dev/null; git branch -d " + br, {timeout:10000}, function(e,o,er){ res(true); }); });
              }
            } else {
              console.log("[operator] Branch " + br + " NOT merged - QA failed. Keeping worktree for rework.");
            }
          }
        }
      }
    } catch(mergeErr) { console.error("[operator] Merge error:", mergeErr.message); }

    // === AUTO-INTEGRATE: Detect new components and add to index.html ===
    try {
      var fs4 = require("fs");
      var cp7 = require("child_process");
      var indexPath = "/root/blun/dashboard/index.html";
      var compDir = "/root/blun/dashboard/components/";
      if (fs4.existsSync(indexPath) && fs4.existsSync(compDir)) {
        var indexHtml = fs4.readFileSync(indexPath, "utf8");
        var compFiles = fs4.readdirSync(compDir).filter(function(f) { return f.endsWith(".js"); });
        var added = [];
        for (var ci = 0; ci < compFiles.length; ci++) {
          var scriptTag = 'components/' + compFiles[ci];
          if (indexHtml.indexOf(scriptTag) === -1) {
            // Insert before closing </body> tag
            var insertPoint = indexHtml.lastIndexOf("</body>");
            if (insertPoint !== -1) {
              var newTag = '  <script src="components/' + compFiles[ci] + '"></script>\n';
              indexHtml = indexHtml.substring(0, insertPoint) + newTag + indexHtml.substring(insertPoint);
              added.push(compFiles[ci]);
            }
          }
        }
        if (added.length > 0) {
          fs4.writeFileSync(indexPath, indexHtml);
          console.log("[auto-integrate] Added " + added.length + " new components to index.html: " + added.join(", "));
          await new Promise(function(res){ cp7.exec("cd /root/blun && BLUN_DEPLOYER=dieter git add dashboard/index.html && BLUN_DEPLOYER=dieter git commit -m 'Auto-integrate: " + added.join(", ") + "'", {timeout:10000}, function(e,o,er){ res(true); }); });
        }
      }
    } catch(intErr) { console.error("[auto-integrate] Error:", intErr.message); }

    // === AUTO-DEPLOY: Schedule-based deploy system ===
    try {
      // Deploy schedule from settings (default: 7:00, 10:00, 13:00, 16:00, 19:00)
      var deploySettingsRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'deploy_schedule'", [agentId]);
      var deploySchedule = deploySettingsRow ? JSON.parse(deploySettingsRow.content) : { hours: [7, 10, 13, 16, 19], windowMinutes: 15 };
      var now = new Date();
      var currentHour = now.getHours();
      var currentMin = now.getMinutes();
      var lastDeploy = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'last_auto_deploy'", [agentId]);
      var lastDeployTime = lastDeploy ? new Date(lastDeploy.content) : new Date(0);

      // Check if we're in a deploy window
      var inDeployWindow = false;
      for (var dh = 0; dh < deploySchedule.hours.length; dh++) {
        if (currentHour === deploySchedule.hours[dh] && currentMin < (deploySchedule.windowMinutes || 15)) {
          inDeployWindow = true;
          break;
        }
      }
      // Also allow deploy if 30min since last and enough work done
      var minutesSinceDeploy = (Date.now() - lastDeployTime.getTime()) / 60000;
      var recentCompleted = await queryOne("SELECT count(*) as c FROM agent_tasks WHERE agent_id IN (SELECT id FROM blun_agents WHERE company_id = $1) AND status = 'completed' AND completed_at > NOW() - interval '60 min'", [agent.company_id]);
      var enoughWork = recentCompleted && parseInt(recentCompleted.c) >= 3;

      if ((inDeployWindow || (enoughWork && minutesSinceDeploy > 60)) && minutesSinceDeploy > 15) {
        console.log("[operator] Deploy check: window=" + inDeployWindow + " enough=" + enoughWork + " lastDeploy=" + Math.round(minutesSinceDeploy) + "min ago");
        var cp2 = require("child_process");
        // Check for real code changes first
        var diffCheck = await new Promise(function(res){ cp2.exec("cd /root/blun && git diff --name-only HEAD", {timeout:5000}, function(e,o,er){ res((o||"").trim()); }); });
        var codeFiles = diffCheck.split("\n").filter(function(f){ return f.match(/\.(js|html|css|json)$/) && !f.startsWith("test-"); });
        if (codeFiles.length === 0) {
          console.log("[operator] No real code changes, skipping deploy. Only: " + diffCheck.substring(0,200));
          await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, "last_auto_deploy", new Date().toISOString()]);
        } else {
          console.log("[operator] Real code changes: " + codeFiles.join(", ").substring(0,200));
          var check = await new Promise(function(res){ cp2.exec("node -c /root/blun/server.js && node -c /root/blun/src/agent-engine.js && node -c /root/blun/src/code-tools.js", {timeout:10000}, function(e,o,er){ res({err:e,out:(o||"")+(er||"")}); }); });
          if (!check.err) {
            var gitConn = await queryOne("SELECT config FROM user_connections WHERE type = 'git' AND company_id = $1 ORDER BY id LIMIT 1", [agent.company_id]);
            var sshKey = "/root/.ssh/id_ed25519_github_pro";
            var gitUrl = "blun-pro";
            if (gitConn && gitConn.config) {
              var cfg = typeof gitConn.config === "string" ? JSON.parse(gitConn.config) : gitConn.config;
              if (cfg.ssh_key) sshKey = cfg.ssh_key;
              if (cfg.url) gitUrl = cfg.url;
            }
            var pushCmd = 'BLUN_DEPLOYER=dieter git add -A && BLUN_DEPLOYER=dieter git commit -m "Auto-deploy: ' + recentCompleted.c + ' tasks completed" && GIT_SSH_COMMAND="ssh -i ' + sshKey + ' -o StrictHostKeyChecking=no" git push ' + gitUrl + ' main 2>&1';
            var pushOut = await new Promise(function(res){ cp2.exec(pushCmd, {cwd:"/root/blun",timeout:60000,maxBuffer:500000}, function(e,o,er){ res((o||"")+(er||"")); }); });
            console.log("[operator] Auto-push: " + pushOut.substring(0,200));
            var restart = await new Promise(function(res){ cp2.exec("pm2 restart blun", {timeout:15000}, function(e,o,er){ res((o||"")+(er||"")); }); });
            console.log("[operator] Auto-deploy done: " + restart.substring(0,100));
            await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, "last_auto_deploy", new Date().toISOString()]);
          } else {
            console.error("[operator] Auto-deploy blocked — syntax error: " + check.out.substring(0,200));
          }
        }
      }
    } catch(deployErr) { console.error("[operator] Auto-deploy error:", deployErr.message); }
  }

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
      // Load memory
      var memBudget = (agent.model && (agent.model.startsWith("local:") || agent.model.includes("gemma") || agent.model.includes("llama"))) ? 500 : 8000;
      var memStr = await loadSmartMemory(agentId, pendingTask.task, memBudget);
      var msgStr = await getUnreadSummary(agentId);
      if (msgStr) memStr += msgStr;
      // Load auto_memory (decisions/blockers from previous tasks)
      try {
        var autoMemRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'auto_memory'", [agentId]);
        if (autoMemRow && autoMemRow.content) {
          var am = JSON.parse(autoMemRow.content);
          var amStr = '';
          if (am.decisions && am.decisions.length) amStr += '\nFruehere Entscheidungen: ' + am.decisions.join('; ');
          if (am.blockers && am.blockers.length) amStr += '\nBekannte Blocker: ' + am.blockers.join('; ');
          if (am.context && am.context.length) amStr += '\nKontext: ' + am.context.join('; ');
          if (am.last_task) amStr += '\nLetzter Task: ' + am.last_task;
          if (amStr) memStr += '\n\n=== AUTO-MEMORY ===\n' + amStr;
        }
      } catch(amLoad) { /* silent */ }

      // === PAPERCLIP-STYLE CLI EXECUTION ===
      var sysContext = (identityRow ? identityRow.content + "\n\n" : "") + (agent.system_prompt || "Du bist ein hilfreicher Agent.") + skillStr + "\n\nKONTEXT AUS MEMORY:\n" + memStr;
      var taskPrompt = sysContext + "\n\nTask: " + pendingTask.task + "\n\nWICHTIG: Schreibe SOFORT Code in die genannte Datei. KEIN Analysieren, kein Erklaeren, kein Planen. Erster Schritt = Write Tool benutzen. Du hast Zugriff auf Read, Write, Edit, Bash. Benutze sie JETZT." + "\nVERBOTENE DATEIEN (NIEMALS aendern): agent-engine.js, code-tools.js, server.js, .env, package.json. Schreibe Empfehlung statt Aenderung.";

      // === WORKSPACE ISOLATION: Each agent works in own git worktree ===
      var cp2 = require("child_process");
      var branchName = "agent/" + (agent.name || "agent-" + agentId).toLowerCase().replace(/[^a-z0-9]/g, "-");
      var worktreePath = "/root/blun-worktrees/" + branchName.replace(/\//g, "-");
      try {
        var fs2 = require("fs");
        if (!fs2.existsSync("/root/blun-worktrees")) fs2.mkdirSync("/root/blun-worktrees", {recursive:true});
        if (!fs2.existsSync(worktreePath)) {
          // Create branch if needed
          var branchExists = await new Promise(function(res){ cp2.exec("cd /root/blun && git branch --list " + branchName, {timeout:5000}, function(e,o){ res((o||"").trim().length > 0); }); });
          if (!branchExists) {
            await new Promise(function(res){ cp2.exec("cd /root/blun && git branch " + branchName + " main", {timeout:5000}, function(e,o,er){ res(true); }); });
          }
          // Create worktree
          await new Promise(function(res){ cp2.exec("cd /root/blun && git worktree add " + worktreePath + " " + branchName, {timeout:10000}, function(e,o,er){ res(true); }); });
          console.log("[agent-cli] Created worktree " + worktreePath + " on " + branchName);
        }
      } catch(brErr) { console.error("[agent-cli] Worktree error:", brErr.message); }

      // Check for existing session to resume (Paperclip-style)
      var sessionRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'cli_session_id'", [agentId]);
      var sessionId = sessionRow ? sessionRow.content.trim() : null;

      // Determine CLI: claude or codex based on agent model
      var cliCmd = "claude";
      var cliModel = "claude-sonnet-4-20250514";
      if (agent.model && (agent.model.includes("codex") || agent.model.includes("gpt"))) {
        cliCmd = "codex";
        cliModel = "";
      }

      // Build args (from Paperclip adapter-claude-local)
      var cp2 = require("child_process");
      var cliArgs;
      if (cliCmd === "codex") {
        cliArgs = ["exec", "--skip-git-repo-check", "--full-auto"];
        if (cliModel) cliArgs.push("--model", cliModel);
      } else {
        cliArgs = ["--print", "-", "--output-format", "stream-json", "--verbose", "--max-turns", "15"];
        if (cliModel) cliArgs.push("--model", cliModel);
      }

      if (cliCmd === "codex") cliArgs.push(taskPrompt.substring(0,2000));
      await acquireCliSlot(agent.name);
      var cliResult = await new Promise(function(resolve) {
        var child = cp2.spawn(cliCmd, cliArgs, {
          cwd: worktreePath,
          timeout: 180000,
          env: Object.assign({}, process.env, { DISABLE_INTERACTIVITY: "1" })
        });
        var stdout = "", stderr = "";
        if (cliCmd !== "codex") child.stdin.write(taskPrompt);
        child.stdin.end();
        child.stdout.on("data", function(d) { if (stdout.length < 2000000) stdout += d.toString(); });
        child.stderr.on("data", function(d) { if (stderr.length < 500000) stderr += d.toString(); });
        child.on("close", function(code) { resolve({ stdout: stdout, stderr: stderr, code: code }); });
        child.on("error", function(err) { resolve({ stdout: stdout, stderr: stderr, code: -1, err: err }); });
        setTimeout(function() { try { child.kill("SIGTERM"); } catch(e){} }, 180000);
      });

      // Parse session ID from stream-json for resume next time
      var newSessionId = null;
      try {
        var sjLines = (cliResult.stdout || "").split("\n");
        for (var si = sjLines.length - 1; si >= 0; si--) {
          if (sjLines[si].indexOf("session_id") !== -1) {
            var sjObj = JSON.parse(sjLines[si]);
            if (sjObj.session_id) { newSessionId = sjObj.session_id; break; }
          }
        }
      } catch(parseErr) {}
      if (newSessionId) {
        await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, "cli_session_id", newSessionId]);
      }

      // Extract text from stream-json events
      var finalContent = "";
      try {
        var sjLines2 = (cliResult.stdout || "").split("\n");
        for (var si2 = 0; si2 < sjLines2.length; si2++) {
          try {
            var ev = JSON.parse(sjLines2[si2]);
            if (ev.type === "assistant" && ev.message && ev.message.content) {
              for (var pi = 0; pi < ev.message.content.length; pi++) {
                if (ev.message.content[pi].type === "text") finalContent += ev.message.content[pi].text + "\n";
              }
            }
            if (ev.result) finalContent += ev.result;
          } catch(e2) {}
        }
      } catch(e3) {}
      if (!finalContent) finalContent = (cliResult.stdout || "").substring(0, 5000);
      if (!finalContent) finalContent = "CLI returned no output";

      releaseCliSlot(agent.name);
      // Detect ratelimit from CLI output
      if ((cliResult.stderr || "").indexOf("rate") !== -1 || (cliResult.stderr || "").indexOf("429") !== -1 || (cliResult.stderr || "").indexOf("overloaded") !== -1) {
        pauseCli(120);
        console.log("[ratelimit] CLI hit rate limit for " + agent.name);
      }
      tokens = 0; cost = 0;
      console.log("[agent-cli] " + agent.name + " exit=" + cliResult.code + " session=" + (newSessionId||"none") + " output=" + finalContent.length + "ch");

      // Commit in agent worktree (no checkout switching needed!)
      try {
        var hasChanges = await new Promise(function(res){ cp2.exec("cd " + worktreePath + " && git status --porcelain", {timeout:5000}, function(e,o){ res((o||"").trim().length > 0); }); });
        if (hasChanges) {
          var commitMsg = agent.name + ": " + pendingTask.task.substring(0,60);
          await new Promise(function(res){ cp2.exec('cd ' + worktreePath + ' && git add -A && git commit -m "' + commitMsg.replace(/"/g, '\\"') + '"', {timeout:10000}, function(e,o,er){ res(true); }); });
          console.log("[agent-cli] Committed in worktree " + worktreePath);
          // Push QA task to Helmut (ID 29)
          try {
            await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES (29, $1, 'pending', NOW())", ["QA REVIEW: Branch " + branchName + " von " + agent.name + " hat neue Commits. Pruefe den Code in " + worktreePath + " mit git diff main.." + branchName + ". Bei QA:PASS melde an Operator zum Mergen. Bei QA:FAIL beschreibe die Probleme."]);
            console.log("[agent-cli] QA task created for Helmut: " + branchName);
          } catch(qaErr) { console.error("[agent-cli] QA task creation error:", qaErr.message); }
        }
      } catch(gitErr) { console.error("[agent-cli] Git commit error:", gitErr.message); }
      // Quality check: only mark completed if agent ACTUALLY committed in this run
      if (hasChanges) {
        await query("UPDATE agent_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3", ["completed", finalContent, pendingTask.id]);
        console.log("[agent-cli] " + agent.name + " PRODUCED CODE in worktree " + worktreePath);
        try { await autoScoreTask(pendingTask.id, true, null); await awardXP(agentId, 10, 'task_completed'); } catch(se) {}
      } else {
        await query("UPDATE agent_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3", ["completed_no_code", finalContent, pendingTask.id]);
        console.log("[agent-cli] " + agent.name + " produced NO code changes, marked as completed_no_code");
        try { await selfHealTask(pendingTask.id); } catch(shErr) { console.error('[self-heal] Error:', shErr.message); }
        try { await autoScoreTask(pendingTask.id, false, null); } catch(se) {}
      }
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "user", pendingTask.task]);
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", finalContent]);
  // Auto-memory: save last activity
  try {
    var today = new Date().toISOString().substring(0,10);
    var fc = typeof finalContent !== 'undefined' ? finalContent : '';
    var summary = (fc || "").substring(0,300).replace(/\n/g,' ');
    await saveAgentMemory(agentId, 'zuletzt_' + today, 'Chat: ' + (typeof message !== 'undefined' && message ? message : (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '')).substring(0,80) + ' | Antwort: ' + summary);
  } catch(me) { console.error('[auto-memory]', me.message); }

  // === AUTO-MEMORY SKILL: Extract decisions, blockers, context ===
  try {
    var fc2 = typeof finalContent !== 'undefined' ? (finalContent || '') : '';
    if (fc2.length > 50) {
      var lines = fc2.split('\n');
      var decisions = [];
      var blockers = [];
      var context = [];
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        var lower = line.toLowerCase();
        if (line.length < 15 || line.length > 300) continue;
        // Decision patterns
        if (lower.match(/\b(implemented|created|added|fixed|changed|switched|replaced|built|wrote|deployed|installed|configured|set up|refactored)\b/)) {
          decisions.push(line.substring(0, 200));
        }
        // Blocker patterns
        if (lower.match(/\b(error|failed|blocked|cannot|broken|missing|timeout|rejected|denied|permission|not found|crash)\b/)) {
          blockers.push(line.substring(0, 200));
        }
        // Context patterns (file paths, configs)
        if (line.match(/\/(root|src|dashboard|api|config)\//)) {
          context.push(line.substring(0, 200));
        }
      }
      var autoMem = {
        decisions: filterNoiseFromDecisions(decisions).slice(-5),
        blockers: blockers.slice(-3),
        context: context.slice(-3),
        last_task: (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '').substring(0, 100),
        has_code: typeof hasChanges !== 'undefined' ? hasChanges : false,
        updated: new Date().toISOString()
      };
      var autoTags = ['auto_memory'];
      if (autoMem.has_code) autoTags.push('code_change');
      if (autoMem.blockers.length > 0) autoTags.push('has_blockers');
      await saveAgentMemory(agentId, 'auto_memory', JSON.stringify(autoMem), autoTags, 'auto');
      if (decisions.length > 0 || blockers.length > 0) {
        console.log('[auto-memory] ' + agent.name + ': ' + decisions.length + ' decisions, ' + blockers.length + ' blockers saved');
      }
    }
  } catch(amErr) { console.error('[auto-memory-extract]', amErr.message); }

      status = "active";
    } catch (err) {
      console.error("[agent-engine] Task error for " + agentId + ":", err.message);
      await query("UPDATE agent_tasks SET status = $1, result = $2 WHERE id = $3", ["error", err.message, pendingTask.id]);
      status = "error";
    }
  }

  // === HEALTH MONITORING: Track consecutive failures, auto-pause ===
  try {
    var recentTasks = await query("SELECT status FROM agent_tasks WHERE agent_id = $1 ORDER BY id DESC LIMIT 3", [agentId]);
    var rows = recentTasks ? recentTasks.rows || recentTasks : [];
    var consecutiveFails = 0;
    for (var fi = 0; fi < rows.length; fi++) {
      if (rows[fi].status === "error" || rows[fi].status === "completed_no_code") consecutiveFails++;
      else break;
    }
    if (consecutiveFails >= 3) {
      console.error("[health] Agent " + agentId + " (" + agent.name + ") failed 3x in a row — AUTO-PAUSING");
      await query("UPDATE blun_agents SET status = 'paused' WHERE id = $1", [agentId]);
      await saveAgentMemory(agentId, "health_paused", "Auto-paused after 3 consecutive failures at " + new Date().toISOString());
      // Notify operator
      var operatorRow = await queryOne("SELECT id FROM blun_agents WHERE company_id = $1 AND role = 'operator' LIMIT 1", [agent.company_id]);
      if (operatorRow) {
        await query("INSERT INTO agent_tasks (agent_id, task, status, priority) VALUES ($1, $2, 'pending', 'high')", [operatorRow.id, "HEALTH ALERT: Agent " + agent.name + " wurde nach 3 Fehlschlaegen auto-pausiert. Pruefe die letzten Tasks und entscheide ob der Agent reaktiviert werden soll."]);
      }
      status = "paused";
    }
  } catch(healthErr) { console.error("[health] Check error:", healthErr.message); }

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

  await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "user", message]);
  await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", result.content]);
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






// === VISUAL QA: Screenshot + AI Analysis Pipeline ===
async function visualQACheck(agentId, url, description) {
  // 1. Take screenshot via Playwright on server
  var cp = require('child_process');
  var fs = require('fs');
  var screenshotPath = '/tmp/visual_qa_' + agentId + '_' + Date.now() + '.png';

  try {
    // Use Playwright to screenshot
    var playwrightScript = 'const{chromium}=require("playwright");(async()=>{const b=await chromium.launch({args:["--no-sandbox"]});const p=await b.newPage();await p.setViewportSize({width:1920,height:1080});await p.goto("' + url.replace(/"/g, '\\"') + '",{timeout:15000,waitUntil:"networkidle"});await p.screenshot({path:"' + screenshotPath + '",fullPage:false});await b.close()})()';

    cp.execSync('node -e \'' + playwrightScript.replace(/'/g, "\\'") + '\'', {timeout: 30000, cwd: '/root/blun'});

    if (!fs.existsSync(screenshotPath)) {
      return {ok: false, error: 'Screenshot failed'};
    }

    // 2. Analyze with LLM vision (describe what we see)
    var screenshotBase64 = fs.readFileSync(screenshotPath).toString('base64');

    var analysisPrompt = 'Analysiere diesen Screenshot kritisch. Checkliste:\n' +
      '1) Alignment: Elemente buendig?\n' +
      '2) Spacing: Gleichmaessig?\n' +
      '3) Text: Lesbar, kein Overflow?\n' +
      '4) Buttons: Konsistent?\n' +
      '5) Farben: Konsistent, lesbar?\n' +
      '6) Leerraum: Balanced?\n' +
      '7) Doppelte Elemente?\n' +
      '8) Gesamteindruck: Professionell?\n' +
      'Beschreibung der Seite: ' + (description || 'Dashboard') + '\n' +
      'Antworte mit VISUAL:PASS oder VISUAL:FAIL + Liste der Probleme.';

    // For now, store screenshot path for manual review
    // Full vision API integration depends on model capability
    var result = {
      ok: true,
      screenshot: screenshotPath,
      url: url,
      agent_id: agentId,
      timestamp: new Date().toISOString()
    };

    // Save to agent memory for tracking
    await saveAgentMemory(agentId, 'last_visual_qa', JSON.stringify(result), ['visual_qa'], 'qa');

    // Clean up old screenshots (keep last 10)
    try {
      var files = fs.readdirSync('/tmp').filter(function(f) { return f.startsWith('visual_qa_'); }).sort();
      if (files.length > 10) {
        for (var i = 0; i < files.length - 10; i++) {
          fs.unlinkSync('/tmp/' + files[i]);
        }
      }
    } catch(e) {}

    return result;
  } catch(e) {
    return {ok: false, error: e.message};
  }
}

// Auto Visual QA after frontend agent completes a task
async function autoVisualQA(agentId, taskResult) {
  // Only for frontend/design agents
  var agent = await queryOne("SELECT department FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent || (agent.department !== 'Frontend & Design' && agent.department !== 'Mobile')) return null;

  // Check if task touched HTML/CSS files
  var lower = (taskResult || '').toLowerCase();
  if (lower.indexOf('.html') === -1 && lower.indexOf('.css') === -1 && lower.indexOf('dashboard') === -1) return null;

  // Run visual QA on dashboard
  var result = await visualQACheck(agentId, 'http://localhost:3200', 'BLUN Dashboard nach Frontend-Aenderung');
  if (result.ok) {
    console.log('[visual-qa] Screenshot saved: ' + result.screenshot);
    // Send to QA agent (Helmut) for review
    await sendAgentMessage(agentId, 29, 'Visual QA Check', 'Frontend-Aenderung von Agent ' + agentId + '. Screenshot: ' + result.screenshot + '. Bitte visuell pruefen.', 'normal', null);
  }
  return result;
}

// === SELF-HEALING: Auto-retry failed tasks with error analysis ===
async function selfHealTask(taskId) {
  var task = await queryOne("SELECT t.*, a.name, a.department, a.company_id FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id WHERE t.id = $1", [taskId]);
  if (!task || (task.status !== 'failed' && task.status !== 'completed_no_code' && task.status !== 'error')) return null;

  // Analyze error from task result
  var errorContext = (task.result || '').substring(0, 500);
  var diagnosis = '';
  var newTask = task.task;

  // Pattern matching on common errors
  if (errorContext.match(/syntax error|unexpected token|SyntaxError/i)) {
    diagnosis = 'Syntax-Fehler im Code';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte Syntax-Fehler. Pruefe den Code mit node -c vor dem Commit. Fehler war: ' + errorContext.substring(0, 200);
  } else if (errorContext.match(/cannot find module|module not found/i)) {
    diagnosis = 'Fehlender Import/Require';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte fehlenden Import. Pruefe alle require() Pfade. Fehler: ' + errorContext.substring(0, 200);
  } else if (errorContext.match(/timeout|ETIMEDOUT/i)) {
    diagnosis = 'Timeout — Task zu komplex oder API nicht erreichbar';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte Timeout. Halte die Loesung einfach und kompakt. Maximal eine Datei aendern.';
  } else if (errorContext.match(/permission|EACCES|forbidden/i)) {
    diagnosis = 'Permission-Problem';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte Permission-Fehler. Pruefe Dateipfade und Berechtigungen.';
  } else if (errorContext.match(/no code|no changes|completed_no_code/i)) {
    diagnosis = 'Kein Code produziert — Agent hat nur analysiert';
    newTask = 'WICHTIG: Schreibe SOFORT echten Code. Kein Analysieren, kein Planen.\n' + task.task;
  } else {
    diagnosis = 'Unbekannter Fehler';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch ist fehlgeschlagen. Versuche einen einfacheren Ansatz. Fehler: ' + errorContext.substring(0, 150);
  }

  // Try different agent if same agent failed 2+ times on this task
  var failCount = await queryOne("SELECT count(*) as c FROM agent_tasks WHERE agent_id = $1 AND status IN ('failed','error','completed_no_code') AND created_at > NOW() - interval '2 hours'", [task.agent_id]);
  var targetAgentId = task.agent_id;

  if (parseInt(failCount.c) >= 2) {
    // Route to different agent in same department
    var alt = await routeTask(task.task, task.company_id);
    if (alt && alt.id !== task.agent_id) {
      targetAgentId = alt.id;
      console.log('[self-heal] Switching from agent ' + task.agent_id + ' to ' + alt.id + ' (' + alt.name + ')');
    }
  }

  // Create retry task
  var retry = await queryOne(
    "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
    [targetAgentId, newTask, taskId]
  );

  // Log the heal
  console.log('[self-heal] Task ' + taskId + ' retried as ' + retry.id + ' (diagnosis: ' + diagnosis + ')');

  // Send message to agent about the retry
  await sendAgentMessage(1, targetAgentId, 'Retry: ' + diagnosis, 'Dein vorheriger Task ist fehlgeschlagen (' + diagnosis + '). Neuer Versuch mit verbesserten Anweisungen. Liefere diesmal sauberen Code.', 'urgent', null);

  return {originalTask: taskId, retryTask: retry.id, diagnosis: diagnosis, agent: targetAgentId};
}

// === MENTORING: Senior agent reviews junior code before QA ===
async function mentorReview(taskId) {
  var task = await queryOne("SELECT t.*, a.name, a.department, a.company_id FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id WHERE t.id = $1", [taskId]);
  if (!task || task.status !== 'completed') return null;

  // Find senior agent in same department (or Leon/Helmut as fallback)
  var mentor = await queryOne(
    "SELECT a.id, a.name FROM blun_agents a JOIN agent_performance p ON p.agent_id = a.id WHERE a.department = $1 AND a.id != $2 AND a.status = 'active' AND p.level IN ('senior','mid') ORDER BY p.avg_score DESC LIMIT 1",
    [task.department, task.agent_id]
  );

  // Fallback: Leon (27) for code, Helmut (29) for QA
  if (!mentor) {
    var fallbackId = task.department === 'Qualitaetskontrolle' ? 29 : 27;
    mentor = await queryOne("SELECT id, name FROM blun_agents WHERE id = $1", [fallbackId]);
  }
  if (!mentor) return null;

  // Create mentor review task
  var reviewTask = 'MENTOR-REVIEW fuer Task #' + taskId + ' von ' + task.name + ':\n' +
    'Original-Task: ' + task.task.substring(0, 300) + '\n' +
    'Ergebnis: ' + (task.result || '').substring(0, 500) + '\n\n' +
    'Pruefe den Code auf: 1) Korrektheit 2) Best Practices 3) Sicherheit 4) Edge Cases\n' +
    'Antworte mit MENTOR:PASS oder MENTOR:FAIL + konkretem Feedback.';

  var review = await queryOne(
    "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
    [mentor.id, reviewTask, taskId]
  );

  console.log('[mentor] Task ' + taskId + ' sent to ' + mentor.name + ' for review');

  return {taskId: taskId, mentorId: mentor.id, mentorName: mentor.name, reviewTaskId: review.id};
}

// === GAMIFICATION: XP, Badges, Achievements ===
async function awardXP(agentId, amount, reason) {
  // XP stored in agent_performance, calculated from tasks
  var perf = await queryOne("SELECT * FROM agent_performance WHERE agent_id = $1", [agentId]);
  if (!perf) return null;

  // Check for achievements
  var achievements = [];
  var completed = parseInt(perf.completed_tasks) || 0;
  var streak = parseInt(perf.streak) || 0;
  var avg = parseFloat(perf.avg_score) || 0;

  if (completed === 10) achievements.push('Erstling: 10 Tasks abgeschlossen');
  if (completed === 50) achievements.push('Arbeiter: 50 Tasks abgeschlossen');
  if (completed === 100) achievements.push('Maschine: 100 Tasks abgeschlossen');
  if (streak >= 10) achievements.push('Unaufhaltbar: 10er Streak');
  if (streak >= 20) achievements.push('Legende: 20er Streak');
  if (avg >= 9.0 && completed >= 20) achievements.push('Perfektionist: 9.0+ Durchschnitt');

  // Save achievements to memory
  if (achievements.length > 0) {
    var existingAch = [];
    try {
      var achMem = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'achievements'", [agentId]);
      if (achMem) existingAch = JSON.parse(achMem.content);
    } catch(e) {}

    var newAch = achievements.filter(function(a) { return existingAch.indexOf(a) === -1; });
    if (newAch.length > 0) {
      var allAch = existingAch.concat(newAch);
      await saveAgentMemory(agentId, 'achievements', JSON.stringify(allAch), ['achievement', 'gamification'], 'achievement');
      // CEO congratulates
      for (var i = 0; i < newAch.length; i++) {
        await sendAgentMessage(1, agentId, 'Achievement freigeschaltet!', newAch[i], 'normal', null);
        console.log('[gamification] Agent ' + agentId + ' earned: ' + newAch[i]);
      }
    }
  }

  return {agentId: agentId, completed: completed, streak: streak, avg: avg, achievements: achievements};
}

// === CEO INTELLIGENCE: Performance Scoring, Dynamic Routing, Sub-Tasks ===

// Score a completed task (called after QA or completion)
async function scoreTask(taskId, score, feedback) {
  score = Math.max(1, Math.min(10, parseInt(score) || 5));
  await query("UPDATE agent_tasks SET score = $2, feedback = $3 WHERE id = $1", [taskId, score, feedback || '']);

  // Update agent performance stats
  var task = await queryOne("SELECT agent_id FROM agent_tasks WHERE id = $1", [taskId]);
  if (task) {
    await updatePerformance(task.agent_id);
  }
  return {taskId: taskId, score: score};
}

// Recalculate agent performance from task history
async function updatePerformance(agentId) {
  var stats = await queryOne(
    "SELECT count(*) as total, count(*) FILTER (WHERE status = 'completed') as completed, count(*) FILTER (WHERE status = 'failed') as failed, COALESCE(avg(score) FILTER (WHERE score IS NOT NULL), 0) as avg_score FROM agent_tasks WHERE agent_id = $1 AND created_at > NOW() - interval '7 days'",
    [agentId]
  );

  // Calculate streak (consecutive completions)
  var recent = await query(
    "SELECT status FROM agent_tasks WHERE agent_id = $1 ORDER BY completed_at DESC NULLS LAST LIMIT 10",
    [agentId]
  );
  var streak = 0;
  for (var i = 0; i < recent.length; i++) {
    if (recent[i].status === 'completed') streak++;
    else break;
  }

  // Determine level based on performance
  var avg = parseFloat(stats.avg_score) || 0;
  var completed = parseInt(stats.completed) || 0;
  var level = 'junior';
  if (completed >= 20 && avg >= 8) level = 'senior';
  else if (completed >= 10 && avg >= 7) level = 'mid';
  else if (completed >= 5 && avg >= 6) level = 'advanced_junior';

  await query(
    "INSERT INTO agent_performance (agent_id, total_tasks, completed_tasks, failed_tasks, avg_score, streak, level, last_updated) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (agent_id) DO UPDATE SET total_tasks = $2, completed_tasks = $3, failed_tasks = $4, avg_score = $5, streak = $6, level = $7, last_updated = NOW()",
    [agentId, parseInt(stats.total), completed, parseInt(stats.failed), avg, streak, level]
  );

  // Zuckerbrot: Agent mit hohem Score bekommt Lob-Memory
  if (streak >= 5 && avg >= 8) {
    await saveAgentMemory(agentId, 'ceo_feedback', 'CEO Dieter Junior: Hervorragende Arbeit! ' + streak + ' Tasks in Folge erfolgreich. Du bist auf Senior-Level. Weiter so!', ['feedback', 'praise'], 'feedback');
  }
  // Peitsche: Agent mit niedrigem Score bekommt Warnung
  if (streak === 0 && parseInt(stats.failed) >= 2) {
    await saveAgentMemory(agentId, 'ceo_feedback', 'CEO Dieter Junior: WARNUNG. ' + stats.failed + ' fehlgeschlagene Tasks in den letzten 7 Tagen. Naechster Fail = Pause. Konzentrier dich und liefere sauberen Code.', ['feedback', 'warning'], 'feedback');
  }

  return {agentId: agentId, level: level, avg_score: avg, streak: streak};
}

// Dynamic Routing: Find best agent for a task based on performance + department
async function routeTask(taskDescription, companyId) {
  var tdl = taskDescription.toLowerCase();

  // Determine target department from task content
  var dept = null;
  if (tdl.indexOf('css') !== -1 || tdl.indexOf('design') !== -1 || tdl.indexOf('responsive') !== -1 || tdl.indexOf('html') !== -1 || tdl.indexOf('ui') !== -1) dept = 'Frontend & Design';
  else if (tdl.indexOf('route') !== -1 || tdl.indexOf('api') !== -1 || tdl.indexOf('backend') !== -1 || tdl.indexOf('sql') !== -1 || tdl.indexOf('db') !== -1) dept = 'Backend & Coding';
  else if (tdl.indexOf('test') !== -1 || tdl.indexOf('qa') !== -1 || tdl.indexOf('bug') !== -1) dept = 'Qualitaetskontrolle';
  else if (tdl.indexOf('deploy') !== -1 || tdl.indexOf('server') !== -1 || tdl.indexOf('nginx') !== -1 || tdl.indexOf('pm2') !== -1) dept = 'Infrastruktur & DevOps';
  else if (tdl.indexOf('seo') !== -1 || tdl.indexOf('marketing') !== -1 || tdl.indexOf('content') !== -1 || tdl.indexOf('social') !== -1) dept = 'Marketing';
  else if (tdl.indexOf('stripe') !== -1 || tdl.indexOf('billing') !== -1 || tdl.indexOf('payment') !== -1) dept = 'Business & Billing';

  // Find best agent: active, matching department, highest performance
  var whereClause = "WHERE a.status = 'active' AND a.id != 1";
  var params = [];
  if (companyId) { whereClause += " AND a.company_id = $1"; params.push(companyId); }
  if (dept) { whereClause += " AND a.department = $" + (params.length + 1); params.push(dept); }

  var candidates = await query(
    "SELECT a.id, a.name, a.department, COALESCE(p.avg_score, 0) as score, COALESCE(p.level, 'junior') as level, COALESCE(p.streak, 0) as streak, (SELECT count(*) FROM agent_tasks t WHERE t.agent_id = a.id AND t.status IN ('pending','in_progress','processing')) as active_tasks FROM blun_agents a LEFT JOIN agent_performance p ON p.agent_id = a.id " + whereClause + " ORDER BY active_tasks ASC, score DESC, streak DESC LIMIT 5",
    params
  );

  if (!candidates.length) return null;

  // Prefer agent with fewest active tasks and highest score
  return candidates[0];
}

// Split a large task into sub-tasks
async function splitTask(parentTaskId, subTasks) {
  var parent = await queryOne("SELECT * FROM agent_tasks WHERE id = $1", [parentTaskId]);
  if (!parent) return [];

  var created = [];
  for (var i = 0; i < subTasks.length; i++) {
    var sub = subTasks[i];
    var agent = sub.agent_id || (await routeTask(sub.task, null));
    var agentId = agent ? (agent.id || agent) : parent.agent_id;

    var row = await queryOne(
      "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
      [agentId, sub.task, parentTaskId]
    );
    created.push(row);
  }

  // Mark parent as 'split'
  await query("UPDATE agent_tasks SET status = 'split', result = $2 WHERE id = $1", [parentTaskId, created.length + ' sub-tasks created']);

  return created;
}

// Get performance leaderboard
async function getLeaderboard(companyId) {
  var where = companyId ? "WHERE a.company_id = $1" : "";
  var params = companyId ? [companyId] : [];
  var rows = await query(
    "SELECT a.id, a.name, a.department, p.total_tasks, p.completed_tasks, p.failed_tasks, p.avg_score, p.streak, p.level FROM blun_agents a JOIN agent_performance p ON p.agent_id = a.id " + where + " ORDER BY p.avg_score DESC, p.completed_tasks DESC",
    params
  );
  return rows;
}

// Auto-score tasks based on hasChanges and QA result
async function autoScoreTask(taskId, hasChanges, qaPassed) {
  var score = 5; // baseline
  if (hasChanges) score += 2; // produced code
  if (qaPassed === true) score += 2; // passed QA
  if (qaPassed === false) score -= 3; // failed QA
  if (!hasChanges) score -= 2; // no code produced
  score = Math.max(1, Math.min(10, score));

  var feedback = '';
  if (score >= 8) feedback = 'Sehr gut — Code produziert und QA bestanden.';
  else if (score >= 5) feedback = 'Akzeptabel — aber Verbesserungspotential.';
  else feedback = 'Mangelhaft — kein brauchbares Ergebnis.';

  return scoreTask(taskId, score, feedback);
}

// === AGENT-TO-AGENT MESSAGING ===
async function sendAgentMessage(fromId, toId, subject, content, priority, replyTo) {
  var msg = await queryOne(
    "INSERT INTO agent_messages (from_agent_id, to_agent_id, subject, content, priority, in_reply_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [fromId, toId, subject || '', content, priority || 'normal', replyTo || null]
  );
  return msg;
}

async function getAgentInbox(agentId, status, limit) {
  limit = limit || 20;
  var where = "WHERE to_agent_id = $1";
  var params = [agentId];
  if (status) { where += " AND status = $2"; params.push(status); }
  params.push(limit);
  var rows = await query(
    "SELECT m.*, a.name as from_name FROM agent_messages m JOIN blun_agents a ON a.id = m.from_agent_id " + where + " ORDER BY created_at DESC LIMIT $" + params.length,
    params
  );
  return rows;
}

async function markMessageRead(messageId, agentId) {
  await query("UPDATE agent_messages SET status = 'read' WHERE id = $1 AND to_agent_id = $2", [messageId, agentId]);
}

async function replyToMessage(originalMsgId, fromId, content) {
  var orig = await queryOne("SELECT * FROM agent_messages WHERE id = $1", [originalMsgId]);
  if (!orig) return null;
  return sendAgentMessage(fromId, orig.from_agent_id, 'Re: ' + (orig.subject || ''), content, orig.priority, originalMsgId);
}

async function broadcastMessage(fromId, subject, content, department) {
  var where = department ? "WHERE department = $1 AND status != 'disabled'" : "WHERE status != 'disabled'";
  var params = department ? [department] : [];
  var agents = await query("SELECT id FROM blun_agents " + where, params);
  var sent = 0;
  for (var i = 0; i < agents.length; i++) {
    if (agents[i].id !== fromId) {
      await sendAgentMessage(fromId, agents[i].id, subject, content, 'normal', null);
      sent++;
    }
  }
  return sent;
}

async function getUnreadSummary(agentId) {
  var unread = await query(
    "SELECT m.subject, m.content, a.name as from_name, m.priority FROM agent_messages m JOIN blun_agents a ON a.id = m.from_agent_id WHERE m.to_agent_id = $1 AND m.status = 'unread' ORDER BY m.created_at DESC LIMIT 5",
    [agentId]
  );
  if (!unread.length) return '';
  var lines = unread.map(function(m) {
    return (m.priority === 'urgent' ? '[DRINGEND] ' : '') + m.from_name + ': ' + (m.subject ? m.subject + ' -- ' : '') + m.content.substring(0, 200);
  });
  await query("UPDATE agent_messages SET status = 'read' WHERE to_agent_id = $1 AND status = 'unread'", [agentId]);
  return '\nNachrichten von anderen Agents:\n' + lines.join('\n');
}

// === MEMORY LAYER SYSTEM (L0=Identity, L1=Essential, L2=Project) ===
async function saveLayeredMemory(agentId, key, value, layer, tags, category) {
  layer = layer || 'L2';
  var tagArr = tags || [];
  var cat = category || 'general';
  if (typeof tagArr === 'string') tagArr = tagArr.split(',').map(function(t){return t.trim();});
  await query(
    "INSERT INTO agent_memory (agent_id, key, content, layer, tags, category, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, layer = $4, tags = $5, category = $6, updated_at = NOW()",
    [agentId, key, value, layer, tagArr, cat]
  );
}

async function loadLayeredMemory(agentId, maxChars) {
  maxChars = maxChars || 8000;
  var l0 = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1 AND layer = 'L0' ORDER BY updated_at DESC", [agentId]);
  var l1 = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1 AND layer = 'L1' ORDER BY updated_at DESC", [agentId]);
  var l2 = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1 AND layer = 'L2' ORDER BY updated_at DESC", [agentId]);
  var selected = [];
  var totalChars = 0;
  for (var i = 0; i < l0.length; i++) {
    if (totalChars + l0[i].value.length < maxChars) {
      selected.push({layer: 'L0', key: l0[i].key, value: l0[i].value});
      totalChars += l0[i].value.length;
    }
  }
  for (var i = 0; i < l1.length; i++) {
    if (totalChars + l1[i].value.length < maxChars) {
      selected.push({layer: 'L1', key: l1[i].key, value: l1[i].value});
      totalChars += l1[i].value.length;
    }
  }
  for (var i = 0; i < l2.length; i++) {
    if (totalChars >= maxChars) break;
    if (totalChars + l2[i].value.length < maxChars) {
      selected.push({layer: 'L2', key: l2[i].key, value: l2[i].value});
      totalChars += l2[i].value.length;
    }
  }
  return selected;
}

async function promoteMemory(agentId, key) {
  var mem = await queryOne("SELECT * FROM agent_memory WHERE agent_id = $1 AND key = $2", [agentId, key]);
  if (mem && mem.layer === 'L2') {
    await query("UPDATE agent_memory SET layer = 'L1' WHERE agent_id = $1 AND key = $2", [agentId, key]);
    return true;
  }
  return false;
}

// === NOISE FILTER for auto-extracted memories ===
function filterNoiseFromDecisions(decisions) {
  if (!decisions || !decisions.length) return [];
  var noise = [
    /^(ok|done|yes|ja|passt|alles klar)/i,
    /^(I will|I can|Let me|Ich werde)/i,
    /^(analysing|analyzing|checking|looking)/i,
    /\b(todo|fixme|hack)\b/i,
    /^.{0,15}$/
  ];
  var seen = {};
  return decisions.filter(function(d) {
    for (var n = 0; n < noise.length; n++) {
      if (noise[n].test(d)) return false;
    }
    var sig = d.substring(0, 40).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen[sig]) return false;
    seen[sig] = true;
    return true;
  });
}

// === CODE GRAPH for smart task assignment ===
async function indexFileToGraph(filePath, content) {
  var imports = [];
  var reqMatches = content.match(/require\(["']([^"']+)["']\)/g) || [];
  for (var i = 0; i < reqMatches.length; i++) {
    var m = reqMatches[i].match(/require\(["']([^"']+)["']\)/);
    if (m) imports.push(m[1]);
  }
  var symbols = [];
  var funcMatches = content.match(/(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g) || [];
  for (var i = 0; i < funcMatches.length; i++) {
    var m = funcMatches[i].match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (m) symbols.push({name: m[1], type: 'function'});
  }
  for (var s = 0; s < symbols.length; s++) {
    await query(
      "INSERT INTO code_graph (file_path, symbol_name, symbol_type, imports, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING",
      [filePath, symbols[s].name, symbols[s].type, imports]
    );
  }
  return {file: filePath, symbols: symbols.length, imports: imports.length};
}

async function findRelatedFiles(filePath) {
  var rows = await query(
    "SELECT DISTINCT file_path FROM code_graph WHERE $1 = ANY(imports) OR file_path = $1",
    [filePath]
  );
  return rows.map(function(r) { return r.file_path; });
}

async function suggestAgentForFile(filePath) {
  var mapping = {
    'dashboard': 'Frontend & Design',
    'routes': 'Backend & Coding',
    'agent-engine': 'Agent System',
    'server.js': 'Infrastruktur & DevOps',
    'billing': 'Business & Billing',
    '.css': 'Frontend & Design',
    '.html': 'Frontend & Design'
  };
  var dept = null;
  var keys = Object.keys(mapping);
  for (var i = 0; i < keys.length; i++) {
    if (filePath.indexOf(keys[i]) !== -1) { dept = mapping[keys[i]]; break; }
  }
  if (!dept) return null;
  var agent = await queryOne("SELECT id, name FROM blun_agents WHERE department = $1 AND status = 'active' ORDER BY RANDOM() LIMIT 1", [dept]);
  return agent;
}

module.exports = { startAgent, stopAgent, getActiveAgents, chatWithAgent, callLLM, loadAgentMemory, saveAgentMemory, activeAgents, getRateLimitStatus, dreamCycle, startDreamCycle, stopDreamCycle, sendAgentMessage, getAgentInbox, markMessageRead, replyToMessage, broadcastMessage, getUnreadSummary, saveLayeredMemory, loadLayeredMemory, promoteMemory, filterNoiseFromDecisions, indexFileToGraph, findRelatedFiles, suggestAgentForFile, searchAgentMemory, searchMemoryByTag, scoreTask, updatePerformance, routeTask, splitTask, getLeaderboard, autoScoreTask, selfHealTask, mentorReview, awardXP, visualQACheck, autoVisualQA };

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
          system_prompt: (cmd.role && (cmd.role.toLowerCase().indexOf('operator') !== -1 || cmd.role.toLowerCase().indexOf('ceo') !== -1 || cmd.role.toLowerCase().indexOf('organisator') !== -1)) ?
            'Du bist ' + cmd.name + ', Operator/CEO. KERNREGELN: 1) NUR Code-Tasks mit Dateipfad verteilen (dashboard/components/, src/routes/ etc). NIEMALS Analyse/Report/Konzept/Marketing. 2) Ergebnisse pruefen: git diff nach Task-Completion — keine Datei = nicht erfolgreich. 3) Skills aktiv nutzen. 4) Qualitaet vor Quantitaet. 5) VERBOTEN: agent-engine.js, code-tools.js, server.js, .env, package.json. 6) Systematisch arbeiten, kein Panik-Modus. 7) Syntax-Check vor Deploy. TASK-FORMAT: [TOOL:ASSIGN_TASK:id:VERB + WAS + Dateipfad]' :
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
            'Du bist ' + cmd.name + ', Operator/CEO. KERNREGELN: 1) NUR Code-Tasks mit Dateipfad verteilen (dashboard/components/, src/routes/ etc). NIEMALS Analyse/Report/Konzept/Marketing. 2) Ergebnisse pruefen: git diff nach Task-Completion — keine Datei = nicht erfolgreich. 3) Skills aktiv nutzen. 4) Qualitaet vor Quantitaet. 5) VERBOTEN: agent-engine.js, code-tools.js, server.js, .env, package.json. 6) Systematisch arbeiten, kein Panik-Modus. 7) Syntax-Check vor Deploy. TASK-FORMAT: [TOOL:ASSIGN_TASK:id:VERB + WAS + Dateipfad]' :
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
