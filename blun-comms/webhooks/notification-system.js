/**
 * BLUN.ai Notification System v2
 * Webhook-based — kein Polling
 * Task-Done/Failed/Started Events → Telegram an Mayk
 *
 * Features:
 *   - Express Webhook Server (Port 3210)
 *   - Event Queue mit Retry (max 3 Versuche, exponential backoff)
 *   - BLUN API Hook Registration (/api/webhooks)
 *   - Event History (in-memory, letzten 100)
 *   - Multi-Empfaenger (Mayk default, erweiterbar)
 *
 * Werner — Mobile & Desktop Dev
 * 2026-04-07
 */

const express = require('express');
const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// --- Config ---
const CONFIG_PATH = path.join(__dirname, 'config.json');
const BLUN_API = process.env.BLUN_API_URL || 'http://localhost:3200';
const MAX_HISTORY = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const cfg = JSON.parse(raw);
  // Env-Variablen einsetzen
  cfg.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN || cfg.telegram.botToken || '';
  cfg.telegram.recipients.mayk = process.env.MAYK_CHAT_ID || cfg.telegram.recipients.mayk || '';
  cfg.webhookSecret = process.env.WEBHOOK_SECRET || cfg.webhookSecret || '';
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
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`Telegram ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// --- Template Engine ---
function renderTemplate(template, data) {
  return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (_, keyPath) => {
    const keys = keyPath.split('.');
    let val = data;
    for (const k of keys) {
      val = val?.[k];
    }
    return val ?? '–';
  });
}

// --- Event Queue mit Retry ---
class EventQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(job) {
    this.queue.push({ ...job, attempts: 0 });
    this._process();
  }

  async _process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue[0];
      try {
        await job.fn();
        this.queue.shift(); // Erfolg — raus aus Queue
      } catch (err) {
        job.attempts++;
        if (job.attempts >= MAX_RETRIES) {
          console.error(`[Queue] Aufgegeben nach ${MAX_RETRIES} Versuchen: ${job.label} — ${err.message}`);
          this.queue.shift();
          if (job.onFail) job.onFail(err);
        } else {
          const delay = RETRY_BASE_MS * Math.pow(2, job.attempts - 1);
          console.warn(`[Queue] Retry ${job.attempts}/${MAX_RETRIES} in ${delay}ms: ${job.label}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    this.processing = false;
  }
}

// --- Notification System ---
class NotificationSystem extends EventEmitter {
  constructor() {
    super();
    this.config = loadConfig();
    this.app = express();
    this.app.use(express.json());
    this.queue = new EventQueue();
    this.history = [];
    this.stats = { received: 0, sent: 0, errors: 0, retries: 0, lastEvent: null };
    this._setupRoutes();
    this._setupEventHandlers();
  }

  // --- Webhook Routes ---
  _setupRoutes() {
    // Hauptendpoint: Events empfangen
    this.app.post('/webhooks/agent-event', (req, res) => {
      if (!this._checkSecret(req)) {
        return res.status(401).json({ error: 'invalid secret' });
      }

      const { event, agentName, taskTitle, summary, duration, error: taskError, metadata } = req.body;

      if (!event) {
        return res.status(400).json({ error: 'missing event field' });
      }

      const eventData = {
        event,
        agentName: agentName || 'unbekannt',
        taskTitle: taskTitle || 'Ohne Titel',
        summary: summary || '',
        duration: duration || '?',
        error: taskError || '',
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
        source: req.headers['x-agent-id'] || 'unknown',
      };

      this.stats.received++;
      this.stats.lastEvent = eventData.timestamp;
      this._addHistory(eventData);

      // Event emittieren
      this.emit(event, eventData);

      res.json({ ok: true, event, id: this.history.length });
    });

    // BLUN API Callback — wenn die BLUN API selbst Events schickt
    this.app.post('/webhooks/blun-callback', (req, res) => {
      const { type, data } = req.body;

      if (!type) {
        return res.status(400).json({ error: 'missing type' });
      }

      // BLUN API Events auf unser Format mappen
      const mapped = this._mapBlunEvent(type, data || {});
      if (mapped) {
        this.stats.received++;
        this.stats.lastEvent = new Date().toISOString();
        this._addHistory(mapped);
        this.emit(mapped.event, mapped);
      }

      res.json({ ok: true });
    });

    // Event History
    this.app.get('/webhooks/history', (req, res) => {
      const limit = parseInt(req.query.limit) || 20;
      const eventFilter = req.query.event;
      let result = this.history;
      if (eventFilter) {
        result = result.filter(e => e.event === eventFilter);
      }
      res.json(result.slice(-limit));
    });

    // Status
    this.app.get('/webhooks/status', (req, res) => {
      res.json({
        service: 'blun-notification-system',
        version: '2.0',
        uptime: process.uptime(),
        stats: this.stats,
        queueLength: this.queue.queue.length,
        historyCount: this.history.length,
        configuredEvents: Object.keys(this.config.events),
        recipients: Object.keys(this.config.telegram.recipients),
      });
    });

    // Test-Event senden
    this.app.post('/webhooks/test', (req, res) => {
      const testData = {
        event: 'agent.task.done',
        agentName: req.body?.agentName || 'Werner (Test)',
        taskTitle: req.body?.taskTitle || 'Notification System Test',
        summary: 'Testnachricht — wenn du das siehst, funktioniert das System!',
        duration: '0s',
        timestamp: new Date().toISOString(),
        source: 'test-endpoint',
      };
      this._addHistory(testData);
      this.emit('agent.task.done', testData);
      res.json({ ok: true, message: 'Test-Event gesendet' });
    });

    // Health (fuer PM2/Monitoring)
    this.app.get('/webhooks/health', (req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });
  }

