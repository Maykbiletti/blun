const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/daily", async function (req, res) {
  try {
    const [totals, perAgent] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'completed' AND completed_at::date = CURRENT_DATE)::int AS completed_today,
           COUNT(*) FILTER (
             WHERE status IN ('failed', 'error', 'completed_no_code')
               AND COALESCE(completed_at, created_at)::date = CURRENT_DATE
           )::int AS failed_today
         FROM agent_tasks`
      ),
      query(
        `SELECT
           a.name,
           COUNT(*) FILTER (WHERE t.status = 'completed' AND t.completed_at::date = CURRENT_DATE)::int AS completed,
           COUNT(*) FILTER (
             WHERE t.status IN ('failed', 'error', 'completed_no_code')
               AND COALESCE(t.completed_at, t.created_at)::date = CURRENT_DATE
           )::int AS failed
         FROM blun_agents a
         LEFT JOIN agent_tasks t ON t.agent_id = a.id
         GROUP BY a.id, a.name
         ORDER BY a.name ASC`
      )
    ]);

    const totalRow = totals[0] || { completed_today: 0, failed_today: 0 };

    res.json({
      completedToday: totalRow.completed_today,
      failedToday: totalRow.failed_today,
      perAgent: perAgent.map(function (row) {
        return {
          name: row.name,
          completed: row.completed,
          failed: row.failed
        };
      })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
