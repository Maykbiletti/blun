/**
 * BLUN.ai Notify Client SDK
 * Leichtgewichtiger Client fuer Agents um Events zu senden
 *
 * Usage:
 *   const notify = require('./notify-client');
 *   await notify.taskDone('Werner', 'Telegram Bot', 'Bot deployed', '5m');
 *   await notify.taskFailed('Greta', 'Skill Deploy', 'Timeout');
 *   await notify.taskStarted('Heinrich', 'Security Review');
 *   await notify.custom('agent.deploy', { agentName: 'Klaus', taskTitle: 'Nginx Config' });
 *
 * Werner — Mobile & Desktop Dev
 */

const http = require('http');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3210';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function sendEvent(eventData) {
  const payload = JSON.stringify(eventData);
  const url = new URL(`${WEBHOOK_URL}/webhooks/agent-event`);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(WEBHOOK_SECRET && { 'x-webhook-secret': WEBHOOK_SECRET }),
        ...(eventData.agentName && { 'x-agent-id': eventData.agentName }),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    req.on('error', (err) => {
      console.error(`[notify-client] Fehler: ${err.message}`);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

// --- Convenience Methoden ---

function taskDone(agentName, taskTitle, summary, duration) {
  return sendEvent({
    event: 'agent.task.done',
    agentName,
    taskTitle,
    summary: summary || '',
    duration: duration || '?',
  });
}

function taskFailed(agentName, taskTitle, error) {
  return sendEvent({
    event: 'agent.task.failed',
    agentName,
    taskTitle,
    error: error || 'Unbekannter Fehler',
  });
}

function taskStarted(agentName, taskTitle) {
  return sendEvent({
    event: 'agent.task.started',
    agentName,
    taskTitle,
  });
}

function custom(event, data) {
  return sendEvent({ event, ...data });
}

module.exports = { sendEvent, taskDone, taskFailed, taskStarted, custom };
