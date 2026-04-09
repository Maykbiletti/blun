// BLUN - Dashboard Stats API | MIT License
/**
 * Dashboard Statistics Endpoint
 */

const { Router } = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/stats', requireAuth, async function (req, res) {
  try {
    const results = await Promise.all([
      query('SELECT COUNT(*)::int AS total_agents FROM agents'),
      query('SELECT COUNT(*)::int AS active_agents FROM agents WHERE status = $1', ['active']),
      query('SELECT COUNT(*)::int AS total_tasks FROM tasks'),
      query('SELECT COUNT(*)::int AS completed_tasks FROM tasks WHERE status = $1', ['done']),
      query('SELECT COUNT(*)::int AS failed_tasks FROM tasks WHERE status = $1', ['cancelled']),
      query('SELECT AVG(EXTRACT(epoch FROM (completed_at - created_at)))::numeric AS avg_completion_time_seconds FROM tasks WHERE status = $1 AND completed_at IS NOT NULL', ['done'])
    ]);

    const stats = {
      total_agents: results[0][0].total_agents,
      active_agents: results[1][0].active_agents,
      total_tasks: results[2][0].total_tasks,
      completed_tasks: results[3][0].completed_tasks,
      failed_tasks: results[4][0].failed_tasks,
      avg_completion_time_seconds: results[5][0].avg_completion_time_seconds || 0
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;