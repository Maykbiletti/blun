// BLUN - Agents List API Route

var express = require("express");
var router = express.Router();
var db = require("../../db");

function normalizeDurationSeconds(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  var n = Number(value);
  if (!isFinite(n) || n < 0) {
    return 0;
  }

  return Math.round(n);
}

function normalizeCount(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  var n = Number(value);
  if (!isFinite(n) || n < 0) {
    return 0;
  }

  return Math.round(n);
}

function mapAgentRow(row) {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    status: row.status,
    tasksCompleted: normalizeCount(row.tasks_completed),
    avgDuration: normalizeDurationSeconds(row.avg_duration_seconds)
  };
}

router.get("/api/agents", async function(req, res) {
  try {
    var sql = [
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
      "        AND t.completed_at IS NOT NULL",
      "        AND t.created_at IS NOT NULL",
      "        AND t.completed_at >= t.created_at",
      "    ),",
      "    0",
      "  )::numeric AS avg_duration_seconds",
      "FROM blun_agents a",
      "LEFT JOIN agent_tasks t ON t.agent_id = a.id",
      "WHERE a.status = 'active'",
      "GROUP BY a.id, a.name, a.model, a.status",
      "ORDER BY a.name ASC"
    ].join(" ");

    var rows = await db.query(sql, []);

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.json([]);
    }

    var result = rows.map(mapAgentRow);
    return res.json(result);
  } catch (error) {
    console.error("GET /api/agents failed:", error && error.message ? error.message : error);
    return res.status(500).json({
      error: "Failed to load active agents"
    });
  }
});

module.exports = router;
