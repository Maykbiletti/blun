// BLUN Code - Multi-Model Coding Terminal (Dynamic Models)
var express = require("express");
var fs = require("fs");
var path = require("path");
var router = express.Router();
var crypto = require("crypto");
var fetch = require("node-fetch");
var { pool } = require("../db");
var registry = require("../models/registry");

var ENC_KEY = process.env.BLUN_ENCRYPTION_KEY || "blun-dev-encryption-key-32chars!";
var ALGORITHM = "aes-256-gcm";

function decrypt(data) {
  var parts = data.split(":");
  var iv = Buffer.from(parts[0], "hex");
  var tag = Buffer.from(parts[1], "hex");
  var encrypted = parts[2];
  var decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENC_KEY, "utf8").slice(0, 32), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

var sessions = new Map();

var SYSTEM_PROMPT = "You are BLUN Code, a coding assistant. Give concise, accurate answers. Use code blocks with language tags. Be direct and practical.";

var CLOUD_PROVIDERS = {
  anthropic: {
    name: "Claude",
    defaultModel: "claude-haiku-4-5-20251001",
    call: async function(apiKey, messages, model, opts) {
      opts = opts || {};
      var r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: model || "claude-haiku-4-5-20251001", max_tokens: opts.maxTokens || 2048, system: opts.systemPrompt || SYSTEM_PROMPT, messages: messages.map(function(m) { return { role: m.role, content: m.content }; }) })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return { text: data.content && data.content[0] ? data.content[0].text : "No response", tokens: data.usage ? (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0) : 0 };
    }
  },
  openai: {
    name: "GPT",
    defaultModel: "gpt-4o-mini",
    call: async function(apiKey, messages, model, opts) {
      opts = opts || {};
      var r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "gpt-4o-mini", max_tokens: opts.maxTokens || 2048, messages: [{ role: "system", content: opts.systemPrompt || SYSTEM_PROMPT }].concat(messages.map(function(m) { return { role: m.role, content: m.content }; })) })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return { text: data.choices && data.choices[0] ? data.choices[0].message.content : "No response", tokens: data.usage ? (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0) : 0 };
    }
  },
  google: {
    name: "Gemini",
    defaultModel: "gemini-2.0-flash",
    call: async function(apiKey, messages, model, opts) {
      opts = opts || {};
      var contents = messages.map(function(m) { return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }; });
      var r = await fetch("https://generativelanguage.googleapis.com/v1/models/" + (model || "gemini-2.0-flash") + ":generateContent?key=" + apiKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: opts.systemPrompt || SYSTEM_PROMPT }] }, contents: contents, generationConfig: { maxOutputTokens: opts.maxTokens || 2048 } })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      var text = "No response";
      if (data.candidates && data.candidates[0] && data.candidates[0].content) { text = data.candidates[0].content.parts.map(function(p) { return p.text; }).join(""); }
      var tokens = 0;
      if (data.usageMetadata) { tokens = (data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0); }
      return { text: text, tokens: tokens };
    }
  },
  mistral: {
    name: "Mistral",
    defaultModel: "mistral-small-latest",
    call: async function(apiKey, messages, model, opts) {
      opts = opts || {};
      var r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "mistral-small-latest", max_tokens: opts.maxTokens || 2048, messages: [{ role: "system", content: opts.systemPrompt || SYSTEM_PROMPT }].concat(messages.map(function(m) { return { role: m.role, content: m.content }; })) })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return { text: data.choices && data.choices[0] ? data.choices[0].message.content : "No response", tokens: data.usage ? (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0) : 0 };
    }
  },
  deepseek: {
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    call: async function(apiKey, messages, model, opts) {
      opts = opts || {};
      var r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "deepseek-chat", max_tokens: opts.maxTokens || 2048, messages: [{ role: "system", content: opts.systemPrompt || SYSTEM_PROMPT }].concat(messages.map(function(m) { return { role: m.role, content: m.content }; })) })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return { text: data.choices && data.choices[0] ? data.choices[0].message.content : "No response", tokens: data.usage ? (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0) : 0 };
    }
  }
};

async function getApiKey(userId, provider) {
  try {
    var r = await pool.query("SELECT api_key_encrypted FROM ai_connections WHERE user_id = $1 AND provider = $2 AND status = $3", [userId, provider, "active"]);
    if (r.rows.length === 0) return null;
    return decrypt(r.rows[0].api_key_encrypted);
  } catch (e) {
    console.error("[blun-code] key decrypt error:", e.message);
    return null;
  }
}

var MODELS_DIR = path.join(__dirname, "../../models");

