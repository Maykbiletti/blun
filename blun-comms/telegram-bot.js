/**
 * BLUN.ai Telegram Bot
 * Werner — Mobile & Desktop Dev
 *
 * Commands:
 *   /status  → Agent Health (alle Agenten + PM2 Status)
 *   /tasks   → Offene Tasks aus Memory
 *
 * Deployment: PM2 Prozess "blun-telegram"
 * Env: TELEGRAM_BOT_TOKEN, BLUN_API_URL (default http://localhost:3200)
 */

const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// --- Config ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BLUN_API = process.env.BLUN_API_URL || 'http://localhost:3200';

if (!TOKEN) {
  console.error('[BLUN-Telegram] FEHLER: TELEGRAM_BOT_TOKEN nicht gesetzt!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('[BLUN-Telegram] Bot gestartet. Warte auf Commands...');

// --- Helper: HTTP GET gegen BLUN API ---
function blunGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${BLUN_API}${path}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

// --- Helper: PM2 Status holen ---
function getPM2Status() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('pm2 jlist', (err, stdout) => {
      if (err) return resolve([]);
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve([]);
      }
    });
  });
}

// --- /status → Agent Health ---
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    // PM2 Prozesse holen
    const pm2List = await getPM2Status();

    // BLUN API Health Check
    let apiHealth = 'unbekannt';
    try {
      const res = await blunGet('/api/health');
      apiHealth = res.status === 'ok' || res.status === 200 ? 'online' : JSON.stringify(res);
    } catch {
      apiHealth = 'offline';
    }

    // Agenten-Status via API
    let agenten = [];
    try {
      const res = await blunGet('/api/agents');
      if (Array.isArray(res)) agenten = res;
      else if (res.agents) agenten = res.agents;
    } catch { /* ignore */ }

    // Nachricht bauen
    let text = '**BLUN.ai System Status**\n\n';
    text += `API: \`${apiHealth}\`\n\n`;

    // PM2 Prozesse
    if (pm2List.length > 0) {
      text += '**PM2 Prozesse:**\n';
      for (const proc of pm2List) {
        const status = proc.pm2_env?.status || 'unknown';
        const emoji = status === 'online' ? '🟢' : status === 'stopped' ? '🔴' : '🟡';
        const mem = proc.monit?.memory
          ? `${Math.round(proc.monit.memory / 1024 / 1024)}MB`
          : '-';
        const uptime = proc.pm2_env?.pm_uptime
          ? timeSince(proc.pm2_env.pm_uptime)
          : '-';
        text += `${emoji} \`${proc.name}\` — ${status} | RAM: ${mem} | Up: ${uptime}\n`;
      }
    } else {
      text += '_Keine PM2 Prozesse gefunden_\n';
    }

    // Agenten
    if (agenten.length > 0) {
      text += '\n**Agenten:**\n';
      for (const agent of agenten) {
        const name = agent.name || agent.id || 'unbekannt';
        const status = agent.status || agent.state || '-';
        text += `• \`${name}\` — ${status}\n`;
      }
    }

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `Fehler beim Status-Check: ${err.message}`);
  }
});

// --- /tasks → Offene Tasks ---
bot.onText(/\/tasks/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    let tasks = [];

    // Tasks via BLUN API
    try {
      const res = await blunGet('/api/tasks');
      if (Array.isArray(res)) tasks = res;
      else if (res.tasks) tasks = res.tasks;
    } catch { /* ignore */ }

    // Memory-basierte Tasks als Fallback
    if (tasks.length === 0) {
      try {
        const res = await blunGet('/api/memory?type=tasks');
        if (Array.isArray(res)) tasks = res;
        else if (res.tasks) tasks = res.tasks;
      } catch { /* ignore */ }
    }

    let text = '**Offene Tasks:**\n\n';

    if (tasks.length > 0) {
      for (const task of tasks) {
        const title = task.title || task.name || task.description || JSON.stringify(task);
        const assignee = task.assignee || task.agent || '';
        const status = task.status || 'offen';
        const prio = task.priority ? ` [${task.priority}]` : '';
        text += `• ${title}${prio}\n`;
        if (assignee) text += `  → ${assignee} | ${status}\n`;
      }
    } else {
      text += '_Keine Tasks via API gefunden._\n\n';
      text += 'Bekannte offene Tasks (Werner):\n';
      text += '• AgentMails — SES SMTP Anbindung\n';
      text += '• Telefon + SMS — Twilio/Vonage Eval\n';
      text += '• i18n System — DE/EN JSON\n';
      text += '• WhatsApp Integration — Konzept\n';
      text += '• Push Notifications — Konzept\n';
    }

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `Fehler beim Tasks-Abruf: ${err.message}`);
  }
});

// --- /help ---
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '**BLUN.ai Bot Commands:**\n\n' +
    '/status — System & Agent Health\n' +
    '/tasks — Offene Tasks anzeigen\n' +
    '/help — Diese Hilfe',
    { parse_mode: 'Markdown' }
  );
});

// --- Helper: Uptime formatieren ---
function timeSince(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('[BLUN-Telegram] Shutting down...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[BLUN-Telegram] Shutting down...');
  bot.stopPolling();
  process.exit(0);
});
