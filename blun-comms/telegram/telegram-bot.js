/**
 * BLUN.ai — Telegram Bot Integration
 * Dieter Memory Sync: Chat-History → Memory automatisch
 *
 * Features:
 * - Empfaengt Telegram-Nachrichten via Polling oder Webhook
 * - Extrahiert relevante Infos aus Chat-History
 * - Synchronisiert automatisch in Agent-Memory (JSON-basiert)
 * - Unterstuetzt Gruppen- und Einzelchats
 * - Kategorisiert Messages: feedback, task, info, decision
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Konfiguration ---
const CONFIG_PATH = path.join(__dirname, 'telegram-config.json');
const MEMORY_DIR = path.join(__dirname, '..', 'memory');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config nicht gefunden: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// --- Memory Manager ---
class MemoryManager {
  constructor(memoryDir) {
    this.memoryDir = memoryDir;
    this.indexPath = path.join(memoryDir, 'MEMORY.md');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    if (!fs.existsSync(this.indexPath)) {
      fs.writeFileSync(this.indexPath, '# Dieter Memory Sync\n\n');
    }
  }

  /**
   * Speichert eine Memory-Datei und aktualisiert den Index
   */
  save(entry) {
    const id = crypto.randomBytes(4).toString('hex');
    const filename = `${entry.type}_${id}.md`;
    const filepath = path.join(this.memoryDir, filename);

    const content = [
      '---',
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      `type: ${entry.type}`,
      `source: telegram`,
      `chat_id: ${entry.chatId}`,
      `from: ${entry.from}`,
      `date: ${entry.date}`,
      '---',
      '',
      entry.content,
    ].join('\n');

    fs.writeFileSync(filepath, content, 'utf-8');
    this._updateIndex(filename, entry.name, entry.description);

    return { id, filename, filepath };
  }

  /**
   * Liest alle Memories eines bestimmten Typs
   */
  listByType(type) {
    const files = fs.readdirSync(this.memoryDir).filter(f => f.startsWith(`${type}_`) && f.endsWith('.md'));
    return files.map(f => {
      const raw = fs.readFileSync(path.join(this.memoryDir, f), 'utf-8');
      return { filename: f, ...this._parseFrontmatter(raw) };
    });
  }

  /**
   * Sucht Memories nach Stichwort
   */
  search(query) {
    const files = fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    const results = [];
    for (const f of files) {
      const raw = fs.readFileSync(path.join(this.memoryDir, f), 'utf-8');
      if (raw.toLowerCase().includes(query.toLowerCase())) {
        results.push({ filename: f, ...this._parseFrontmatter(raw) });
      }
    }
    return results;
  }

  _updateIndex(filename, name, description) {
    const line = `- [${name}](${filename}) — ${description}\n`;
    fs.appendFileSync(this.indexPath, line, 'utf-8');
  }

  _parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { meta: {}, content: raw };
    const meta = {};
    for (const line of match[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { meta, content: match[2].trim() };
  }
}

// --- Message Kategorisierung ---
function categorizeMessage(text) {
  const lower = (text || '').toLowerCase();

  if (/(?:task|aufgabe|todo|mach|implementier|bau|erstell)/i.test(lower)) return 'project';
  if (/(?:nicht|stop|falsch|besser|aender|feedback|korrektur)/i.test(lower)) return 'feedback';
  if (/(?:entscheid|decision|wir nehmen|beschlossen|festgelegt)/i.test(lower)) return 'project';
  if (/(?:link|url|doku|wiki|jira|confluence|grafana)/i.test(lower)) return 'reference';
  return 'project'; // Default: Projekt-relevante Info
}

