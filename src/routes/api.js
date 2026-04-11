// BLUN - AI Organisator | MIT License
/**
 * BLUN — REST API Routes
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const activityFeedRoutes = require('./activity-feed');
const { startAgent, stopAgent, restartAgent, getProcessStatus } = require('../agent/runtime');
const { sendToAgent } = require('../ws');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const router = Router();

function parsePositiveInt(value, fallback, maxValue) {
  var n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (typeof maxValue === 'number' && n > maxValue) return maxValue;
  return n;
}

function parseSinceDate(value) {
  if (!value) return null;
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function resolveTableAvailability(tableNames) {
  var rows = await query(
    'SELECT name AS table_name, to_regclass(name) IS NOT NULL AS exists FROM unnest($1::text[]) AS name',
    [tableNames]
  );
  var map = {};
  rows.forEach(function (r) {
    map[r.table_name] = r.exists === true;
  });
  return map;
}

function sortFeedDesc(a, b) {
  var at = new Date(a.timestamp).getTime();
  var bt = new Date(b.timestamp).getTime();
  return bt - at;
}


router.get("/health", async function (req, res) {
  try {
    var dbCheck = await query("SELECT NOW() AS ts");
    res.json({ status: "ok", timestamp: dbCheck[0].ts, version: "2.0.0" });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

router.get('/companies', requireAuth, async function (req, res) {
  res.json(await query('SELECT * FROM companies ORDER BY created_at'));
});

router.get('/company/:id', requireAuth, async function (req, res) {
  var company = await queryOne('SELECT * FROM companies WHERE id = $1', [req.params.id]);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  var agents = await query('SELECT * FROM agents WHERE company_id = $1 ORDER BY name', [req.params.id]);
  res.json(Object.assign({}, company, { agents: agents }));
});

router.post('/companies', requireAuth, async function (req, res) {
  var b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name is required' });
  var row = await queryOne('INSERT INTO companies (name, config) VALUES ($1, $2) RETURNING *', [b.name, b.config || {}]);
  res.status(201).json(row);
});

router.get('/agents', requireAuth, async function (req, res) {
  res.json(await query('SELECT a.*, c.name AS company_name FROM agents a LEFT JOIN companies c ON c.id = a.company_id ORDER BY c.name, a.name'));
});

router.get('/agent/:id', requireAuth, async function (req, res) {
  var agent = await queryOne('SELECT * FROM agents WHERE id = $1', [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

router.post('/agents', requireAuth, async function (req, res) {
  var b = req.body;
  if (!b.company_id || !b.name) return res.status(400).json({ error: 'company_id and name are required' });
  var row = await queryOne(
    'INSERT INTO agents (company_id, name, role, title, model, adapter_type, tools, config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [b.company_id, b.name, b.role, b.title, b.model, b.adapter_type || 'codex_local', b.tools || [], b.config || {}]
  );
  res.status(201).json(row);
});

router.patch('/agent/:id', requireAuth, async function (req, res) {
  var agent = await queryOne('SELECT * FROM agents WHERE id = $1', [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  var fields = ['name', 'role', 'title', 'model', 'adapter_type', 'tools', 'config', 'status'];
  var updates = [], values = [], idx = 1;
  for (var i = 0; i < fields.length; i++) {
    if (req.body[fields[i]] !== undefined) {
      updates.push(fields[i] + ' = $' + idx); values.push(req.body[fields[i]]); idx++;
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = NOW()'); values.push(req.params.id);
  var row = await queryOne('UPDATE agents SET ' + updates.join(', ') + ' WHERE id = $' + idx + ' RETURNING *', values);
  res.json(row);
});

router.post('/agent/:id/start', requireAuth, async function (req, res) { res.json(await startAgent(req.params.id)); });
router.post('/agent/:id/stop', requireAuth, async function (req, res) { res.json(await stopAgent(req.params.id)); });
router.post('/agent/:id/restart', requireAuth, async function (req, res) { res.json(await restartAgent(req.params.id)); });

router.post('/agent/:id/message', requireAuth, async function (req, res) {
  var b = req.body;
  if (!b.body) return res.status(400).json({ error: 'body is required' });
  var agent = await queryOne('SELECT * FROM agents WHERE id = $1', [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  var convId = b.conversationId;
  if (!convId) {
    var conv = await queryOne('INSERT INTO conversations (company_id, agent_id, title) VALUES ($1, $2, $3) RETURNING id', [agent.company_id, agent.id, b.body.slice(0, 100)]);
    convId = conv.id;
  }
  await query("INSERT INTO conversation_messages (conversation_id, sender_type, body) VALUES ($1, 'user', $2)", [convId, b.body]);
  sendToAgent(req.params.id, 'user.message', { conversationId: convId, body: b.body });
  res.json({ conversationId: convId, sent: true });
});

router.get('/agent/:id/conversations', requireAuth, async function (req, res) {
  res.json(await query('SELECT c.*, COUNT(cm.id)::int AS message_count FROM conversations c LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id WHERE c.agent_id = $1 GROUP BY c.id ORDER BY c.updated_at DESC', [req.params.id]));
});

router.get('/conversation/:id', requireAuth, async function (req, res) {
  var conv = await queryOne('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  var messages = await query('SELECT * FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at', [req.params.id]);
  res.json(Object.assign({}, conv, { messages: messages }));
});

router.get('/agent/:id/tasks', requireAuth, async function (req, res) {
  res.json(await query('SELECT * FROM tasks WHERE agent_id = $1 ORDER BY created_at DESC', [req.params.id]));
});

router.post('/agent/:id/task', requireAuth, async function (req, res) {
  var b = req.body;
  if (!b.title) return res.status(400).json({ error: 'title is required' });
  var agent = await queryOne('SELECT * FROM agents WHERE id = $1', [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  var row = await queryOne('INSERT INTO tasks (company_id, agent_id, title, description, priority, parent_task_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [agent.company_id, req.params.id, b.title, b.description, b.priority || 0, b.parent_task_id]);
  sendToAgent(req.params.id, 'task.created', row);
  res.status(201).json(row);
});

router.patch('/task/:id', requireAuth, async function (req, res) {
  var b = req.body;
  var updates = [], values = [], idx = 1;
  ['status', 'title', 'description', 'priority'].forEach(function (k) {
    if (b[k] !== undefined) { updates.push(k + ' = $' + idx); values.push(b[k]); idx++; }
  });
  if (b.status === 'done') updates.push('completed_at = NOW()');
  updates.push('updated_at = NOW()'); values.push(req.params.id);
  var row = await queryOne('UPDATE tasks SET ' + updates.join(', ') + ' WHERE id = $' + idx + ' RETURNING *', values);
  if (!row) return res.status(404).json({ error: 'Task not found' });
  res.json(row);
});

router.get('/agent/:id/memory', requireAuth, async function (req, res) {
  res.json(await query('SELECT * FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC', [req.params.id]));
});

router.post('/agent/:id/memory', requireAuth, async function (req, res) {
  var b = req.body;
  if (!b.key || !b.content) return res.status(400).json({ error: 'key and content are required' });
  await query('INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()', [req.params.id, b.key, b.content]);
  res.json({ stored: true });
});

router.get('/costs', requireAuth, async function (req, res) {
  var days = parseInt(req.query.days || '30');
  res.json(await query("SELECT agent_id, a.name AS agent_name, provider, model, SUM(input_tokens) AS total_input_tokens, SUM(output_tokens) AS total_output_tokens, SUM(cost_cents)::numeric AS total_cost_cents, COUNT(*)::int AS request_count FROM cost_events ce LEFT JOIN agents a ON a.id = ce.agent_id WHERE ce.created_at > NOW() - INTERVAL '1 day' * $1 GROUP BY agent_id, a.name, provider, model ORDER BY total_cost_cents DESC", [days]));
});

router.get('/activity-feed', requireAuth, async function (req, res) {
  function toInt(value, fallback) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return n;
  }

  function normalizeLimit(value) {
    var n = toInt(value, 50);
    if (n < 1) return 1;
    if (n > 200) return 200;
    return n;
  }

  function normalizeHours(value) {
    var n = toInt(value, 24);
    if (n < 1) return 1;
    if (n > 168) return 168;
    return n;
  }

  function normalizeRow(row, fallbackType) {
    var createdAt = row.created_at || row.timestamp || new Date().toISOString();
    var activityType = row.activity_type || row.type || fallbackType || 'system';
    var agentName = row.agent_name || row.agent || row.source || 'System';
    var message = row.message || row.description || row.title || 'Activity event';
    var status = row.status || null;
    return {
      id: row.id || ('ev-' + Math.random().toString(36).slice(2)),
      created_at: createdAt,
      activity_type: activityType,
      agent_name: agentName,
      message: message,
      status: status,
      metadata: row.metadata || {}
    };
  }

  async function runSafeQuery(sql, params, fallbackType) {
    try {
      var rows = await query(sql, params);
      return rows.map(function (row) {
        return normalizeRow(row, fallbackType);
      });
    } catch (e) {
      return [];
    }
  }

  try {
    var limit = normalizeLimit(req.query.limit);
    var hours = normalizeHours(req.query.hours);
    var rowLimit = Math.max(20, Math.min(limit * 2, 300));

    var recentTaskRows = await runSafeQuery(
      "SELECT t.id::text AS id, t.created_at, 'task' AS activity_type, COALESCE(a.name, 'Agent #' || t.agent_id::text) AS agent_name, COALESCE(t.title, t.description, 'Task updated') AS message, t.status, jsonb_build_object('task_id', t.id, 'priority', t.priority) AS metadata FROM tasks t LEFT JOIN agents a ON a.id = t.agent_id WHERE t.created_at >= NOW() - INTERVAL '1 hour' * $1 ORDER BY t.created_at DESC LIMIT $2",
      [hours, rowLimit],
      'task'
    );

    var recentAgentTaskRows = await runSafeQuery(
      "SELECT at.id::text AS id, at.created_at, 'agent_task' AS activity_type, COALESCE(ba.name, 'Agent #' || at.agent_id::text) AS agent_name, COALESCE(at.task, 'Agent task update') AS message, at.status, jsonb_build_object('task_id', at.id) AS metadata FROM agent_tasks at LEFT JOIN blun_agents ba ON ba.id = at.agent_id WHERE at.created_at >= NOW() - INTERVAL '1 hour' * $1 ORDER BY at.created_at DESC LIMIT $2",
      [hours, rowLimit],
      'agent_task'
    );

    var recentMessages = await runSafeQuery(
      "SELECT cm.id::text AS id, cm.created_at, 'conversation' AS activity_type, COALESCE(a.name, 'Agent') AS agent_name, LEFT(COALESCE(cm.body, 'Conversation message'), 220) AS message, NULL::text AS status, jsonb_build_object('conversation_id', c.id, 'sender_type', cm.sender_type) AS metadata FROM conversation_messages cm LEFT JOIN conversations c ON c.id = cm.conversation_id LEFT JOIN agents a ON a.id = c.agent_id WHERE cm.created_at >= NOW() - INTERVAL '1 hour' * $1 ORDER BY cm.created_at DESC LIMIT $2",
      [hours, rowLimit],
      'conversation'
    );

    var recentHeartbeats = await runSafeQuery(
      "SELECT h.id::text AS id, h.started_at AS created_at, 'heartbeat' AS activity_type, COALESCE(a.name, 'Agent #' || h.agent_id::text) AS agent_name, 'Heartbeat received' AS message, NULL::text AS status, jsonb_build_object('duration_ms', h.duration_ms, 'ok', h.ok) AS metadata FROM heartbeats h LEFT JOIN agents a ON a.id = h.agent_id WHERE h.started_at >= NOW() - INTERVAL '1 hour' * $1 ORDER BY h.started_at DESC LIMIT $2",
      [hours, rowLimit],
      'heartbeat'
    );

    var allEvents = []
      .concat(recentTaskRows)
      .concat(recentAgentTaskRows)
      .concat(recentMessages)
      .concat(recentHeartbeats);

    allEvents.sort(function (a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    var dedupeMap = {};
    var items = [];
    for (var i = 0; i < allEvents.length; i++) {
      var event = allEvents[i];
      var key = event.activity_type + '|' + event.id + '|' + event.created_at;
      if (dedupeMap[key]) continue;
      dedupeMap[key] = true;
      items.push(event);
      if (items.length >= limit) break;
    }

    res.json({
      ok: true,
      count: items.length,
      range_hours: hours,
      generated_at: new Date().toISOString(),
      items: items
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard', requireAuth, async function (req, res) {
  var results = await Promise.all([
    query('SELECT * FROM companies ORDER BY created_at'),
    query('SELECT a.*, c.name AS company_name FROM agents a LEFT JOIN companies c ON c.id = a.company_id ORDER BY c.name, a.name'),
    query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 20'),
    query("SELECT COALESCE(SUM(cost_cents), 0)::numeric AS total_cost_cents, COALESCE(SUM(input_tokens), 0) AS total_input_tokens, COALESCE(SUM(output_tokens), 0) AS total_output_tokens FROM cost_events WHERE created_at > NOW() - INTERVAL '30 days'"),
  ]);
  res.json({ companies: results[0], agents: results[1], recentTasks: results[2], costSummary: results[3][0], processes: getProcessStatus() });
});

router.get('/activity-feed', requireAuth, async function (req, res) {
  try {
    var limit = parsePositiveInt(req.query.limit, 50, 200);
    var sourceLimit = parsePositiveInt(req.query.sourceLimit, Math.max(20, limit * 2), 500);
    var since = parseSinceDate(req.query.since);
    var companyId = req.query.company_id ? String(req.query.company_id) : null;
    var agentId = req.query.agent_id ? String(req.query.agent_id) : null;
    var tables = await resolveTableAvailability(['tasks', 'agents', 'heartbeats', 'conversations', 'conversation_messages', 'cost_events']);
    var events = [];

    if (tables.tasks && tables.agents) {
      var taskSql = [
        "SELECT t.id, t.agent_id, t.company_id, t.title, t.status, t.priority,",
        "COALESCE(t.updated_at, t.created_at) AS ts, a.name AS agent_name",
        "FROM tasks t",
        "LEFT JOIN agents a ON a.id = t.agent_id",
        "WHERE 1=1"
      ];
      var taskParams = [];
      if (since) {
        taskParams.push(since);
        taskSql.push('AND COALESCE(t.updated_at, t.created_at) >= $' + taskParams.length);
      }
      if (companyId) {
        taskParams.push(companyId);
        taskSql.push('AND t.company_id = $' + taskParams.length);
      }
      if (agentId) {
        taskParams.push(agentId);
        taskSql.push('AND t.agent_id = $' + taskParams.length);
      }
      taskSql.push('ORDER BY ts DESC LIMIT ' + sourceLimit);
      var taskRows = await query(taskSql.join(' '), taskParams);
      events = events.concat(taskRows.map(function (row) {
        return {
          id: 'task:' + row.id,
          type: 'task',
          timestamp: row.ts,
          agent_id: row.agent_id,
          company_id: row.company_id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          actor: row.agent_name || null
        };
      }));
    }

    if (tables.heartbeats && tables.agents) {
      var hbSql = [
        "SELECT h.id, h.agent_id, a.company_id, a.name AS agent_name, h.status,",
        "COALESCE(h.ended_at, h.started_at) AS ts, h.started_at, h.ended_at",
        "FROM heartbeats h",
        "LEFT JOIN agents a ON a.id = h.agent_id",
        "WHERE 1=1"
      ];
      var hbParams = [];
      if (since) {
        hbParams.push(since);
        hbSql.push('AND COALESCE(h.ended_at, h.started_at) >= $' + hbParams.length);
      }
      if (companyId) {
        hbParams.push(companyId);
        hbSql.push('AND a.company_id = $' + hbParams.length);
      }
      if (agentId) {
        hbParams.push(agentId);
        hbSql.push('AND h.agent_id = $' + hbParams.length);
      }
      hbSql.push('ORDER BY ts DESC LIMIT ' + sourceLimit);
      var heartbeatRows = await query(hbSql.join(' '), hbParams);
      events = events.concat(heartbeatRows.map(function (row) {
        return {
          id: 'heartbeat:' + row.id,
          type: 'heartbeat',
          timestamp: row.ts,
          agent_id: row.agent_id,
          company_id: row.company_id,
          status: row.status,
          actor: row.agent_name || null,
          started_at: row.started_at,
          ended_at: row.ended_at
        };
      }));
    }

    if (tables.conversation_messages && tables.conversations && tables.agents) {
      var msgSql = [
        "SELECT cm.id, cm.conversation_id, cm.sender_type, cm.body, cm.created_at AS ts,",
        "c.agent_id, a.company_id, a.name AS agent_name",
        "FROM conversation_messages cm",
        "LEFT JOIN conversations c ON c.id = cm.conversation_id",
        "LEFT JOIN agents a ON a.id = c.agent_id",
        "WHERE 1=1"
      ];
      var msgParams = [];
      if (since) {
        msgParams.push(since);
        msgSql.push('AND cm.created_at >= $' + msgParams.length);
      }
      if (companyId) {
        msgParams.push(companyId);
        msgSql.push('AND a.company_id = $' + msgParams.length);
      }
      if (agentId) {
        msgParams.push(agentId);
        msgSql.push('AND c.agent_id = $' + msgParams.length);
      }
      msgSql.push('ORDER BY cm.created_at DESC LIMIT ' + sourceLimit);
      var messageRows = await query(msgSql.join(' '), msgParams);
      events = events.concat(messageRows.map(function (row) {
        return {
          id: 'message:' + row.id,
          type: 'message',
          timestamp: row.ts,
          conversation_id: row.conversation_id,
          agent_id: row.agent_id,
          company_id: row.company_id,
          sender_type: row.sender_type,
          body_preview: typeof row.body === 'string' ? row.body.slice(0, 180) : '',
          actor: row.agent_name || null
        };
      }));
    }

    if (tables.cost_events && tables.agents) {
      var costSql = [
        "SELECT ce.id, ce.agent_id, a.company_id, a.name AS agent_name, ce.provider, ce.model,",
        "ce.input_tokens, ce.output_tokens, ce.cost_cents, ce.created_at AS ts",
        "FROM cost_events ce",
        "LEFT JOIN agents a ON a.id = ce.agent_id",
        "WHERE 1=1"
      ];
      var costParams = [];
      if (since) {
        costParams.push(since);
        costSql.push('AND ce.created_at >= $' + costParams.length);
      }
      if (companyId) {
        costParams.push(companyId);
        costSql.push('AND a.company_id = $' + costParams.length);
      }
      if (agentId) {
        costParams.push(agentId);
        costSql.push('AND ce.agent_id = $' + costParams.length);
      }
      costSql.push('ORDER BY ce.created_at DESC LIMIT ' + sourceLimit);
      var costRows = await query(costSql.join(' '), costParams);
      events = events.concat(costRows.map(function (row) {
        return {
          id: 'cost:' + row.id,
          type: 'cost',
          timestamp: row.ts,
          agent_id: row.agent_id,
          company_id: row.company_id,
          actor: row.agent_name || null,
          provider: row.provider,
          model: row.model,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          cost_cents: row.cost_cents
        };
      }));
    }

    events.sort(sortFeedDesc);
    var feed = events.slice(0, limit);

    res.json({
      success: true,
      result_len: feed.length,
      limit: limit,
      source_limit: sourceLimit,
      since: since ? since.toISOString() : null,
      generated_at: new Date().toISOString(),
      data: feed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tools', function (req, res) {
  var tools = require('../agent/tools');
  res.json(tools.listTools());
});

router.get('/agent/:id/heartbeats', requireAuth, async function (req, res) {
  res.json(await query('SELECT * FROM heartbeats WHERE agent_id = $1 ORDER BY started_at DESC LIMIT 50', [req.params.id]));
});

module.exports = router;
