const { Router } = require("express");
const { query, queryOne } = require("../../../../db");

const router = Router({ mergeParams: true });
const PAGE_SIZE = 10;

router.get("/", async function (req, res) {
  try {
    const agentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({ error: "Invalid agent id" });
    }

    const pageRaw = Number.parseInt(req.query.page, 10);
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const offset = (page - 1) * PAGE_SIZE;

    const agent = await queryOne("SELECT id FROM blun_agents WHERE id = $1", [agentId]);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const totalRow = await queryOne(
      "SELECT COUNT(*)::int AS total FROM agent_tasks WHERE agent_id = $1",
      [agentId]
    );

    const total = totalRow ? totalRow.total : 0;
    const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 0;

    const tasks = await query(
      `SELECT id, agent_id, task, status, result, priority, parent_task_id, created_at, completed_at, updated_at
       FROM agent_tasks
       WHERE agent_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [agentId, PAGE_SIZE, offset]
    );

    const hasNext = offset + tasks.length < total;
    const hasPrev = page > 1;

    return res.json({
      tasks,
      pagination: {
        page,
        page_size: PAGE_SIZE,
        total,
        total_pages: totalPages,
        has_next: hasNext,
        has_prev: hasPrev,
        next_page: hasNext ? page + 1 : null,
        prev_page: hasPrev ? page - 1 : null,
      },
    });
  } catch (error) {
    console.error("GET /agents/:id/tasks error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