  _checkSecret(req) {
    const secret = this.config.webhookSecret;
    if (!secret) return true; // kein Secret konfiguriert = alles durchlassen
    return req.headers['x-webhook-secret'] === secret;
  }

  _addHistory(eventData) {
    this.history.push(eventData);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  _mapBlunEvent(type, data) {
    const mapping = {
      'task.completed': 'agent.task.done',
      'task.failed': 'agent.task.failed',
      'task.created': 'agent.task.started',
      'agent.status.changed': 'agent.status',
    };

    const mappedEvent = mapping[type];
    if (!mappedEvent) return null;

    return {
      event: mappedEvent,
      agentName: data.agentName || data.agent || 'unbekannt',
      taskTitle: data.title || data.taskTitle || data.name || 'Ohne Titel',
      summary: data.summary || data.result || '',
      duration: data.duration || '?',
      error: data.error || '',
      metadata: data,
      timestamp: new Date().toISOString(),
      source: 'blun-api',
    };
  }

  // --- Event Handlers → Telegram ---
  _setupEventHandlers() {
    const events = this.config.events;

    for (const [eventName, eventCfg] of Object.entries(events)) {
      if (!eventCfg.notify || eventCfg.notify.length === 0) continue;

      this.on(eventName, (data) => {
        const message = renderTemplate(eventCfg.template, data);
        console.log(`[Notify] ${eventName}: ${data.agentName} — ${data.taskTitle}`);

        for (const recipientKey of eventCfg.notify) {
          const chatId = this.config.telegram.recipients[recipientKey];
          if (!chatId) {
            console.warn(`[Notify] Kein Chat-ID fuer "${recipientKey}"`);
            continue;
          }

          // In Queue mit Retry
          this.queue.enqueue({
            label: `telegram:${recipientKey}:${eventName}`,
            fn: async () => {
              await sendTelegram(this.config.telegram.botToken, chatId, message);
              this.stats.sent++;
              console.log(`[Notify] → Telegram an ${recipientKey} gesendet`);
            },
            onFail: (err) => {
              this.stats.errors++;
              console.error(`[Notify] Endgueltig fehlgeschlagen (${recipientKey}): ${err.message}`);
            },
          });
        }
      });
    }
  }

  // --- Bei BLUN API als Webhook registrieren ---
  async registerAtBlunAPI() {
    const { port } = this.config.server;
    const webhookUrl = `http://localhost:${port}/webhooks/blun-callback`;

    const payload = JSON.stringify({
      url: webhookUrl,
      events: ['task.completed', 'task.failed', 'task.created', 'agent.status.changed'],
      name: 'notification-system',
    });

    return new Promise((resolve) => {
      const url = new URL(`${BLUN_API}/api/webhooks`);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('[Notify] Bei BLUN API als Webhook registriert');
            resolve(true);
          } else {
            console.warn(`[Notify] BLUN API Webhook-Registration: ${res.statusCode} — ${data}`);
            console.warn('[Notify] Agenten koennen Events direkt an POST /webhooks/agent-event senden');
            resolve(false);
          }
        });
      });
      req.on('error', (err) => {
        console.warn(`[Notify] BLUN API nicht erreichbar: ${err.message}`);
        console.warn('[Notify] Direkter Webhook-Modus aktiv');
        resolve(false);
      });
      req.write(payload);
      req.end();
    });
  }

  // --- Start ---
  async start() {
    const { port, host } = this.config.server;
    const token = this.config.telegram.botToken;
    const maykId = this.config.telegram.recipients.mayk;

    if (!token) {
      console.error('[Notify] FEHLER: TELEGRAM_BOT_TOKEN nicht gesetzt!');
      process.exit(1);
    }
    if (!maykId) {
      console.error('[Notify] FEHLER: MAYK_CHAT_ID nicht gesetzt!');
      process.exit(1);
    }

    return new Promise((resolve) => {
      this.server = this.app.listen(port, host, async () => {
        console.log(`[Notify] Notification System v2 auf ${host}:${port}`);
        console.log(`[Notify] Endpoints:`);
        console.log(`  POST /webhooks/agent-event  — Events empfangen`);
        console.log(`  POST /webhooks/blun-callback — BLUN API Callbacks`);
        console.log(`  POST /webhooks/test          — Test senden`);
        console.log(`  GET  /webhooks/history        — Event-History`);
        console.log(`  GET  /webhooks/status         — System-Status`);
        console.log(`  GET  /webhooks/health         — Health Check`);

        // Bei BLUN API registrieren
        await this.registerAtBlunAPI();

        resolve(this);
      });
    });
  }

  stop() {
    if (this.server) this.server.close();
    console.log('[Notify] Gestoppt');
  }
}

// --- Export ---
module.exports = { NotificationSystem, sendTelegram, renderTemplate };

// --- Direktstart ---
if (require.main === module) {
  const system = new NotificationSystem();
  system.start();

  process.on('SIGINT', () => { system.stop(); process.exit(0); });
  process.on('SIGTERM', () => { system.stop(); process.exit(0); });
}
