const { Router } = require('express');
const { query } = require('../../db');

const router = Router();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, decimals) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (decimals === undefined) return num;
  return Number(num.toFixed(decimals));
}

router.get('/analytics/agent-efficiency', async function (req, res) {
  try {
    const lookbackDays = clamp(parsePositiveInt(req.query.days, 30), 1, 365);
    const limit = clamp(parsePositiveInt(req.query.limit, 25), 1, 250);

    const rows = await query(
      `SELECT
         a.id AS agent_id,
         a.name AS agent_name,
         COUNT(t.id)::int AS completed_tasks,
         ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)))::numeric, 2) AS avg_task_seconds,
         ROUND(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)))::numeric, 2) AS total_task_seconds
       FROM agents a
       LEFT JOIN tasks t
         ON t.agent_id = a.id
        AND t.created_at IS NOT NULL
        AND t.completed_at IS NOT NULL
        AND t.completed_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY a.id, a.name
       ORDER BY avg_task_seconds ASC NULLS LAST, completed_tasks DESC, a.name ASC
       LIMIT $2`,
      [lookbackDays, limit]
    );

    const data = rows.map(function (row) {
      const avgSeconds = toNumber(row.avg_task_seconds, 2);
      const totalSeconds = toNumber(row.total_task_seconds, 2);
      return {
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        completed_tasks: Number(row.completed_tasks || 0),
        avg_task_seconds: avgSeconds,
        avg_task_minutes: avgSeconds === null ? null : toNumber(avgSeconds / 60, 2),
        total_task_seconds: totalSeconds,
        total_task_hours: totalSeconds === null ? null : toNumber(totalSeconds / 3600, 2)
      };
    });

    res.json({
      lookback_days: lookbackDays,
      limit,
      agents: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/task-distribution', async function (req, res) {
  try {
    const lookbackDays = clamp(parsePositiveInt(req.query.days, 90), 1, 365);

    const [statusRows, agentRows] = await Promise.all([
      query(
        `SELECT
           COALESCE(t.status, 'unknown') AS status,
           COUNT(*)::int AS task_count
         FROM tasks t
         WHERE t.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY COALESCE(t.status, 'unknown')
         ORDER BY task_count DESC, status ASC`,
        [lookbackDays]
      ),
      query(
        `SELECT
           a.id AS agent_id,
           a.name AS agent_name,
           COALESCE(t.status, 'unknown') AS status,
           COUNT(t.id)::int AS task_count
         FROM agents a
         LEFT JOIN tasks t
           ON t.agent_id = a.id
          AND t.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         WHERE t.id IS NOT NULL
         GROUP BY a.id, a.name, COALESCE(t.status, 'unknown')
         ORDER BY a.name ASC, status ASC`,
        [lookbackDays]
      )
    ]);

    const totalTasks = statusRows.reduce(function (sum, row) {
      return sum + Number(row.task_count || 0);
    }, 0);

    res.json({
      lookback_days: lookbackDays,
      total_tasks: totalTasks,
      by_status: statusRows.map(function (row) {
        return {
          status: row.status,
          task_count: Number(row.task_count || 0)
        };
      }),
      by_agent_status: agentRows.map(function (row) {
        return {
          agent_id: row.agent_id,
          agent_name: row.agent_name,
          status: row.status,
          task_count: Number(row.task_count || 0)
        };
      })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics/throughput', async function (req, res) {
  try {
    const lookbackDays = clamp(parsePositiveInt(req.query.days, 30), 1, 180);

    const rows = await query(
      `SELECT
         DATE_TRUNC('day', t.created_at) AS day,
         COUNT(*)::int AS created_tasks,
         COUNT(*) FILTER (WHERE t.status = 'done')::int AS done_tasks,
         COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed_tasks
       FROM tasks t
       WHERE t.created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY DATE_TRUNC('day', t.created_at)
       ORDER BY day ASC`,
      [lookbackDays]
    );

    res.json({
      lookback_days: lookbackDays,
      series: rows.map(function (row) {
        const created = Number(row.created_tasks || 0);
        const done = Number(row.done_tasks || 0);
        const failed = Number(row.failed_tasks || 0);
        return {
          day: row.day,
          created_tasks: created,
          done_tasks: done,
          failed_tasks: failed,
          done_rate: created === 0 ? null : toNumber((done / created) * 100, 2)
        };
      })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
