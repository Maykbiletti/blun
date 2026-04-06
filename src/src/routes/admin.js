// BLUN - AI Organisator | MIT License
/**
 * BLUN — Admin Routes
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const { startAgent, stopAgent, getProcessStatus } = require('../agent/runtime');
const { listTools, executeTool } = require('../agent/tools');

const router = Router();

router.get('/health', async function (req, res) {
  try {
    var dbCheck = await queryOne('SELECT NOW() AS ts');
    var processStatus = getProcessStatus();
    var agentCounts = await queryOne(
      "SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active, COUNT(*) FILTER (WHERE status = 'idle')::int AS idle, COUNT(*) FILTER (WHERE status = 'error')::int AS errored, COUNT(*) FILTER (WHERE status = 'paused')::int AS paused, COUNT(*)::int AS total FROM agents"
    );
    res.json({ status: 'healthy', timestamp: dbCheck.ts, agents: agentCounts, processes: Object.keys(processStatus).length, uptime: process.uptime() });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

router.delete('/agent/:id', async function (req, res) {
  await stopAgent(req.params.id);
  var deleted = await queryOne('DELETE FROM agents WHERE id = $1 RETURNING id, name', [req.params.id]);
  if (!deleted) return res.status(404).json({ error: 'Agent not found' });
  res.json({ deleted: true, agent: deleted });
});

router.post('/agent/:id/tools', async function (req, res) {
  var agentTools = req.body.tools;
  if (!Array.isArray(agentTools)) return res.status(400).json({ error: 'tools must be an array' });

  var available = listTools().map(function (t) { return t.name; });
  var invalid = agentTools.filter(function (t) { return !available.includes(t); });
  if (invalid.length > 0) return res.status(400).json({ error: 'Unknown tools: ' + invalid.join(', ') });

  var row = await queryOne('UPDATE agents SET tools = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [JSON.stringify(agentTools), req.params.id]);
  if (!row) return res.status(404).json({ error: 'Agent not found' });
  res.json(row);
});

router.post('/tool/execute', async function (req, res) {
  var b = req.body;
  if (!b.toolName) return res.status(400).json({ error: 'toolName is required' });
  var result = await executeTool(b.agentId || 'admin', b.toolName, b.params || {});
  res.json(result);
});

router.delete('/company/:id', async function (req, res) {
  var deleted = await queryOne('DELETE FROM companies WHERE id = $1 RETURNING id, name', [req.params.id]);
  if (!deleted) return res.status(404).json({ error: 'Company not found' });
  res.json({ deleted: true, company: deleted });
});

router.post('/agents/stop-all', async function (req, res) {
  var agents = await query("SELECT id FROM agents WHERE status = 'active'");
  var results = await Promise.all(agents.map(function (a) { return stopAgent(a.id); }));
  res.json({ stopped: results.filter(function (r) { return r.success; }).length, total: agents.length });
});

router.post('/agents/start-all', async function (req, res) {
  var agents = await query("SELECT id FROM agents WHERE status != 'active' AND status != 'paused'");
  var results = await Promise.all(agents.map(function (a) { return startAgent(a.id); }));
  res.json({ started: results.filter(function (r) { return r.success; }).length, total: agents.length });
});

router.get('/stats', async function (req, res) {
  var results = await Promise.all([
    queryOne('SELECT COUNT(*)::int AS count FROM conversation_messages'),
    queryOne('SELECT COUNT(*)::int AS count FROM tasks'),
    queryOne('SELECT COUNT(*)::int AS count FROM tool_executions'),
    queryOne('SELECT COALESCE(SUM(cost_cents), 0)::numeric AS total FROM cost_events'),
  ]);
  res.json({ messages: results[0].count, tasks: results[1].count, tool_executions: results[2].count, total_cost_cents: parseFloat(results[3].total) });
});

module.exports = router;
