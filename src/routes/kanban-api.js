// BLUN - Kanban Task Board API | Endpoints für Status & Priority Update
const { Router } = require("express");
const { query, queryOne } = require("../db");
const { authenticate } = require("../middleware/auth");

const router = Router();
const API_KEY = process.env.BLUN_API_KEY || "blun-dev-key";

// Auth Middleware
router.use("/", function(req, res, next) {
  const key = req.headers["x-blun-key"] || req.headers["x-api-key"];
  if (req.user) return next(); // Already authenticated
  if (key && key === API_KEY) return next();
  authenticate(req, res, function() {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    next();
  });
});

// GET /api/organisator/agents/tasks - Alle Tasks mit Status & Priority
router.get("/agents/tasks", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const tasks = await query(
      `SELECT
        t.id,
        t.agent_id as "agentId",
        a.name as "agentName",
        t.task as "title",
        t.status,
        COALESCE(t.priority, 0) as "priority",
        t.created_at as "createdAt",
        t.completed_at as "completedAt",
        t.description
      FROM agent_tasks t
      LEFT JOIN blun_agents a ON a.id = t.agent_id
      ORDER BY
        CASE t.status
          WHEN 'pending' THEN 1
          WHEN 'in-progress' THEN 2
          WHEN 'done' THEN 3
          ELSE 4
        END,
        COALESCE(t.priority, 0) ASC,
        t.created_at DESC
      LIMIT $1`,
      [limit]
    );

    res.json({ tasks });
  } catch (e) {
    console.error("GET /agents/tasks error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/organisator/agents/:agentId/tasks - Tasks für einen spezifischen Agent
router.get("/agents/:agentId/tasks", async (req, res) => {
  try {
    const tasks = await query(
      `SELECT
        t.id,
        t.agent_id as "agentId",
        a.name as "agentName",
        t.task as "title",
        t.status,
        COALESCE(t.priority, 0) as "priority",
        t.created_at as "createdAt",
        t.completed_at as "completedAt",
        t.description
      FROM agent_tasks t
      LEFT JOIN blun_agents a ON a.id = t.agent_id
      WHERE t.agent_id = $1
      ORDER BY
        CASE t.status
          WHEN 'pending' THEN 1
          WHEN 'in-progress' THEN 2
          WHEN 'done' THEN 3
          ELSE 4
        END,
        COALESCE(t.priority, 0) ASC,
        t.created_at DESC`,
      [req.params.agentId]
    );

    res.json({ tasks });
  } catch (e) {
    console.error("GET /agents/:agentId/tasks error:", e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/organisator/agents/task/:taskId/status - Task Status Update
router.patch("/agents/task/:taskId/status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "in-progress", "done"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be: pending, in-progress, or done"
      });
    }

    const task = await queryOne(
      `UPDATE agent_tasks
      SET status = $1,
          completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE completed_at END,
          updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        agent_id as "agentId",
        task as "title",
        status,
        COALESCE(priority, 0) as "priority",
        created_at as "createdAt",
        completed_at as "completedAt"`,
      [status, req.params.taskId]
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ task });
  } catch (e) {
    console.error("PATCH /agents/task/:taskId/status error:", e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/organisator/agents/task/:taskId/priority - Task Priority Update
router.patch("/agents/task/:taskId/priority", async (req, res) => {
  try {
    const { priority } = req.body;

    if (priority === undefined || priority === null || isNaN(priority)) {
      return res.status(400).json({ error: "Priority must be a number" });
    }

    const newPriority = Math.max(0, parseInt(priority));

    const task = await queryOne(
      `UPDATE agent_tasks
      SET priority = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        agent_id as "agentId",
        task as "title",
        status,
        COALESCE(priority, 0) as "priority",
        created_at as "createdAt"`,
      [newPriority, req.params.taskId]
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ task });
  } catch (e) {
    console.error("PATCH /agents/task/:taskId/priority error:", e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/organisator/agents/task/:taskId - Update both status and priority
router.patch("/agents/task/:taskId", async (req, res) => {
  try {
    const { status, priority } = req.body;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      const validStatuses = ["pending", "in-progress", "done"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;

      // Auto-set completed_at when task is done
      updates.push(`completed_at = CASE WHEN $${paramIndex - 1} = 'done' THEN NOW() ELSE completed_at END`);
    }

    if (priority !== undefined) {
      if (isNaN(priority)) {
        return res.status(400).json({ error: "Priority must be a number" });
      }
      updates.push(`priority = $${paramIndex}`);
      params.push(Math.max(0, parseInt(priority)));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params.taskId);

    const task = await queryOne(
      `UPDATE agent_tasks
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING
        id,
        agent_id as "agentId",
        task as "title",
        status,
        COALESCE(priority, 0) as "priority",
        created_at as "createdAt",
        completed_at as "completedAt"`,
      params
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ task });
  } catch (e) {
    console.error("PATCH /agents/task/:taskId error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
