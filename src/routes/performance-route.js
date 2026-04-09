// Agent Performance & CEO Intelligence API
var express = require('express');
var router = express.Router();
var { query, queryOne } = require('../db');
var engine = require('../agent-engine');

// Leaderboard
router.get('/leaderboard', async function(req, res) {
  try {
    var rows = await engine.getLeaderboard(req.query.company_id || null);
    res.json({ ok: true, leaderboard: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Score a task
router.post('/score/:taskId', async function(req, res) {
  try {
    var result = await engine.scoreTask(parseInt(req.params.taskId), req.body.score, req.body.feedback);
    res.json({ ok: true, result: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Route a task to best agent
router.post('/route', async function(req, res) {
  try {
    var agent = await engine.routeTask(req.body.task, req.body.company_id || null);
    res.json({ ok: true, suggested_agent: agent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Split task into sub-tasks
router.post('/split/:taskId', async function(req, res) {
  try {
    var subs = await engine.splitTask(parseInt(req.params.taskId), req.body.subtasks || []);
    res.json({ ok: true, subtasks: subs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Agent performance detail
router.get('/agent/:agentId', async function(req, res) {
  try {
    var perf = await queryOne("SELECT * FROM agent_performance WHERE agent_id = $1", [parseInt(req.params.agentId)]);
    var recent = await query(
      "SELECT id, task, status, score, feedback, created_at, completed_at FROM agent_tasks WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10",
      [parseInt(req.params.agentId)]
    );
    res.json({ ok: true, performance: perf, recent_tasks: recent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
