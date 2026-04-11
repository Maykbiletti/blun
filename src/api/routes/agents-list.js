const { Router } = require("express");
const { query } = require("../../db");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

async function fetchFromBlunTables() {
  const sql = `
    SELECT
      a.id,
      a.name,
      a.model,
      a.status,
      COALESCE(s.tasks_completed, 0)::int AS "tasksCompleted",
      COALESCE(ROUND(s.avg_duration_seconds::numeric, 2), 0)::float AS "avgDuration"
    FROM blun_agents a
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE t.status IN ('completed', 'done')
        ) AS tasks_completed,
        AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) FILTER (
          WHERE t.status IN ('completed', 'done')
            AND t.completed_at IS NOT NULL
        ) AS avg_duration_seconds
      FROM agent_tasks t
      WHERE t.agent_id = a.id
    ) s ON TRUE
    WHERE a.status = 'active'
    ORDER BY a.name ASC
  `;

  return query(sql);
}

async function fetchFromCoreTables() {
  const sql = `
    SELECT
      a.id,
      a.name,
      a.model,
      a.status,
      COALESCE(s.tasks_completed, 0)::int AS "tasksCompleted",
      COALESCE(ROUND(s.avg_duration_seconds::numeric, 2), 0)::float AS "avgDuration"
    FROM agents a
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE t.status IN ('completed', 'done')
        ) AS tasks_completed,
        AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) FILTER (
          WHERE t.status IN ('completed', 'done')
            AND t.completed_at IS NOT NULL
        ) AS avg_duration_seconds
      FROM tasks t
      WHERE t.agent_id = a.id
    ) s ON TRUE
    WHERE a.status = 'active'
    ORDER BY a.name ASC
  `;

  return query(sql);
}

async function loadActiveAgents() {
  try {
    return await fetchFromBlunTables();
  } catch (err) {
    const message = String(err && err.message ? err.message : "").toLowerCase();
    const missingBlunTable =
      message.includes("relation \"blun_agents\"") ||
      message.includes("relation \"agent_tasks\"");

    if (!missingBlunTable) {
      throw err;
    }

    return fetchFromCoreTables();
  }
}

router.get("/", requireAuth, async function getAgentsList(req, res) {
  try {
    const rows = await loadActiveAgents();
    res.json(rows);
  } catch (err) {
    console.error("[agents-list] GET /api/agents failed:", err.message);
    res.status(500).json({
      error: "Failed to load active agents"
    });
  }
});

module.exports = router;
