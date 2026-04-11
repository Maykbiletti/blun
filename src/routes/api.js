// BLUN - AI Organisator | MIT License
/**
 * BLUN — REST API Routes
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const { startAgent, stopAgent, restartAgent, getProcessStatus } = require('../agent/runtime');
const { sendToAgent } = require('../ws');
const { v4: uuid } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const systemStatusRoutes = require('./system-status');

const router = Router();

router.use('/system/status', systemStatusRoutes);

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

router.get('/dashboard', requireAuth, async function (req, res) {
  var results = await Promise.all([
    query('SELECT * FROM companies ORDER BY created_at'),
    query('SELECT a.*, c.name AS company_name FROM agents a LEFT JOIN companies c ON c.id = a.company_id ORDER BY c.name, a.name'),
    query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 20'),
    query("SELECT COALESCE(SUM(cost_cents), 0)::numeric AS total_cost_cents, COALESCE(SUM(input_tokens), 0) AS total_input_tokens, COALESCE(SUM(output_tokens), 0) AS total_output_tokens FROM cost_events WHERE created_at > NOW() - INTERVAL '30 days'"),
  ]);
  res.json({ companies: results[0], agents: results[1], recentTasks: results[2], costSummary: results[3][0], processes: getProcessStatus() });
});

router.get('/tools', function (req, res) {
  var tools = require('../agent/tools');
  res.json(tools.listTools());
});

router.get('/agent/:id/heartbeats', requireAuth, async function (req, res) {
  res.json(await query('SELECT * FROM heartbeats WHERE agent_id = $1 ORDER BY started_at DESC LIMIT 50', [req.params.id]));
});

module.exports = router;
