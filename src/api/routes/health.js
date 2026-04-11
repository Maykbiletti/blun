// BLUN - Health API Route

var express = require("express");
var router = express.Router();
var db = require("../../db");

function toSafeInt(value) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function getUptimeSeconds() {
  var uptime = Number(process.uptime());
  if (!isFinite(uptime) || uptime < 0) {
    return 0;
  }
  return Math.floor(uptime);
}

function buildHealthStatsQuery() {
  return [
    "SELECT",
    "  (SELECT COUNT(*)::int FROM blun_agents WHERE status = 'active') AS agents_online,",
    "  (SELECT COUNT(*)::int FROM agent_tasks WHERE status = 'pending') AS pending_tasks,",
    "  (SELECT COUNT(*)::int FROM agent_tasks WHERE status IN ('processing', 'in_progress')) AS processing_tasks"
  ].join(" ");
}

router.get("/api/health", async function(req, res) {
  try {
    var rows = await db.query(buildHealthStatsQuery());
    var stats = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};

    return res.json({
      status: "ok",
      uptime: getUptimeSeconds(),
      agents_online: toSafeInt(stats.agents_online),
      pending_tasks: toSafeInt(stats.pending_tasks),
      processing_tasks: toSafeInt(stats.processing_tasks)
    });
  } catch (error) {
    console.error(
      "GET /api/health failed:",
      error && error.message ? error.message : error
    );

    return res.status(503).json({
      status: "degraded",
      uptime: getUptimeSeconds(),
      agents_online: 0,
      pending_tasks: 0,
      processing_tasks: 0
    });
  }
});

module.exports = router;
