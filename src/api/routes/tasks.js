// BLUN - Tasks API Route

var express = require("express");
var router = express.Router();
var db = require("../../db");

var ALLOWED_STATUSES = {
  pending: true,
  processing: true,
  in_progress: true,
  completed: true,
  failed: true,
  cancelled: true,
  decomposed: true,
  "in-progress": true,
  done: true
};

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeNullableText(value) {
  var text = normalizeText(value);
  return text ? text : null;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  var parsed = Number(value);
  if (!isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function toPriority(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  var parsed = Number(value);
  if (!isFinite(parsed)) {
    return null;
  }

  var intVal = Math.trunc(parsed);
  if (intVal < 0) {
    return 0;
  }

  return intVal;
}

function mapTask(row) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    task: row.task,
    title: row.task,
    status: row.status,
    priority: row.priority === null || row.priority === undefined ? 0 : Number(row.priority),
    description: row.description || null,
    parent_task_id: row.parent_task_id || null,
    company_id: row.company_id || null,
    result: row.result || null,
    created_at: row.created_at || null,
    completed_at: row.completed_at || null,
    agent_name: row.agent_name || null
  };
}

router.get("/tasks", async function(req, res) {
  var where = [];
  var params = [];
  var idx = 1;

  var status = normalizeText(req.query && req.query.status).toLowerCase();
  if (status) {
    where.push("t.status = $" + idx);
    params.push(status);
    idx += 1;
  }

  var agentId = toIntOrNull(req.query && req.query.agent_id);
  if (req.query && req.query.agent_id !== undefined && agentId === null) {
    return res.status(400).json({ error: "agent_id must be a valid integer" });
  }
  if (agentId !== null) {
    where.push("t.agent_id = $" + idx);
    params.push(agentId);
    idx += 1;
  }

  var sql = [
    "SELECT",
    "  t.id,",
    "  t.agent_id,",
    "  t.task,",
    "  t.status,",
    "  t.priority,",
    "  t.description,",
    "  t.parent_task_id,",
    "  t.company_id,",
    "  t.result,",
    "  t.created_at,",
    "  t.completed_at,",
    "  a.name AS agent_name",
    "FROM agent_tasks t",
    "LEFT JOIN blun_agents a ON a.id = t.agent_id"
  ];

  if (where.length > 0) {
    sql.push("WHERE " + where.join(" AND "));
  }

  sql.push("ORDER BY t.created_at DESC");

  try {
    var rows = await db.query(sql.join(" "), params);
    return res.json(Array.isArray(rows) ? rows.map(mapTask) : []);
  } catch (error) {
    console.error(
      "GET /tasks failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to load tasks" });
  }
});

router.get("/tasks/:id", async function(req, res) {
  var id = normalizeText(req.params && req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Task id is required" });
  }

  try {
    var rows = await db.query(
      [
        "SELECT",
        "  t.id,",
        "  t.agent_id,",
        "  t.task,",
        "  t.status,",
        "  t.priority,",
        "  t.description,",
        "  t.parent_task_id,",
        "  t.company_id,",
        "  t.result,",
        "  t.created_at,",
        "  t.completed_at,",
        "  a.name AS agent_name",
        "FROM agent_tasks t",
        "LEFT JOIN blun_agents a ON a.id = t.agent_id",
        "WHERE t.id = $1",
        "LIMIT 1"
      ].join(" "),
      [id]
    );

    var task = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(mapTask(task));
  } catch (error) {
    console.error(
      "GET /tasks/:id failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to load task" });
  }
});

router.post("/tasks", async function(req, res) {
  var body = req.body || {};

  var taskText = normalizeText(body.task || body.title);
  if (!taskText) {
    return res.status(400).json({ error: "task is required" });
  }

  var agentId = toIntOrNull(body.agent_id);
  if (agentId === null) {
    return res.status(400).json({ error: "agent_id must be a valid integer" });
  }

  var status = normalizeText(body.status || "pending").toLowerCase();
  if (!ALLOWED_STATUSES[status]) {
    return res.status(400).json({ error: "Invalid status" });
  }

  var priority = toPriority(body.priority);
  if (priority === null) {
    return res.status(400).json({ error: "priority must be a valid number" });
  }

  var description = normalizeNullableText(body.description);
  var parentTaskId = normalizeNullableText(body.parent_task_id);
  var companyId = toIntOrNull(body.company_id);

  if (body.company_id !== undefined && companyId === null) {
    return res.status(400).json({ error: "company_id must be a valid integer" });
  }

  try {
    var rows = await db.query(
      [
        "INSERT INTO agent_tasks (agent_id, task, status, priority, description, parent_task_id, company_id, created_at)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())",
        "RETURNING id, agent_id, task, status, priority, description, parent_task_id, company_id, result, created_at, completed_at"
      ].join(" "),
      [
        agentId,
        taskText,
        status,
        priority,
        description,
        parentTaskId,
        companyId
      ]
    );

    var createdTask = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!createdTask) {
      return res.status(500).json({ error: "Failed to create task" });
    }

    return res.status(201).json(mapTask(createdTask));
  } catch (error) {
    console.error(
      "POST /tasks failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to create task" });
  }
});

module.exports = router;
