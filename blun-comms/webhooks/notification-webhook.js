/**
 * BLUN.ai Notification Webhooks
 * Event-driven: Agent-Task-Done → Telegram an Mayk
 * Kein Polling — reiner Push via Webhook
 *
 * Werner — Mobile & Desktop Dev
 * 2026-04-07
 */

const express = require('express');
const { EventEmitter } = require('events');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Config ---
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const cfg = JSON.parse(raw);
  cfg.telegram.botToken = (cfg.telegram.botToken || '').replace(
    '${TELEGRAM_BOT_TOKEN}', process.env.TELEGRAM_BOT_TOKEN || ''
  );
  cfg.telegram.recipients.mayk = (cfg.telegram.recipients.mayk || '').replace(
    '${MAYK_CHAT_ID}', process.env.MAYK_CHAT_ID || ''
  );
  cfg.webhookSecret = (cfg.webhookSecret || '').replace(
    '${WEBHOOK_SECRET}', process.env.WEBHOOK_SECRET || ''
  );
  return cfg;
}

// --- Telegram Sender ---
function sendTelegram(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Telegram ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// --- Template Engine (simpel) ---
function renderTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] || '–');
}

// --- Notification Hub ---
class NotificationHub extends EventEmitter {
  constructor() {
    super();
    this.config = loadConfig();
    this.app = express();
    this.app.use(express.json());
    this.stats = { received: 0, sent: 0, errors: 0, lastEvent: null };
    this._setupRoutes();
    this._setupEventHandlers();
  }

  _setupRoutes() {
    // Webhook Endpoint — Agents posten hier Events hin
    this.app.post('/webhooks/agent-event', (req, res) => {
      // Secret pruefen (optional, aber empfohlen)
      const secret = this.config.webhookSecret;
      if (secret && req.headers['x-webhook-secret'] !== secret) {
        return res.status(401).json({ error: 'invalid secret' });
      }

      const { event, agentName, taskTitle, summary, duration, error: taskError } = req.body;

      if (!event) {
        return res.status(400).json({ error: 'missing event field' });
      }

      this.stats.received++;
      this.stats.lastEvent = new Date().toISOString();

      // Event emittieren — Handler uebernehmen
      this.emit(event, {
        event,
        agentName: agentName || 'unbekannt',
        taskTitle: taskTitle || 'Ohne Titel',
        summary: summary || '',
        duration: duration || '?',
        error: taskError || '',
        timestamp: new Date().toISOString(),
      });

      res.json({ ok: true, event });
    });

    // Health/Status Endpoint
    this.app.get('/webhooks/status', (req, res) => {
      res.json({
        service: 'blun-notification-webhooks',
        uptime: process.uptime(),
        stats: this.stats,
        configuredEvents: Object.keys(this.config.events),
      });
    });

    // Test Endpoint — simuliert ein Event
    this.app.post('/webhooks/test', (req, res) => {
      this.emit('agent.task.done', {
        event: 'agent.task.done',
        agentName: 'Werner (Test)',
        taskTitle: 'Notification Webhook Test',
        summary: 'Testnachricht — wenn du das siehst, funktioniert der Webhook!',
        duration: '0s',
        timestamp: new Date().toISOString(),
      });
      res.json({ ok: true, message: 'Test-Event gesendet' });
    });
  }

  _setupEventHandlers() {
    const events = this.config.events;

    for (const [eventName, eventCfg] of Object.entries(events)) {
      this.on(eventName, async (data) => {
        const message = renderTemplate(eventCfg.template, data);
        console.log(`[Webhook] ${eventName}: ${data.agentName} — ${data.taskTitle}`);

        // An alle konfigurierten Empfaenger senden
        for (const recipientKey of eventCfg.notify) {
          const chatId = this.config.telegram.recipients[recipientKey];
          if (!chatId) {
            console.warn(`[Webhook] Empfaenger "${recipientKey}" hat keine Chat-ID`);
            continue;
          }

          try {
            await sendTelegram(this.config.telegram.botToken, chatId, message);
            this.stats.sent++;
            console.log(`[Webhook] → Telegram an ${recipientKey} gesendet`);
          } catch (err) {
            this.stats.errors++;
            console.error(`[Webhook] Telegram-Fehler (${recipientKey}): ${err.message}`);
          }
        }
      });
    }
  }

  start() {
    const { port, host } = this.config.server;
    const token = this.config.telegram.botToken;
    const maykId = this.config.telegram.recipients.mayk;

    if (!token) {
      console.error('[Webhook] TELEGRAM_BOT_TOKEN nicht gesetzt!');
      process.exit(1);
    }
    if (!maykId) {
      console.error('[Webhook] MAYK_CHAT_ID nicht gesetzt!');
      process.exit(1);
    }

    this.server = this.app.listen(port, host, () => {
      console.log(`[Webhook] Notification Hub laeuft auf ${host}:${port}`);
      console.log(`[Webhook] POST /webhooks/agent-event — Events empfangen`);
      console.log(`[Webhook] POST /webhooks/test — Test-Nachricht senden`);
      console.log(`[Webhook] GET  /webhooks/status — Status abrufen`);
    });
    return this;
  }

  stop() {
    if (this.server) this.server.close();
    console.log('[Webhook] Gestoppt');
  }
}

// --- Hilfsfunktion: Event von einem Agent senden ---
// Agents rufen das auf wenn ein Task fertig ist
function notifyTaskDone({ agentName, taskTitle, summary, duration }) {
  const payload = JSON.stringify({
    event: 'agent.task.done',
    agentName,
    taskTitle,
    summary,
    duration,
  });

  const req = https.request({
    hostname: 'localhost',
    port: 3210,
    path: '/webhooks/agent-event',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-webhook-secret': process.env.WEBHOOK_SECRET || '',
    },
  }, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => console.log(`[Notify] ${res.statusCode}: ${data}`));
  });
  req.on('error', (e) => console.error(`[Notify] Fehler: ${e.message}`));
  req.write(payload);
  req.end();
}

// --- Export ---
module.exports = { NotificationHub, notifyTaskDone, sendTelegram, renderTemplate };

// --- Direktstart ---
if (require.main === module) {
  const hub = new NotificationHub();
  hub.start();

  process.on('SIGINT', () => { hub.stop(); process.exit(0); });
  process.on('SIGTERM', () => { hub.stop(); process.exit(0); });
}
