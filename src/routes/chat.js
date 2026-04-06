// BLUN - AI Organisator | MIT License
/**
 * BLUN — Chat Endpoints
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const { sendToAgent } = require('../ws');
const { broadcast } = require('../redis');

const router = Router();

router.post('/send', async function (req, res) {
  var b = req.body;
  if (!b.agentId || !b.body) return res.status(400).json({ error: 'agentId and body are required' });

  var agent = await queryOne('SELECT * FROM agents WHERE id = $1', [b.agentId]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  var convId = b.conversationId;
  if (!convId) {
    var conv = await queryOne(
      'INSERT INTO conversations (company_id, agent_id, title) VALUES ($1, $2, $3) RETURNING id',
      [agent.company_id, b.agentId, b.body.slice(0, 100)]
    );
    convId = conv.id;
  }

  var msg = await queryOne(
    "INSERT INTO conversation_messages (conversation_id, sender_type, body) VALUES ($1, 'user', $2) RETURNING *",
    [convId, b.body]
  );

  sendToAgent(b.agentId, 'user.message', { conversationId: convId, messageId: msg.id, body: b.body });
  broadcast('user.message', { agentId: b.agentId, conversationId: convId, messageId: msg.id, body: b.body });

  res.json({ messageId: msg.id, conversationId: convId, sent: true });
});

router.get('/history/:conversationId', async function (req, res) {
  var limit = parseInt(req.query.limit || '50');
  var convId = req.params.conversationId;
  var rows = await query(
    'SELECT * FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2',
    [convId, limit]
  );
  res.json(rows.reverse());
});

router.get('/conversations', async function (req, res) {
  var q = req.query;
  var sql = 'SELECT c.*, a.name AS agent_name, COUNT(cm.id)::int AS message_count, MAX(cm.created_at) AS last_message_at FROM conversations c LEFT JOIN agents a ON a.id = c.agent_id LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id WHERE 1=1';
  var params = [];

  if (q.companyId) { params.push(q.companyId); sql += ' AND c.company_id = $' + params.length; }
  if (q.agentId) { params.push(q.agentId); sql += ' AND c.agent_id = $' + params.length; }
  if (q.status) { params.push(q.status); sql += ' AND c.status = $' + params.length; }

  sql += ' GROUP BY c.id, a.name ORDER BY last_message_at DESC NULLS LAST';
  res.json(await query(sql, params));
});

module.exports = router;
