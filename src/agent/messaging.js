// BLUN Agent System — Agent-to-Agent Messaging
// Extracted from agent-engine.js

var { query, queryOne } = require("../db");

// === AGENT-TO-AGENT MESSAGING ===
async function sendAgentMessage(fromId, toId, subject, content, priority, replyTo) {
  var msg = await queryOne(
    "INSERT INTO agent_messages (from_agent_id, to_agent_id, subject, content, priority, in_reply_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [fromId, toId, subject || '', content, priority || 'normal', replyTo || null]
  );
  return msg;
}

async function getAgentInbox(agentId, status, limit) {
  limit = limit || 20;
  var where = "WHERE to_agent_id = $1";
  var params = [agentId];
  if (status) { where += " AND status = $2"; params.push(status); }
  params.push(limit);
  var rows = await query(
    "SELECT m.*, a.name as from_name FROM agent_messages m JOIN blun_agents a ON a.id = m.from_agent_id " + where + " ORDER BY created_at DESC LIMIT $" + params.length,
    params
  );
  return rows;
}

async function markMessageRead(messageId, agentId) {
  await query("UPDATE agent_messages SET status = 'read' WHERE id = $1 AND to_agent_id = $2", [messageId, agentId]);
}

async function replyToMessage(originalMsgId, fromId, content) {
  var orig = await queryOne("SELECT * FROM agent_messages WHERE id = $1", [originalMsgId]);
  if (!orig) return null;
  return sendAgentMessage(fromId, orig.from_agent_id, 'Re: ' + (orig.subject || ''), content, orig.priority, originalMsgId);
}

async function broadcastMessage(fromId, subject, content, department) {
  var where = department ? "WHERE department = $1 AND status != 'disabled'" : "WHERE status != 'disabled'";
  var params = department ? [department] : [];
  var agents = await query("SELECT id FROM blun_agents " + where, params);
  var sent = 0;
  for (var i = 0; i < agents.length; i++) {
    if (agents[i].id !== fromId) {
      await sendAgentMessage(fromId, agents[i].id, subject, content, 'normal', null);
      sent++;
    }
  }
  return sent;
}

async function getUnreadSummary(agentId) {
  var unread = await query(
    "SELECT m.subject, m.content, a.name as from_name, m.priority FROM agent_messages m JOIN blun_agents a ON a.id = m.from_agent_id WHERE m.to_agent_id = $1 AND m.status = 'unread' ORDER BY m.created_at DESC LIMIT 5",
    [agentId]
  );
  if (!unread.length) return '';
  var lines = unread.map(function(m) {
    return (m.priority === 'urgent' ? '[DRINGEND] ' : '') + m.from_name + ': ' + (m.subject ? m.subject + ' -- ' : '') + m.content.substring(0, 200);
  });
  await query("UPDATE agent_messages SET status = 'read' WHERE to_agent_id = $1 AND status = 'unread'", [agentId]);
  return '\nNachrichten von anderen Agents:\n' + lines.join('\n');
}



module.exports = { sendAgentMessage, getAgentInbox, markMessageRead, replyToMessage, broadcastMessage, getUnreadSummary };
