/**
 * BLUN.ai Telegram Bot — Dieter Memory Sync
 * Verbindet Telegram mit dem MemoryStore
 *
 * Werner — Mobile & Desktop Dev
 * Deadline: 2026-04-08
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const MemoryStore = require('./memory-store');

// --- Config laden ---
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const cfg = JSON.parse(raw);
  // Env-Variablen ersetzen
  cfg.telegram.botToken = cfg.telegram.botToken.replace('${TELEGRAM_BOT_TOKEN}', process.env.TELEGRAM_BOT_TOKEN || '');
  cfg.telegram.webhookUrl = cfg.telegram.webhookUrl.replace('${WEBHOOK_BASE_URL}', process.env.WEBHOOK_BASE_URL || '');
  return cfg;
}

// --- Message Kategorisierung ---
function categorize(text) {
  const t = (text || '').toLowerCase();
  if (/(?:task|aufgabe|todo|mach|implementier|bau|erstell)/.test(t)) return ['task'];
  if (/(?:nicht|stop|falsch|besser|aender|feedback|korrektur)/.test(t)) return ['feedback'];
  if (/(?:entscheid|decision|wir nehmen|beschlossen|festgelegt)/.test(t)) return ['decision'];
  if (/(?:bug|fehler|kaputt|geht nicht|broken|fix)/.test(t)) return ['bug'];
  if (/(?:link|url|doku|wiki|jira|confluence)/.test(t)) return ['reference'];
  return ['info'];
}

// --- Bot Klasse ---
class BlunTelegramBot {
  constructor() {
    this.config = loadConfig();
    this.memory = new MemoryStore(this.config.dieter.memoryPath);
    this.bot = null;
    this.buffer = [];
    this.syncInterval = this.config.dieter.syncInterval || 30000;
    this._timer = null;
  }

  start() {
    const token = this.config.telegram.botToken;
    if (!token) {
      console.error('[BlunBot] TELEGRAM_BOT_TOKEN nicht gesetzt!');
      console.error('[BlunBot] Setze: export TELEGRAM_BOT_TOKEN=dein_token');
      process.exit(1);
    }

    const usePolling = this.config.telegram.polling;

    if (usePolling) {
      this.bot = new TelegramBot(token, { polling: true });
      console.log('[BlunBot] Polling-Modus aktiv');
    } else {
      this.bot = new TelegramBot(token, { webHook: { port: 8443 } });
      this.bot.setWebHook(this.config.telegram.webhookUrl);
      console.log(`[BlunBot] Webhook: ${this.config.telegram.webhookUrl}`);
    }

    this._registerHandlers();
    this._startAutoSync();

    console.log('[BlunBot] Dieter Memory Sync gestartet');
    console.log(`[BlunBot] Memory-Pfad: ${this.config.dieter.memoryPath}`);
    console.log(`[BlunBot] Sync-Intervall: ${this.syncInterval / 1000}s`);
    return this;
  }

  stop() {
    this._flush();
    if (this._timer) clearInterval(this._timer);
    if (this.bot) this.bot.stopPolling?.();
    console.log('[BlunBot] Gestoppt');
  }

  _registerHandlers() {
    // Alle Nachrichten -> Memory Buffer
    this.bot.on('message', (msg) => this._onMessage(msg));

    // Befehle
    this.bot.onText(/\/remember (.+)/, (msg, match) => this._cmdRemember(msg, match[1]));
    this.bot.onText(/\/recall (.+)/, (msg, match) => this._cmdRecall(msg, match[1]));
    this.bot.onText(/\/memories/, (msg) => this._cmdList(msg));
    this.bot.onText(/\/forget (.+)/, (msg, match) => this._cmdForget(msg, match[1]));
    this.bot.onText(/\/status/, (msg) => this._cmdStatus(msg));
    this.bot.onText(/\/flush/, (msg) => this._cmdFlush(msg));
    this.bot.onText(/\/export/, (msg) => this._cmdExport(msg));
    this.bot.onText(/\/help/, (msg) => this._cmdHelp(msg));
  }

  _onMessage(msg) {
    if (!msg.text || msg.text.startsWith('/')) return;

    // Chat-Filter
    const allowed = this.config.telegram.allowedChatIds;
    if (allowed.length > 0 && !allowed.includes(msg.chat.id)) return;

    const entry = {
      chatId: msg.chat.id,
      from: msg.from?.username || msg.from?.first_name || 'unbekannt',
      text: msg.text,
      date: new Date(msg.date * 1000).toISOString(),
      tags: categorize(msg.text),
      messageId: msg.message_id,
    };

    // !! = sofort speichern
    if (msg.text.startsWith('!!')) {
      const cleaned = msg.text.replace(/^!!\s*/, '');
      const mem = this.memory.remember(
        cleaned,
        `telegram:${entry.from}`,
        [...entry.tags, 'urgent']
      );
      this.bot.sendMessage(msg.chat.id, `Gespeichert! ID: ${mem.id}`, {
        reply_to_message_id: msg.message_id,
      });
      this._log(`SOFORT: ${entry.from}: ${cleaned.slice(0, 60)}`);
      return;
    }

    this.buffer.push(entry);
  }

  _flush() {
    if (this.buffer.length === 0) return 0;

    // Gruppiere nach User
    const grouped = {};
    for (const e of this.buffer) {
      const key = `${e.chatId}_${e.from}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }

    let saved = 0;
    for (const entries of Object.values(grouped)) {
      const tags = [...new Set(entries.flatMap(e => e.tags))];
      const author = `telegram:${entries[0].from}`;

      if (entries.length === 1) {
        this.memory.remember(entries[0].text, author, tags);
      } else {
        const combined = entries
          .map(e => `[${e.date.slice(11, 16)}] ${e.text}`)
          .join('\n');
        this.memory.remember(combined, author, [...tags, 'combined']);
      }
      saved++;
    }

    const count = this.buffer.length;
    this.buffer = [];
    this._log(`Flush: ${count} Nachrichten -> ${saved} Memories`);
    return saved;
  }

  _startAutoSync() {
    if (this.config.dieter.autoSync) {
      this._timer = setInterval(() => this._flush(), this.syncInterval);
    }
  }

  // --- Befehle ---

  _cmdRemember(msg, text) {
    const from = msg.from?.username || msg.from?.first_name || 'unbekannt';
    const tags = categorize(text);
    const mem = this.memory.remember(text, `telegram:${from}`, tags);
    this.bot.sendMessage(msg.chat.id, `Gespeichert!\nID: ${mem.id}\nTags: ${tags.join(', ')}`);
  }

  _cmdRecall(msg, query) {
    const results = this.memory.recall(query);
    if (results.length === 0) {
      this.bot.sendMessage(msg.chat.id, `Nichts gefunden fuer "${query}"`);
      return;
    }
    const text = results.slice(0, 5).map((r, i) =>
      `${i + 1}. ${r.text.slice(0, 120)}${r.text.length > 120 ? '...' : ''}\n   Tags: ${(r.tags || []).join(', ')} | ${r.createdAt?.slice(0, 10) || '?'}`
    ).join('\n\n');
    this.bot.sendMessage(msg.chat.id, `${results.length} Treffer:\n\n${text}`);
  }

  _cmdList(msg) {
    const list = this.memory.list(10);
    if (list.length === 0) {
      this.bot.sendMessage(msg.chat.id, 'Keine Memories vorhanden.');
      return;
    }
    const text = list.map((m, i) =>
      `${i + 1}. ${m.preview}\n   ${m.createdAt?.slice(0, 10) || '?'}`
    ).join('\n\n');
    this.bot.sendMessage(msg.chat.id, `Letzte ${list.length} Memories:\n\n${text}`);
  }

  _cmdForget(msg, id) {
    const success = this.memory.forget(id.trim());
    this.bot.sendMessage(msg.chat.id, success ? `Geloescht: ${id}` : `Nicht gefunden: ${id}`);
  }

  _cmdStatus(msg) {
    const status = this.memory.syncStatus();
    const text = [
      'Dieter Memory Sync Status',
      '',
      `Memories: ${status.totalMemories}`,
      `Buffer: ${this.buffer.length} wartend`,
      `Letzter Sync: ${status.lastSync || 'nie'}`,
      `Auto-Sync: ${this.config.dieter.autoSync ? 'an' : 'aus'}`,
      `Intervall: ${this.syncInterval / 1000}s`,
      `Pfad: ${status.storagePath}`,
    ].join('\n');
    this.bot.sendMessage(msg.chat.id, text);
  }

  _cmdFlush(msg) {
    const saved = this._flush();
    this.bot.sendMessage(msg.chat.id, `Flush: ${saved} Eintraege gespeichert`);
  }

  _cmdExport(msg) {
    const data = this.memory.exportAll();
    const json = JSON.stringify(data, null, 2);

    if (json.length < 4000) {
      this.bot.sendMessage(msg.chat.id, `Export (${data.count} Memories):\n\n${json}`);
    } else {
      // Als Datei senden
      const exportPath = path.join(this.config.dieter.memoryPath, 'export.json');
      fs.writeFileSync(exportPath, json);
      this.bot.sendDocument(msg.chat.id, exportPath, {
        caption: `Memory Export: ${data.count} Eintraege`,
      });
    }
  }

  _cmdHelp(msg) {
    const text = [
      'Dieter Memory Sync — Befehle',
      '',
      '/remember <text> — Sofort merken',
      '/recall <suche> — Memory durchsuchen',
      '/memories — Letzte Memories anzeigen',
      '/forget <id> — Memory loeschen',
      '/status — Sync-Status',
      '/flush — Buffer jetzt speichern',
      '/export — Alle Memories exportieren',
      '/help — Diese Hilfe',
      '',
      'Tipp: Nachricht mit !! beginnen = sofort speichern',
      'Alle normalen Nachrichten werden automatisch gesynct.',
    ].join('\n');
    this.bot.sendMessage(msg.chat.id, text);
  }

  _log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(`[BlunBot] ${msg}`);

    const logFile = this.config.logging?.file;
    if (logFile) {
      const dir = path.dirname(logFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(logFile, line + '\n');
    }
  }
}

// --- Export ---
module.exports = BlunTelegramBot;

// --- Direktstart ---
if (require.main === module) {
  const bot = new BlunTelegramBot();
  bot.start();

  process.on('SIGINT', () => { bot.stop(); process.exit(0); });
  process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
}
