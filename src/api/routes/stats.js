// BLUN - Stats API Route

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

function toSafeRate(value) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0) {
    return 0;
  }
  if (parsed > 100) {
    return 100;
  }
  return Math.round(parsed * 100) / 100;
}

function buildStatsQuery() {
  return [
    "SELECT",
    "  COALESCE((SELECT COUNT(*) FROM blun_agents WHERE status = 'active'), 0)::int AS agents_online,",
    "  COALESCE((SELECT COUNT(*) FROM agent_tasks WHERE status IN ('completed', 'done')), 0)::int AS tasks_completed,",
    "  COALESCE((SELECT COUNT(*) FROM agent_tasks WHERE status = 'pending'), 0)::int AS tasks_pending,",
    "  COALESCE((",
    "    SELECT ROUND(",
    "      100.0 * COUNT(*) FILTER (WHERE status IN ('completed', 'done'))",
    "      / NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'done', 'failed', 'cancelled')), 0),",
    "      2",
    "    )",
    "    FROM agent_tasks",
    "  ), 0)::numeric AS success_rate"
  ].join(" ");
}

router.get("/api/stats", async function(req, res) {
  try {
    var rows = await db.query(buildStatsQuery());
    var stats = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};

    return res.json({
      agents_online: toSafeInt(stats.agents_online),
      tasks_completed: toSafeInt(stats.tasks_completed),
      tasks_pending: toSafeInt(stats.tasks_pending),
      success_rate: toSafeRate(stats.success_rate)
    });
  } catch (error) {
    console.error(
      "GET /api/stats failed:",
      error && error.message ? error.message : error
    );

    return res.status(500).json({
      error: "Failed to load stats",
      agents_online: 0,
      tasks_completed: 0,
      tasks_pending: 0,
      success_rate: 0
    });
  }
});

module.exports = router;
