// BLUN - AI Organisator | MIT License
// GET /agents/:id/tasks — list recent tasks for an agent with pagination

const { Router } = require("express");
const { query, queryOne } = require("../../../db");

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ error: "Invalid agent id" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const countRow = await queryOne(
      "SELECT COUNT(*)::int AS total FROM agent_tasks WHERE agent_id = $1",
      [agentId]
    );
    const total = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const tasks = await query(
      `SELECT id, agent_id, task, status, result, priority,
              parent_task_id, created_at, completed_at
         FROM agent_tasks
        WHERE agent_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );

    res.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    });
  } catch (err) {
    console.error("[api] GET /agents/:id/tasks error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
