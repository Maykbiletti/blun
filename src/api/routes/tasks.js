const { Router } = require("express");
const { query, queryOne } = require("../../db");
const { requireAuth } = require("../../middleware/auth");

const router = Router();

router.get("/tasks", requireAuth, async function (req, res) {
  try {
    var where = [];
    var params = [];
    var idx = 1;

    if (req.query.priority !== undefined) {
      var priority = parseInt(req.query.priority, 10);
      if (Number.isNaN(priority)) {
        return res.status(400).json({ error: "priority must be a number" });
      }
      where.push("priority = $" + idx);
      params.push(priority);
      idx++;
    }

    if (req.query.created_at) {
      where.push("DATE(created_at) = $" + idx + "::date");
      params.push(req.query.created_at);
      idx++;
    }

    if (req.query.created_at_from) {
      where.push("created_at >= $" + idx + "::timestamptz");
      params.push(req.query.created_at_from);
      idx++;
    }

    if (req.query.created_at_to) {
      where.push("created_at <= $" + idx + "::timestamptz");
      params.push(req.query.created_at_to);
      idx++;
    }

    var sql = "SELECT * FROM tasks";
    if (where.length > 0) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY created_at DESC";

    var rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tasks/:id", requireAuth, async function (req, res) {
  try {
    var row = await queryOne("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Task not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tasks", requireAuth, async function (req, res) {
  try {
    var b = req.body || {};

    if (!b.company_id || !b.agent_id || !b.title) {
      return res.status(400).json({ error: "company_id, agent_id and title are required" });
    }

    var row = await queryOne(
      "INSERT INTO tasks (company_id, agent_id, title, description, priority, parent_task_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [b.company_id, b.agent_id, b.title, b.description || null, b.priority || 0, b.parent_task_id || null]
    );

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/tasks/:id", requireAuth, async function (req, res) {
  try {
    var b = req.body || {};
    var updates = [];
    var params = [];
    var idx = 1;

    ["status", "title", "description", "priority"].forEach(function (field) {
      if (b[field] !== undefined) {
        updates.push(field + " = $" + idx);
        params.push(b[field]);
        idx++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    if (b.status === "done") {
      updates.push("completed_at = NOW()");
    }

    updates.push("updated_at = NOW()");
    params.push(req.params.id);

    var row = await queryOne(
      "UPDATE tasks SET " + updates.join(", ") + " WHERE id = $" + idx + " RETURNING *",
      params
    );

    if (!row) return res.status(404).json({ error: "Task not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/tasks/:id", requireAuth, async function (req, res) {
  try {
    var row = await queryOne(
      "UPDATE tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    if (!row) return res.status(404).json({ error: "Task not found" });
    res.json({ cancelled: true, task: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
