// BLUN - Agents List API Route

var express = require("express");
var router = express.Router();
var db = require("../../db");

function toSafeInt(value) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed);
}

function toSafeDurationSeconds(value) {
  var parsed = Number(value);
  if (!isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed);
}

function mapAgent(row) {
  return {
    id: row.id,
    name: row.name || "",
    model: row.model || "",
    status: row.status || "unknown",
    tasksCompleted: toSafeInt(row.tasks_completed),
    avgDuration: toSafeDurationSeconds(row.avg_duration_seconds)
  };
}

function buildAgentsQuery() {
  return [
    "SELECT",
    "  a.id,",
    "  a.name,",
    "  a.model,",
    "  a.status,",
    "  COALESCE(COUNT(t.id) FILTER (WHERE t.status = 'completed'), 0)::int AS tasks_completed,",
    "  COALESCE(",
    "    AVG(",
    "      EXTRACT(EPOCH FROM (t.completed_at - t.created_at))",
    "    ) FILTER (",
    "      WHERE t.status = 'completed'",
    "        AND t.created_at IS NOT NULL",
    "        AND t.completed_at IS NOT NULL",
    "        AND t.completed_at >= t.created_at",
    "    ),",
    "    0",
    "  )::numeric AS avg_duration_seconds",
    "FROM blun_agents a",
    "LEFT JOIN agent_tasks t ON t.agent_id = a.id",
    "WHERE a.status = $1",
    "GROUP BY a.id, a.name, a.model, a.status",
    "ORDER BY a.name ASC"
  ].join(" ");
}

router.get("/api/agents", async function(req, res) {
  var sql = buildAgentsQuery();
  var params = ["active"];

  try {
    var rows = await db.query(sql, params);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.json([]);
    }

    var payload = rows.map(mapAgent);
    return res.json(payload);
  } catch (error) {
    console.error(
      "GET /api/agents failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to load active agents" });
  }
});

module.exports = router;