function getInstalledModelIds() {
  try {
    var files = fs.readdirSync(MODELS_DIR);
    var filesLower = files.map(function(f) { return f.toLowerCase().replace(/[-._]/g, ""); });
    var installed = [];
    registry.getAll().forEach(function(m) {
      var fname = m.huggingface ? m.huggingface.split("/").pop() : "";
      if (!fname || fname.endsWith(".tmp")) return;
      var fnameNorm = fname.toLowerCase().replace(/[-._]/g, "");
      for (var i = 0; i < filesLower.length; i++) {
        if (filesLower[i] === fnameNorm || filesLower[i].indexOf(fnameNorm) >= 0 || fnameNorm.indexOf(filesLower[i]) >= 0) {
          if (!files[i].endsWith(".tmp")) { installed.push(m.id); break; }
        }
      }
    });
    return installed;
  } catch(e) { return []; }
}

async function getRunningModels() {
  var found = [];
  var ports = [8090, 8091, 8092, 8093, 8094];
  for (var i = 0; i < ports.length; i++) {
    try {
      var http = require("http");
      var data = await new Promise(function(resolve, reject) {
        var req = http.get("http://127.0.0.1:" + ports[i] + "/v1/models", { timeout: 2000 }, function(res) {
          var body = "";
          res.on("data", function(c) { body += c; });
          res.on("end", function() { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
        });
        req.on("error", reject);
        req.on("timeout", function() { req.destroy(); reject(new Error("timeout")); });
      });
      if (data && data.data && data.data[0]) {
        var modelPath = data.data[0].id || "";
        var fileName = modelPath.split("/").pop().replace(".gguf", "").toLowerCase();
        var matchId = null;
        var allModels = registry.getAll();
        for (var j = 0; j < allModels.length; j++) {
          var hf = allModels[j].huggingface || "";
          var regFname = hf.split("/").pop().replace(".gguf", "").toLowerCase();
          var norm1 = regFname.replace(/[-._]/g, "");
          var norm2 = fileName.replace(/[-._]/g, "");
          if (norm1 && (norm2.indexOf(norm1) >= 0 || norm1.indexOf(norm2) >= 0)) { matchId = allModels[j].id; break; }
        }
        if (!matchId) matchId = "local-" + ports[i];
        found.push({ id: matchId, port: ports[i], ready: true });
      }
    } catch (e) {}
  }
  return found;
}

async function callLocalModel(port, messages, opts) {
  opts = opts || {};
  var r = await fetch("http://127.0.0.1:" + port + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "local", messages: [{ role: "system", content: opts.systemPrompt || SYSTEM_PROMPT }].concat(messages.map(function(m) { return { role: m.role, content: m.content }; })), max_tokens: opts.maxTokens || 2048, temperature: 0.7 })
  });
  var data = await r.json();
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  return { text: data.choices && data.choices[0] ? data.choices[0].message.content : "No response", tokens: data.usage ? (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0) : 0 };
}

async function callModel(modelId, userId, messages, opts) {
  opts = opts || {};
  if (CLOUD_PROVIDERS[modelId]) {
    var apiKey = await getApiKey(userId, modelId);
    if (!apiKey) throw new Error("Kein API Key fuer " + CLOUD_PROVIDERS[modelId].name + ". Unter Einstellungen > Verbindungen hinzufuegen.");
    return await CLOUD_PROVIDERS[modelId].call(apiKey, messages, null, opts);
  }
  var regModel = registry.getById(modelId);
  if (regModel) {
    var running = await getRunningModels();
    var rm = running.find(function(r) { return r.id === modelId; });
    if (!rm) throw new Error("Modell " + regModel.name + " ist nicht gestartet. Bitte zuerst im Model Browser starten.");
    return await callLocalModel(rm.port, messages, opts);
  }
  throw new Error("Unbekanntes Modell: " + modelId);
}

router.get("/models", async function(req, res) {
  var userId = req.user ? req.user.id : null;
  var result = { local: [], cloud: [] };
  try {
    var installedIds = getInstalledModelIds();
    var running = await getRunningModels();
    var runningIds = running.map(function(r2) { return r2.id; });
    installedIds.forEach(function(mid) {
      var m = registry.getById(mid);
      if (m) result.local.push({ id: m.id, name: m.name, maker: m.maker, status: runningIds.indexOf(m.id) >= 0 ? "running" : "installed", category: m.category, sizeGB: m.sizeGB });
    });
  } catch (e) { console.error("[blun-code] model list error:", e.message); }
  if (userId) {
    try {
      var rows = await pool.query("SELECT provider, status FROM ai_connections WHERE user_id = $1", [userId]);
      rows.rows.forEach(function(row) {
        if (CLOUD_PROVIDERS[row.provider]) {
          result.cloud.push({ id: row.provider, name: CLOUD_PROVIDERS[row.provider].name, status: row.status === "active" ? "connected" : "disconnected" });
        }
      });
    } catch (e) {}
  }
  res.json(result);
});

