const { Router } = require('express');
const { query, queryOne } = require('../../db');

const router = Router();

// GET /agents - list all agents with model/status
router.get('/', async function (req, res) {
  try {
    const rows = await query(
      'SELECT id, company_id, name, role, title, model, status, adapter_type, created_at, updated_at FROM agents ORDER BY name ASC, id ASC'
    );

    res.json({
      data: rows,
      count: rows.length,
    });
  } catch (err) {
    console.error('GET /agents error:', err.message);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /agents/:id - single agent details
router.get('/:id', async function (req, res) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid agent id' });
  }

  try {
    const agent = await queryOne(
      'SELECT a.*, c.name AS company_name FROM agents a LEFT JOIN companies c ON c.id = a.company_id WHERE a.id = $1',
      [id]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const taskStats = await queryOne(
      "SELECT COUNT(*)::int AS total_tasks, COUNT(*) FILTER (WHERE status IN ('pending','processing','in_progress'))::int AS open_tasks, COUNT(*) FILTER (WHERE status = 'done')::int AS done_tasks FROM tasks WHERE agent_id = $1",
      [id]
    );

    res.json({
      data: {
        ...agent,
        task_stats: taskStats || { total_tasks: 0, open_tasks: 0, done_tasks: 0 },
      },
    });
  } catch (err) {
    console.error('GET /agents/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch agent details' });
  }
});

module.exports = router;
