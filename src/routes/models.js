// BLUN — Model Browser API Routes
var express = require("express");
var router = express.Router();
var { execFile, spawn } = require("child_process");
var registry = require("../models/registry");

// Track active downloads: modelId -> { process, progress, status }
var downloads = {};

// Helper: get installed models from ollama
function getInstalledModels(cb) {
  execFile("ollama", ["list"], function(err, stdout) {
    if (err) return cb(err, []);
    var lines = stdout.trim().split("\n").slice(1); // skip header
    var installed = [];
    lines.forEach(function(line) {
      var parts = line.trim().split(/\s+/);
      if (parts[0]) installed.push(parts[0]);
    });
    cb(null, installed);
  });
}

// GET /api/models — list all models with status
router.get("/", function(req, res) {
  getInstalledModels(function(err, installed) {
    var models = registry.getAll().map(function(m) {
      var status = "available";
      if (downloads[m.id] && downloads[m.id].status === "downloading") {
        status = "downloading";
      } else if (installed.indexOf(m.id) !== -1) {
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
    res.json({ models: models, installed: installed.length });
  });
});

// POST /api/models/:id/download — start download
router.post("/:id/download", function(req, res) {
  var modelId = req.params.id;
  var model = registry.getById(modelId);
  if (!model) return res.status(404).json({ error: "Model not found" });
  if (downloads[modelId] && downloads[modelId].status === "downloading") {
    return res.json({ message: "Already downloading", status: "downloading" });
  }

  downloads[modelId] = { status: "downloading", progress: 0, error: null };

  var proc = spawn("ollama", ["pull", modelId]);
  downloads[modelId].process = proc;

  proc.stderr.on("data", function(data) {
    var line = data.toString();
    // Parse progress from ollama output like "pulling abc123... 45% |####     |"
    var match = line.match(/(\d+)%/);
    if (match) {
      downloads[modelId].progress = parseInt(match[1], 10);
    }
  });

  proc.stdout.on("data", function(data) {
    var line = data.toString();
    var match = line.match(/(\d+)%/);
    if (match) {
      downloads[modelId].progress = parseInt(match[1], 10);
    }
  });

  proc.on("close", function(code) {
    if (code === 0) {
      downloads[modelId].status = "installed";
      downloads[modelId].progress = 100;
    } else {
      downloads[modelId].status = "error";
      downloads[modelId].error = "Download failed (exit code " + code + ")";
    }
  });

  res.json({ message: "Download started", status: "downloading" });
});

// DELETE /api/models/:id — remove installed model
router.delete("/:id", function(req, res) {
  var modelId = req.params.id;
  var model = registry.getById(modelId);
  if (!model) return res.status(404).json({ error: "Model not found" });

  execFile("ollama", ["rm", modelId], function(err) {
    if (err) return res.status(500).json({ error: "Failed to remove model" });
    delete downloads[modelId];
    res.json({ message: "Model removed", status: "available" });
  });
});

// GET /api/models/:id/status — download progress
router.get("/:id/status", function(req, res) {
  var modelId = req.params.id;
  var dl = downloads[modelId];
  if (!dl) {
    // Check if installed
    getInstalledModels(function(err, installed) {
      if (installed.indexOf(modelId) !== -1) {
        return res.json({ status: "installed", progress: 100 });
      }
      res.json({ status: "available", progress: 0 });
    });
    return;
  }
  res.json({ status: dl.status, progress: dl.progress, error: dl.error || null });
});

module.exports = router;