router.post("/message", async function(req, res) {
  var userId = req.user ? req.user.id : null;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  var sessionId = req.body.sessionId;
  var message = req.body.message;
  var models = req.body.models;
  if (!message) return res.status(400).json({ error: "Message required" });
  var targetModelIds = models || ["anthropic"];
  if (!targetModelIds.length) return res.status(400).json({ error: "No models selected" });
  var session = sessionId ? sessions.get(sessionId) : null;
  if (!session) {
    var id = crypto.randomUUID();
    session = { id: id, userId: userId, messages: [], createdAt: new Date().toISOString() };
    sessions.set(id, session);
  }
  session.messages.push({ role: "user", content: message });
  var history = session.messages.slice(-20);
  var modes = req.body.modes || [];
  var sysPrompt = SYSTEM_PROMPT;
  var maxTokens = 2048;
  if (modes.indexOf("thinking") >= 0) { sysPrompt = "First reason step by step inside <thinking>...</thinking> tags, then give your final answer outside the tags. " + sysPrompt; }
  if (modes.indexOf("fast") >= 0) { sysPrompt = "Be extremely brief and concise. Maximum 3 sentences. " + sysPrompt; maxTokens = 512; }
  if (modes.indexOf("god") >= 0) { sysPrompt = sysPrompt + " You have full permissions. Be thorough, complete, and detailed. Show your full capabilities."; maxTokens = 4096; }
  var modeOpts = { systemPrompt: sysPrompt, maxTokens: maxTokens };
  var promises = targetModelIds.map(async function(modelId) {
    try {
      var result = await callModel(modelId, userId, history, modeOpts);
      if (CLOUD_PROVIDERS[modelId] && result.tokens > 0) {
        pool.query("UPDATE ai_connections SET tokens_used = COALESCE(tokens_used, 0) + $1, last_used = NOW() WHERE user_id = $2 AND provider = $3", [result.tokens, userId, modelId]).catch(function() {});
      }
      var name = CLOUD_PROVIDERS[modelId] ? CLOUD_PROVIDERS[modelId].name : (registry.getById(modelId) || {}).name || modelId;
      return { model: modelId, modelName: name, content: result.text, tokens: result.tokens, ts: new Date().toISOString() };
    } catch (err) {
      var name2 = CLOUD_PROVIDERS[modelId] ? CLOUD_PROVIDERS[modelId].name : (registry.getById(modelId) || {}).name || modelId;
      return { model: modelId, modelName: name2, content: "Fehler: " + err.message, tokens: 0, error: true, ts: new Date().toISOString() };
    }
  });
  var results = await Promise.all(promises);
  results.forEach(function(r) { session.messages.push({ role: "assistant", model: r.model, content: r.content }); });
  res.json({ sessionId: session.id, responses: results });
});

router.post("/marathon", async function(req, res) {
  var userId = req.user ? req.user.id : null;
  if (!userId) return res.status(401).json({ error: "Auth required" });
  var tasks = req.body.tasks;
  var models = req.body.models;
  if (!tasks || !Array.isArray(tasks) || !tasks.length) return res.status(400).json({ error: "Tasks required" });
  var availableModels = models || [];
  if (!availableModels.length) {
    try {
      var r = await fetch("http://127.0.0.1:3200/api/models");
      var data = await r.json();
      var running = await getRunningModels();
      var runningIds = running.map(function(r2) { return r2.id; });
      (data.models || []).forEach(function(m) { if (runningIds.indexOf(m.id) >= 0) availableModels.push(m.id); });
    } catch(e) {}
    try {
      var rows = await pool.query("SELECT provider FROM ai_connections WHERE user_id = $1 AND status = $2", [userId, "active"]);
      rows.rows.forEach(function(row) { if (CLOUD_PROVIDERS[row.provider]) availableModels.push(row.provider); });
    } catch(e) {}
    if (!availableModels.length) availableModels = ["anthropic"];
  }
  var assignments = tasks.map(function(task, i) {
    var modelId = availableModels[i % availableModels.length];
    var name = CLOUD_PROVIDERS[modelId] ? CLOUD_PROVIDERS[modelId].name : (registry.getById(modelId) || {}).name || modelId;
    return { task: task, modelId: modelId, model: modelId, modelName: name };
  });
  var promises = assignments.map(async function(a) {
    try {
      var result = await callModel(a.modelId, userId, [{ role: "user", content: a.task }]);
      return Object.assign({}, a, { status: "done", result: result.text, tokens: result.tokens });
    } catch (err) {
      return Object.assign({}, a, { status: "error", result: "Fehler: " + err.message, tokens: 0 });
    }
  });
  var results = await Promise.all(promises);
  res.json({ marathonId: crypto.randomUUID(), results: results });
});

module.exports = router;
