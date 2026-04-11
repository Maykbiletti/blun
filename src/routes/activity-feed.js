const { Router } = require('express');
const { query } = require('../db');

const router = Router();

router.get('/activity-feed', async function (req, res) {
  try {
    const rows = await query(
      `SELECT
         e.timestamp,
         e.agent_name,
         e.task_title,
         e.action
       FROM (
         SELECT
           t.created_at AS timestamp,
           COALESCE(a.name, 'Unknown Agent') AS agent_name,
           t.task AS task_title,
           ('status:' || t.status) AS action
         FROM agent_tasks t
         LEFT JOIN blun_agents a ON a.id = t.agent_id

         UNION ALL

         SELECT
           t.completed_at AS timestamp,
           COALESCE(a.name, 'Unknown Agent') AS agent_name,
           t.task AS task_title,
           'completed' AS action
         FROM agent_tasks t
         LEFT JOIN blun_agents a ON a.id = t.agent_id
         WHERE t.completed_at IS NOT NULL
       ) e
       ORDER BY e.timestamp DESC
       LIMIT 50`
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
