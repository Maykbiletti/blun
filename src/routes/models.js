// BLUN — Model Browser API Routes (llama.cpp backend)
var express = require("express");
var os = require("os");
var router = express.Router();
var { spawn } = require("child_process");
var fs = require("fs");
var path = require("path");
var fetch = require("node-fetch");
var registry = require("../models/registry");

var MODELS_DIR = path.join(__dirname, "../../models");

// Track downloads: modelId -> { progress, status, error }
var downloads = {};

// Track running llama-server processes: modelId -> { process, port, ready }
var running = {};

// Detect externally started llama-server processes
var externalRunning = {};
var { execSync } = require("child_process");
function refreshExternalRunning() {
  try {
    var ps = execSync("ps aux | grep llama-server | grep -v grep", {encoding:"utf8"});
    var lines = ps.trim().split("\n");
    externalRunning = {};
    lines.forEach(function(line) {
      var mMatch = line.match(/-m\s+(\S+)/);
      var pMatch = line.match(/--port\s+(\d+)/);
      if (mMatch) {
        var modelFile = mMatch[1].split("/").pop();
        var port = pMatch ? parseInt(pMatch[1]) : 0;
        externalRunning[modelFile] = { port: port };
      }
    });
  } catch(e) { externalRunning = {}; }
}
setInterval(refreshExternalRunning, 10000);
refreshExternalRunning();

// Next available port for llama-server instances
var nextPort = 8090;

// Ensure models dir exists
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Helper: check if GGUF file exists locally
function isInstalled(model) {
  return fs.existsSync(path.join(MODELS_DIR, model.filename));
}

// Helper: check if model is currently loaded (running)
function isRunning(modelId) {
  if (running[modelId]) return true;
  var model = registry.getById(modelId);
  return model && !!externalRunning[model.filename];
}

// GET /api/models — list all models with status
router.get("/", function(req, res) {
  var models = registry.getAll().map(function(m) {
    var status = "available";
    if (downloads[m.id] && downloads[m.id].status === "downloading") {
      status = "downloading";
    } else if (isRunning(m.id)) {
      status = "running";
    } else if (isInstalled(m)) {
      status = "installed";
    }
    var progress = downloads[m.id] ? downloads[m.id].progress : 0;
    return {
      id: m.id,
      name: m.name,
      maker: m.maker,
      description: m.description,
      size: m.size,
      sizeGB: m.sizeGB,
      ram: m.ram,
      category: m.category,
      tags: m.tags,
      status: status,
      progress: progress
    };
  });
  var installedCount = registry.getAll().filter(function(m) { return isInstalled(m); }).length;
  var runningCount = Object.keys(running).length;
  res.json({ models: models, installed: installedCount, running: runningCount });
});

// POST /api/models/:id/download — download GGUF from HuggingFace
router.post("/:id/download", function(req, res) {
  var modelId = req.params.id;
  var model = registry.getById(modelId);
  if (!model) return res.status(404).json({ error: "Model not found" });
  if (!model.huggingface) return res.status(400).json({ error: "No download URL" });
  if (isInstalled(model)) return res.json({ message: "Already installed", status: "installed" });
  if (downloads[modelId] && downloads[modelId].status === "downloading") {
    return res.json({ message: "Already downloading", status: "downloading" });
  }

  downloads[modelId] = { status: "downloading", progress: 0, error: null };

  var filePath = path.join(MODELS_DIR, model.filename);
  var tmpPath = filePath + ".tmp";

  var hfHeaders = {}; var hfToken = process.env.HF_TOKEN; if (hfToken) hfHeaders["Authorization"] = "Bearer " + hfToken;
  fetch(model.huggingface, { redirect: "follow", headers: hfHeaders })
    .then(function(response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      var totalBytes = parseInt(response.headers.get("content-length") || "0", 10);
      var receivedBytes = 0;
      var fileStream = fs.createWriteStream(tmpPath);

      response.body.on("data", function(chunk) {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          downloads[modelId].progress = Math.round((receivedBytes / totalBytes) * 100);
        }
      });

      response.body.pipe(fileStream);

      fileStream.on("finish", function() {
        fs.renameSync(tmpPath, filePath);
        downloads[modelId].status = "installed";
        downloads[modelId].progress = 100;
      });

      fileStream.on("error", function(err) {
        downloads[modelId].status = "error";
        downloads[modelId].error = err.message;
        try { fs.unlinkSync(tmpPath); } catch(e) {}
      });
    })
    .catch(function(err) {
      downloads[modelId].status = "error";
      downloads[modelId].error = err.message;
    });

  res.json({ message: "Download started", status: "downloading" });
});

