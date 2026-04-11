const { Router } = require('express');
const { query } = require('../../db');

const router = Router();

router.get('/analytics/agent-efficiency', async function (req, res) {
  try {
    const rows = await query(
      `SELECT
         a.id AS agent_id,
         a.name AS agent_name,
         COUNT(t.id)::int AS completed_tasks,
         ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)))::numeric, 2) AS avg_task_seconds
       FROM agents a
       LEFT JOIN tasks t
         ON t.agent_id = a.id
        AND t.created_at IS NOT NULL
        AND t.completed_at IS NOT NULL
       GROUP BY a.id, a.name
       ORDER BY avg_task_seconds ASC NULLS LAST, completed_tasks DESC, a.name ASC`
    );

    const data = rows.map(function (row) {
      const seconds = row.avg_task_seconds === null ? null : Number(row.avg_task_seconds);
      return {
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        completed_tasks: row.completed_tasks,
        avg_task_seconds: seconds,
        avg_task_minutes: seconds === null ? null : Number((seconds / 60).toFixed(2))
      };
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/task-distribution', async function (req, res) {
  try {
    const [statusRows, agentRows] = await Promise.all([
      query(
        `SELECT
           COALESCE(status, 'unknown') AS status,
           COUNT(*)::int AS task_count
         FROM tasks
         GROUP BY COALESCE(status, 'unknown')
         ORDER BY task_count DESC, status ASC`
      ),
      query(
        `SELECT
           a.id AS agent_id,
           a.name AS agent_name,
           COALESCE(t.status, 'unknown') AS status,
           COUNT(t.id)::int AS task_count
         FROM agents a
         LEFT JOIN tasks t ON t.agent_id = a.id
         WHERE t.id IS NOT NULL
         GROUP BY a.id, a.name, COALESCE(t.status, 'unknown')
         ORDER BY a.name ASC, status ASC`
      )
    ]);

    const total_tasks = statusRows.reduce(function (sum, row) {
      return sum + Number(row.task_count || 0);
    }, 0);

    res.json({
      total_tasks,
      by_status: statusRows,
      by_agent_status: agentRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
