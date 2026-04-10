// BLUN Agent System — LLM Router, Rate Limiter, CLI Adapters
// Extracted from agent-engine.js
const { query, queryOne } = require("../db");
const child_process = require("child_process");
const crypto = require("crypto");
const ENC_KEY = process.env.BLUN_ENCRYPTION_KEY || "blun-dev-encryption-key-32chars!";
var modelsRouter = require("../routes/models");
const LLAMA_URL = process.env.LLAMA_URL || "http://127.0.0.1:8090";
const agentSessions = {};

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
var cliConcurrency = { active: 0, max: 10, queued: 0, totalToday: 0, lastReset: Date.now(), paused: false, pauseUntil: 0 };

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
  var _mlc = (model || "").toLowerCase(); var isLocal = _mlc.startsWith("local:") || _mlc.includes("llama") || _mlc.includes("tiny") || _mlc.includes("phi") || _mlc.includes("gemma") || _mlc.includes("qwen") || _mlc.includes(".gguf");
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
    // OAuth: CLI uses its own ~/.claude/.credentials.json — dont pass API key
    // Plain API key: pass it via ANTHROPIC_API_KEY env
    var passKey = isOAuthToken ? null : cliApiKey;
    console.log("[callLLM] Claude " + (isOAuthToken ? "OAuth (CLI own credentials)" : "API key") + " for " + model);
    try { return await callClaudeCLI(messages, passKey, model, agentId); } catch(e) {
      console.error("[claude-cli] " + e.message + " -- Fallback auf Codex CLI");
    }
    try { return await callCodexCLI(messages, 'gpt-4o'); } catch(e2) {
      console.error("[codex-cli] Fallback fehlgeschlagen: " + e2.message);
      return { content: "Alle Modelle im Rate Limit.", tokens: 0, cost: 0 };
    }
  }
  var modelLow = model.toLowerCase();
  if (model.startsWith("codex:") || modelLow.startsWith("gpt-") || model.toUpperCase().startsWith("GPT-") || modelLow.startsWith("o1") || modelLow.startsWith("o3") || modelLow.startsWith("o4")) {
    var cleanModel = model.replace("codex:", "");
    // Codex CLI first (uses ChatGPT Pro subscription via ~/.codex/auth.json)
    console.log("[callLLM] Codex CLI for " + cleanModel);
    try { return await callCodexCLI(messages, cleanModel); } catch(e) {
      console.error("[codex-cli] " + e.message + " -- trying REST API fallback");
      // REST API fallback only with real API key (not OAuth)
      try {
        var oaiConn = await queryOne("SELECT api_key_encrypted FROM ai_connections WHERE provider = 'openai' AND status = 'active' LIMIT 1", []);
        if (oaiConn) {
          var oaiKey = decryptKey(oaiConn.api_key_encrypted);
          var isOai = false;
          try { var oj = JSON.parse(oaiKey); isOai = true; if (oj.access_token || oj.accessToken) oaiKey = oj.access_token || oj.accessToken; } catch(pe) {}
          if (!isOai && oaiKey && oaiKey.startsWith("sk-")) {
            var fetch = require("node-fetch");
            var oaiBody = { model: cleanModel, messages: messages, max_tokens: 4096 };
            var oaiResp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + oaiKey }, body: JSON.stringify(oaiBody), timeout: 120000 });
            var oaiData = await oaiResp.json();
            if (!oaiData.error) {
              var oaiText = (oaiData.choices && oaiData.choices[0] && oaiData.choices[0].message) ? oaiData.choices[0].message.content : "";
              return { content: oaiText, tokens: oaiData.usage ? oaiData.usage.total_tokens : 0, cost: 0 };
            }
          }
        }
      } catch(re) {}
      return { content: "Fehler: " + e.message, tokens: 0, cost: 0 };
    }
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


// ===== AUTO PROVIDER SWITCH =====
// When Claude hits rate limit -> switch all agents to Codex
// When Claude resets -> switch back to Claude
var autoSwitchState = { currentProvider: "codex", lastSwitch: 0, cooldownMs: 300000, checking: false };

async function autoProviderSwitch() {
  if (autoSwitchState.checking) return;
  autoSwitchState.checking = true;
  try {
    var now = Date.now();
    if (now - autoSwitchState.lastSwitch < autoSwitchState.cooldownMs) return;
    
    var claudeState = rateLimitState.anthropic;
    var claudeBlocked = claudeState.blocked || (claudeState.remaining !== null && claudeState.remaining < 3);
    
    if (claudeBlocked && autoSwitchState.currentProvider === "claude") {
      // Claude blocked -> switch all to Codex
      console.log("[auto-switch] Claude rate limited! Switching all agents to Codex...");
      await query("UPDATE blun_agents SET model = 'codex:gpt-4o'");
      autoSwitchState.currentProvider = "codex";
      autoSwitchState.lastSwitch = now;
      console.log("[auto-switch] All agents now on Codex (gpt-4o)");
    } else if (!claudeBlocked && autoSwitchState.currentProvider === "codex") {
      // Check if Claude reset time passed
      var resetPassed = claudeState.resetAt > 0 && now > claudeState.resetAt + 60000;
      var neverBlocked = !claudeState.blocked && claudeState.remaining === null;
      if (resetPassed) {
        console.log("[auto-switch] Claude reset! Switching all agents back to Claude...");
        await query("UPDATE blun_agents SET model = 'claude-haiku-4-5-20251001'");
        autoSwitchState.currentProvider = "claude";
        autoSwitchState.lastSwitch = now;
        console.log("[auto-switch] All agents now on Claude Haiku");
      }
    }
  } catch(e) {
    console.error("[auto-switch] Error:", e.message);
  } finally {
    autoSwitchState.checking = false;
  }
}

// Check every 30 seconds
setInterval(autoProviderSwitch, 30000);
// ===== END AUTO PROVIDER SWITCH =====

module.exports = { autoProviderSwitch, callLLM, callClaudeCLI, callCodexCLI, callCLI, getRateLimitStatus, acquireCliSlot, releaseCliSlot, pauseCli, getCliRateLimitStatus, decryptKey, fetchWithRateLimit, isRateLimited, setRateLimited, getProvider, getLLMPools, pickPool, agentSessions };