function extractSummary(text, maxLen = 80) {
  if (!text) return 'Leere Nachricht';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

// --- Telegram Bot ---
class DieterMemorySyncBot {
  constructor(config) {
    this.config = config;
    this.memory = new MemoryManager(config.memoryDir || MEMORY_DIR);
    this.bot = null;
    this.syncBuffer = [];
    this.flushInterval = config.flushIntervalMs || 30000; // 30s default
  }

  start() {
    const { token, mode, webhookUrl, port } = this.config;

    if (mode === 'webhook') {
      this.bot = new TelegramBot(token, { webHook: { port: port || 8443 } });
      this.bot.setWebHook(webhookUrl);
      console.log(`[DieterSync] Webhook aktiv auf Port ${port || 8443}`);
    } else {
      this.bot = new TelegramBot(token, { polling: true });
      console.log('[DieterSync] Polling-Modus aktiv');
    }

    this._registerHandlers();
    this._startAutoFlush();

    console.log('[DieterSync] Bot gestartet — Memory Sync laeuft');
    return this;
  }

  stop() {
    this._flush();
    if (this._flushTimer) clearInterval(this._flushTimer);
    if (this.bot) this.bot.stopPolling?.();
    console.log('[DieterSync] Bot gestoppt');
  }

  _registerHandlers() {
    // Alle Text-Nachrichten → Memory Sync
    this.bot.on('message', (msg) => this._handleMessage(msg));

    // Befehle
    this.bot.onText(/\/sync_status/, (msg) => this._cmdStatus(msg));
    this.bot.onText(/\/sync_search (.+)/, (msg, match) => this._cmdSearch(msg, match[1]));
    this.bot.onText(/\/sync_flush/, (msg) => this._cmdFlush(msg));
    this.bot.onText(/\/sync_help/, (msg) => this._cmdHelp(msg));
  }

  _handleMessage(msg) {
    // Ignoriere eigene Befehle
    if (msg.text && msg.text.startsWith('/sync_')) return;

    // Nur erlaubte Chats (falls konfiguriert)
    if (this.config.allowedChatIds?.length > 0) {
      if (!this.config.allowedChatIds.includes(msg.chat.id)) return;
    }

    const entry = {
      chatId: msg.chat.id,
      from: msg.from?.username || msg.from?.first_name || 'unknown',
      date: new Date(msg.date * 1000).toISOString(),
      text: msg.text || msg.caption || '',
      type: categorizeMessage(msg.text || msg.caption || ''),
    };

    this.syncBuffer.push(entry);

    // Sofort speichern wenn als wichtig markiert
    if (msg.text && /^!!/m.test(msg.text)) {
      this._saveEntry(entry, true);
      this.bot.sendMessage(msg.chat.id, '💾 Sofort gespeichert in Memory!', {
        reply_to_message_id: msg.message_id,
      });
    }
  }

  _saveEntry(entry, immediate = false) {
    const result = this.memory.save({
      name: `telegram_${entry.from}_${entry.date.slice(0, 10)}`,
      description: extractSummary(entry.text),
      type: entry.type,
      chatId: entry.chatId,
      from: entry.from,
      date: entry.date,
      content: [
        entry.text,
        '',
        `**Quelle:** Telegram ${immediate ? '(sofort)' : '(auto-sync)'}`,
        `**Von:** ${entry.from}`,
        `**Kategorie:** ${entry.type}`,
      ].join('\n'),
    });

    return result;
  }

  _flush() {
    if (this.syncBuffer.length === 0) return 0;

    // Gruppiere nach Chat und fasse zusammen wenn moeglich
    const grouped = {};
    for (const entry of this.syncBuffer) {
      const key = `${entry.chatId}_${entry.from}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    }

    let saved = 0;
    for (const [, entries] of Object.entries(grouped)) {
      if (entries.length === 1) {
        this._saveEntry(entries[0]);
        saved++;
      } else {
        // Zusammenfassen: mehrere Messages vom gleichen User → eine Memory
        const combined = {
          chatId: entries[0].chatId,
          from: entries[0].from,
          date: entries[entries.length - 1].date,
          text: entries.map(e => `[${e.date.slice(11, 16)}] ${e.text}`).join('\n'),
          type: entries[0].type,
        };
        this._saveEntry(combined);
        saved++;
      }
    }

    const count = this.syncBuffer.length;
    this.syncBuffer = [];
    console.log(`[DieterSync] Flush: ${count} Messages → ${saved} Memory-Eintraege`);
    return saved;
  }

  _startAutoFlush() {
    this._flushTimer = setInterval(() => this._flush(), this.flushInterval);
  }

  // --- Bot-Befehle ---

  _cmdStatus(msg) {
    const memFiles = fs.readdirSync(this.memory.memoryDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    const text = [
      '📊 *Dieter Memory Sync Status*',
      '',
      `Buffer: ${this.syncBuffer.length} Messages wartend`,
      `Gespeicherte Memories: ${memFiles.length}`,
      `Flush-Intervall: ${this.flushInterval / 1000}s`,
      `Modus: ${this.config.mode || 'polling'}`,
    ].join('\n');

    this.bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  }

  _cmdSearch(msg, query) {
    const results = this.memory.search(query);
    if (results.length === 0) {
      this.bot.sendMessage(msg.chat.id, `Keine Ergebnisse fuer "${query}"`);
      return;
    }

    const text = results.slice(0, 5).map(r =>
      `• *${r.meta.name || r.filename}*\n  ${extractSummary(r.content, 120)}`
    ).join('\n\n');

    this.bot.sendMessage(msg.chat.id, `🔍 ${results.length} Treffer:\n\n${text}`, {
      parse_mode: 'Markdown',
    });
  }

  _cmdFlush(msg) {
    const saved = this._flush();
    this.bot.sendMessage(msg.chat.id, `✅ Flush: ${saved} Eintraege gespeichert`);
  }

  _cmdHelp(msg) {
    const text = [
      '🤖 *Dieter Memory Sync — Befehle*',
      '',
      '/sync\\_status — Status anzeigen',
      '/sync\\_search <query> — Memory durchsuchen',
      '/sync\\_flush — Buffer sofort speichern',
      '/sync\\_help — Diese Hilfe',
      '',
      'Tipp: Nachricht mit `!!` beginnen = sofort speichern',
    ].join('\n');

    this.bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  }
}

// --- Export ---
module.exports = { DieterMemorySyncBot, MemoryManager, categorizeMessage };

// --- Direktstart ---
if (require.main === module) {
  const config = loadConfig();
  const bot = new DieterMemorySyncBot(config);
  bot.start();

  process.on('SIGINT', () => { bot.stop(); process.exit(0); });
  process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
}
