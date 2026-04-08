// BLUN - AI Organisator | MIT License
const express = require("express");
const os = require("os");
const { execSync } = require("child_process");
const { pool } = require("../db");
const { requireAdmin } = require("../middleware/auth");

var router = express.Router();
router.use(requireAdmin);

// In-memory request counter
var requestCount = 0;
var requestCountSince = Date.now();

function getRequestCounter() { return { count: requestCount, since: new Date(requestCountSince).toISOString() }; }
function incrementRequestCounter() { requestCount++; }
function resetRequestCounter() { requestCount = 0; requestCountSince = Date.now(); }

// GET / — full system status
router.get("/", async function(req, res) {
  try {
    // CPU
    var cpus = os.cpus();
    var totalIdle = 0, totalTick = 0;
    for (var c of cpus) {
      for (var t in c.times) totalTick += c.times[t];
      totalIdle += c.times.idle;
    }
    var cpuPercent = Math.round((1 - totalIdle / totalTick) * 100);

    // RAM
    var totalMem = os.totalmem();
    var freeMem = os.freemem();
    var usedMem = totalMem - freeMem;
    var ramPercent = Math.round(usedMem / totalMem * 100);

    // Disk
    var diskRaw = "";
    try { diskRaw = execSync("df -h / | tail -1").toString().trim(); } catch(e) {}
    var diskParts = diskRaw.split(/\s+/);
    var disk = { total: diskParts[1] || "?", used: diskParts[2] || "?", available: diskParts[3] || "?", percent: diskParts[4] || "?" };

    // Llama processes
    var llamaProcs = [];
    try {
      var psOut = execSync("ps aux | grep llama-server | grep -v grep").toString().trim();
      if (psOut) {
        for (var line of psOut.split("\n")) {
          var parts = line.split(/\s+/);
          var pid = parts[1];
          var ramMb = Math.round(parseFloat(parts[5]) / 1024);
          var cmdParts = parts.slice(10).join(" ");
          var portMatch = cmdParts.match(/--port\s+(\d+)/);
          var modelMatch = cmdParts.match(/--model\s+(\S+)/);
          llamaProcs.push({
            pid: pid,
            ram_mb: ramMb,
            port: portMatch ? portMatch[1] : "?",
            model: modelMatch ? modelMatch[1].split("/").pop() : "?"
          });
        }
      }
    } catch(e) {}

    // Active sessions
    var sessionCount = 0;
    try {
      var sr = await pool.query("SELECT count(*) FROM sessions WHERE updated_at > NOW() - INTERVAL 15 minutes");
      sessionCount = parseInt(sr.rows[0].count);
    } catch(e) {}

    // Uptime
    var uptimeSec = os.uptime();

    res.json({
      cpu: { percent: cpuPercent, cores: cpus.length },
      ram: { total_gb: (totalMem / 1073741824).toFixed(1), used_gb: (usedMem / 1073741824).toFixed(1), percent: ramPercent },
      disk: disk,
      llama_processes: llamaProcs,
      active_sessions: sessionCount,
      requests: getRequestCounter(),
      uptime_hours: Math.round(uptimeSec / 3600),
      overloaded: ramPercent > 85
    });
  } catch(e) {
    console.error("[monitor] GET:", e.message);
    res.status(500).json({ error: "Monitor failed" });
  }
});

// GET /stats — lightweight system stats
router.get("/stats", function(req, res) {
  res.json({
    uptime: os.uptime(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    loadavg: os.loadavg()
  });
});

// POST /reset-counter
router.post("/reset-counter", function(req, res) {
  resetRequestCounter();
  res.json({ ok: true });
});

module.exports = router;
module.exports.incrementRequestCounter = incrementRequestCounter;
