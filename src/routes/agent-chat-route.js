// Agent-to-Agent Chat API Routes
var express = require('express');
var router = express.Router();
var { query, queryOne } = require('../db');
var engine = require('../agent-engine');

// Send message from one agent to another
router.post('/send', async function(req, res) {
  try {
    var { from_agent_id, to_agent_id, subject, content, priority } = req.body;
    if (!from_agent_id || !to_agent_id || !content) {
      return res.status(400).json({ error: 'from_agent_id, to_agent_id, content required' });
    }
    var msg = await engine.sendAgentMessage(from_agent_id, to_agent_id, subject, content, priority);
    res.json({ ok: true, message: msg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get inbox for an agent
router.get('/inbox/:agentId', async function(req, res) {
  try {
    var status = req.query.status || null;
    var msgs = await engine.getAgentInbox(parseInt(req.params.agentId), status);
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Reply to a message
router.post('/reply/:messageId', async function(req, res) {
  try {
    var { from_agent_id, content } = req.body;
    var msg = await engine.replyToMessage(parseInt(req.params.messageId), from_agent_id, content);
    res.json({ ok: true, message: msg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Broadcast to all agents or a department
router.post('/broadcast', async function(req, res) {
  try {
    var { from_agent_id, subject, content, department } = req.body;
    var count = await engine.broadcastMessage(from_agent_id, subject, content, department);
    res.json({ ok: true, sent: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Mark message as read
router.put('/read/:messageId', async function(req, res) {
  try {
    var { agent_id } = req.body;
    await engine.markMessageRead(parseInt(req.params.messageId), agent_id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get chat history between two agents
router.get('/history/:agentA/:agentB', async function(req, res) {
  try {
    var a = parseInt(req.params.agentA);
    var b = parseInt(req.params.agentB);
    var msgs = await query(
      "SELECT m.*, sa.name as from_name, ta.name as to_name FROM agent_messages m JOIN blun_agents sa ON sa.id = m.from_agent_id JOIN blun_agents ta ON ta.id = m.to_agent_id WHERE (m.from_agent_id = $1 AND m.to_agent_id = $2) OR (m.from_agent_id = $2 AND m.to_agent_id = $1) ORDER BY m.created_at DESC LIMIT 50",
      [a, b]
    );
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
