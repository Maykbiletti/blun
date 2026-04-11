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
    const minCompleted = clamp(parsePositiveInt(req.query.min_completed, 1), 0, 10000);
    const companyId = req.query.company_id ? Number.parseInt(req.query.company_id, 10) : null;
    const includeInactive = String(req.query.include_inactive || '').toLowerCase() === 'true';

    const tableAvailability = await query(
      `SELECT
         to_regclass('public.agent_tasks') IS NOT NULL AS has_agent_tasks,
         to_regclass('public.blun_agents') IS NOT NULL AS has_blun_agents,
         to_regclass('public.tasks') IS NOT NULL AS has_tasks,
         to_regclass('public.agents') IS NOT NULL AS has_agents`
    );

    const hasAgentTasks = Boolean(tableAvailability[0] && tableAvailability[0].has_agent_tasks);
    const hasBlunAgents = Boolean(tableAvailability[0] && tableAvailability[0].has_blun_agents);
    const hasTasks = Boolean(tableAvailability[0] && tableAvailability[0].has_tasks);
    const hasAgents = Boolean(tableAvailability[0] && tableAvailability[0].has_agents);

    let tasksTable = null;
    let agentsTable = null;
    let usesBlunSchema = false;

    if (hasAgentTasks && hasBlunAgents) {
      tasksTable = 'agent_tasks';
      agentsTable = 'blun_agents';
      usesBlunSchema = true;
    } else if (hasTasks && hasAgents) {
      tasksTable = 'tasks';
      agentsTable = 'agents';
      usesBlunSchema = false;
    } else {
      return res.status(500).json({
        error: 'Analytics schema unavailable',
        details: {
          has_agent_tasks: hasAgentTasks,
          has_blun_agents: hasBlunAgents,
          has_tasks: hasTasks,
          has_agents: hasAgents
        }
      });
    }

    const params = [lookbackDays, limit, minCompleted];
    let companyFilterSql = '';
    let statusFilterSql = '';
    let activeFilterSql = '';

    if (Number.isFinite(companyId) && companyId > 0) {
      params.push(companyId);
      companyFilterSql = `AND a.company_id = $${params.length}`;
    }

    if (usesBlunSchema) {
      statusFilterSql = "AND COALESCE(t.status, '') IN ('completed', 'failed', 'error', 'completed_no_code', 'done')";
      if (!includeInactive) {
        activeFilterSql = "AND COALESCE(a.status, 'active') NOT IN ('deleted', 'archived')";
      }
    } else {
      statusFilterSql = "AND COALESCE(t.status, '') IN ('done', 'cancelled', 'failed', 'completed', 'error')";
      if (!includeInactive) {
        activeFilterSql = "AND COALESCE(a.status, 'active') != 'deleted'";
      }
    }

    const sql = `
      WITH task_scope AS (
        SELECT
          t.id,
          t.agent_id,
          t.status,
          t.created_at,
          t.completed_at,
          t.score
        FROM ${tasksTable} t
        WHERE t.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          ${statusFilterSql}
      ),
      agent_scope AS (
        SELECT
          a.id AS agent_id,
          a.name AS agent_name,
          a.role AS agent_role,
          a.department AS agent_department,
          a.company_id,
          a.status AS agent_status
        FROM ${agentsTable} a
        WHERE 1=1
          ${companyFilterSql}
          ${activeFilterSql}
      ),
      per_agent AS (
        SELECT
          a.agent_id,
          a.agent_name,
          a.agent_role,
          a.agent_department,
          a.company_id,
          a.agent_status,
          COUNT(ts.id)::int AS task_count_total,
          COUNT(ts.id) FILTER (WHERE ts.status IN ('completed', 'done'))::int AS completed_tasks,
          COUNT(ts.id) FILTER (WHERE ts.status IN ('failed', 'error', 'cancelled', 'completed_no_code'))::int AS failed_tasks,
          AVG(EXTRACT(EPOCH FROM (ts.completed_at - ts.created_at)))
            FILTER (WHERE ts.completed_at IS NOT NULL AND ts.created_at IS NOT NULL AND ts.completed_at >= ts.created_at)
            AS avg_cycle_seconds,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ts.completed_at - ts.created_at)))
            FILTER (WHERE ts.completed_at IS NOT NULL AND ts.created_at IS NOT NULL AND ts.completed_at >= ts.created_at)
            AS median_cycle_seconds,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ts.completed_at - ts.created_at)))
            FILTER (WHERE ts.completed_at IS NOT NULL AND ts.created_at IS NOT NULL AND ts.completed_at >= ts.created_at)
            AS p90_cycle_seconds,
          SUM(EXTRACT(EPOCH FROM (ts.completed_at - ts.created_at)))
            FILTER (WHERE ts.completed_at IS NOT NULL AND ts.created_at IS NOT NULL AND ts.completed_at >= ts.created_at)
            AS total_cycle_seconds,
          AVG(ts.score)::numeric AS avg_score,
          MAX(ts.completed_at) AS last_completed_at
        FROM agent_scope a
        LEFT JOIN task_scope ts ON ts.agent_id = a.agent_id
        GROUP BY
          a.agent_id, a.agent_name, a.agent_role, a.agent_department, a.company_id, a.agent_status
      ),
      scored AS (
        SELECT
          p.*,
          CASE
            WHEN p.completed_tasks + p.failed_tasks = 0 THEN NULL
            ELSE (p.completed_tasks::numeric / (p.completed_tasks + p.failed_tasks)::numeric) * 100
          END AS success_rate,
          (p.completed_tasks::numeric / GREATEST($1::numeric, 1)) AS completed_per_day,
          CASE
            WHEN p.avg_cycle_seconds IS NULL OR p.avg_cycle_seconds <= 0 THEN NULL
            ELSE 3600::numeric / p.avg_cycle_seconds
          END AS tasks_per_hour
        FROM per_agent p
      ),
      ranked AS (
        SELECT
          s.*,
          CASE
            WHEN s.success_rate IS NULL AND s.tasks_per_hour IS NULL THEN NULL
            ELSE (
              COALESCE(s.success_rate, 0) * 0.55 +
              LEAST(COALESCE(s.tasks_per_hour, 0), 25) * 1.8 +
              LEAST(COALESCE(s.completed_per_day, 0), 20) * 1.4
            )
          END AS efficiency_score,
          RANK() OVER (
            ORDER BY
              CASE
                WHEN s.success_rate IS NULL AND s.tasks_per_hour IS NULL THEN -1
                ELSE (
                  COALESCE(s.success_rate, 0) * 0.55 +
                  LEAST(COALESCE(s.tasks_per_hour, 0), 25) * 1.8 +
                  LEAST(COALESCE(s.completed_per_day, 0), 20) * 1.4
                )
              END DESC,
              s.completed_tasks DESC,
              s.agent_name ASC
          ) AS efficiency_rank
        FROM scored s
      )
      SELECT
        *
      FROM ranked
      WHERE completed_tasks >= $3
      ORDER BY efficiency_rank ASC, agent_name ASC
      LIMIT $2`;

    const rows = await query(sql, params);
    const agents = rows.map(function (row) {
      const avgSeconds = toNumber(row.avg_cycle_seconds, 2);
      const medianSeconds = toNumber(row.median_cycle_seconds, 2);
      const p90Seconds = toNumber(row.p90_cycle_seconds, 2);
      const totalSeconds = toNumber(row.total_cycle_seconds, 2);
      const completed = Number(row.completed_tasks || 0);
      const failed = Number(row.failed_tasks || 0);
      return {
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        agent_role: row.agent_role || null,
        agent_department: row.agent_department || null,
        company_id: row.company_id || null,
        agent_status: row.agent_status || null,
        completed_tasks: completed,
        failed_tasks: failed,
        total_tasks: Number(row.task_count_total || 0),
        success_rate: toNumber(row.success_rate, 2),
        completed_per_day: toNumber(row.completed_per_day, 3),
        tasks_per_hour: toNumber(row.tasks_per_hour, 3),
        avg_cycle_seconds: avgSeconds,
        avg_cycle_minutes: avgSeconds === null ? null : toNumber(avgSeconds / 60, 2),
        median_cycle_seconds: medianSeconds,
        median_cycle_minutes: medianSeconds === null ? null : toNumber(medianSeconds / 60, 2),
        p90_cycle_seconds: p90Seconds,
        p90_cycle_minutes: p90Seconds === null ? null : toNumber(p90Seconds / 60, 2),
        total_cycle_seconds: totalSeconds,
        total_cycle_hours: totalSeconds === null ? null : toNumber(totalSeconds / 3600, 2),
        avg_score: toNumber(row.avg_score, 2),
        efficiency_score: toNumber(row.efficiency_score, 2),
        efficiency_rank: Number(row.efficiency_rank || 0),
        last_completed_at: row.last_completed_at || null
      };
    });

    res.json({
      lookback_days: lookbackDays,
      limit: limit,
      min_completed: minCompleted,
      include_inactive: includeInactive,
      company_id: Number.isFinite(companyId) && companyId > 0 ? companyId : null,
      schema: {
        tasks_table: tasksTable,
        agents_table: agentsTable
      },
      count: agents.length,
      agents: agents
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