// DELETE /api/models/:id — delete GGUF file
router.delete("/:id", function(req, res) {
  var modelId = req.params.id;
  var model = registry.getById(modelId);
  if (!model) return res.status(404).json({ error: "Model not found" });

  // Stop if running
  if (running[modelId]) {
    try { running[modelId].process.kill(); } catch(e) {}
    delete running[modelId];
  }

  var filePath = path.join(MODELS_DIR, model.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  delete downloads[modelId];
  res.json({ message: "Model removed", status: "available" });
});

// GET /api/models/:id/status — download progress
router.get("/:id/status", function(req, res) {
  var modelId = req.params.id;
  var model = registry.getById(modelId);
  var dl = downloads[modelId];
  if (dl) {
    return res.json({ status: dl.status, progress: dl.progress, error: dl.error || null });
  }
  if (model && isRunning(modelId)) {
    return res.json({ status: "running", progress: 100 });
  }
  if (model && isInstalled(model)) {
    return res.json({ status: "installed", progress: 100 });
  }
  res.json({ status: "available", progress: 0 });
});

// POST /api/models/:id/load — start llama-server for this model
router.post("/:id/load", function(req, res) {
  var modelId = req.params.id;
  var model = registry.getById(modelId);
  if (!model) return res.status(404).json({ error: "Model not found" });
  if (!isInstalled(model)) return res.status(400).json({ error: "Model not installed" });
  if (running[modelId]) return res.json({ message: "Already running", port: running[modelId].port });

  // RAM check
  var sizeStr = model.sizeGB || "0";
  var needGB = parseFloat(sizeStr);
  var freeBytes = os.freemem();
  var freeGB = freeBytes / (1024 * 1024 * 1024);
  if (needGB > freeGB) {
    return res.status(400).json({ error: "Nicht genug RAM (braucht " + needGB.toFixed(1) + " GB, verfuegbar: " + freeGB.toFixed(1) + " GB)" });
  }

  var port = nextPort++;
  var filePath = path.join(MODELS_DIR, model.filename);

  var proc = spawn("llama-server", [
    "-m", filePath,
    "--port", String(port),
    "--host", "127.0.0.1",
    "-c", "8192",
    "-t", "2",
    "--no-mmap"
  ], { stdio: ["ignore", "pipe", "pipe"], env: Object.assign({}, process.env, { LD_LIBRARY_PATH: "/opt/llama" }) });

  running[modelId] = { process: proc, port: port, ready: false };

  proc.stderr.on("data", function(data) {
    var line = data.toString();
    if (line.indexOf("listening") !== -1 || line.indexOf("server is listening") !== -1) {
      running[modelId].ready = true;
    }
  });

  proc.on("error", function(err) {
    delete running[modelId];
    downloads[modelId] = { status: "error", progress: 0, error: "Start fehlgeschlagen: " + err.message };
  });

  proc.on("close", function(code) {
    if (code && code !== 0 && !running[modelId]) {
      downloads[modelId] = { status: "error", progress: 0, error: "Modell abgestuerzt (exit " + code + ")" };
    }
    delete running[modelId];
  });

  res.json({ message: "Model starting", port: port });
});

// POST /api/models/:id/unload — stop llama-server
router.post("/:id/unload", function(req, res) {
  var modelId = req.params.id;
  // Check API-started models first
  if (running[modelId]) {
    try { running[modelId].process.kill(); } catch(e) {}
    delete running[modelId];
    return res.json({ message: "Model stopped", status: "installed" });
  }
  // Check externally started models
  var model = registry.getById(modelId);
  if (model && externalRunning[model.filename]) {
    var port = externalRunning[model.filename].port;
    try {
      var { execSync } = require("child_process");
      var ps = execSync("ps aux | grep llama-server | grep 'port " + port + "' | grep -v grep | awk '{print $2}'", {encoding:"utf8"}).trim();
      if (ps) { execSync("kill " + ps); }
      delete externalRunning[model.filename];
    } catch(e) {}
    return res.json({ message: "Model stopped (external)", status: "installed" });
  }
  res.status(400).json({ error: "Model not running" });
});

// POST /api/models/:id/chat — send message to loaded model
router.post("/:id/chat", function(req, res) {
  var modelId = req.params.id;
  if (!running[modelId]) return res.status(400).json({ error: "Model not running. Start it first." });

  var port = running[modelId].port;
  var messages = req.body.messages || [{ role: "user", content: req.body.message || "" }];

  fetch("http://127.0.0.1:" + port + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.choices && data.choices[0]) {
      res.json({
        response: data.choices[0].message.content,
        model: modelId,
        usage: data.usage || {}
      });
    } else {
      res.json({ response: "", error: "No response from model", raw: data });
    }
  })
  .catch(function(err) {
    res.status(500).json({ error: "Failed to reach model: " + err.message });
  });
});

// GET /api/models/running/list — list all running models
router.get("/running/list", function(req, res) {
  var list = [];
  Object.keys(running).forEach(function(id) {
    list.push({ id: id, port: running[id].port, ready: running[id].ready });
  });
  res.json({ running: list });
});

router.running = running;
router.externalRunning = externalRunning;
module.exports = router;
