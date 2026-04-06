// BLUN - AI Organisator | MIT License
// Telegram Channel Integration — poll-based, no external libs

const https = require("https");
const { query, queryOne } = require("../db");
const { sendToAgent } = require("../ws");
const { broadcast } = require("../redis");

const API_BASE = "https://api.telegram.org/bot";

class TelegramBot {
  constructor(channel) {
    this.channel = channel;
    this.token = channel.bot_token;
    this.offset = 0;
    this.running = false;
    this.pollTimer = null;
    // Map chatId -> conversationId for ongoing conversations
    this.conversations = new Map();
  }

  api(method, body) {
    return new Promise((resolve, reject) => {
      var data = body ? JSON.stringify(body) : "";
      var opts = {
        method: body ? "POST" : "GET",
        hostname: "api.telegram.org",
        path: "/bot" + this.token + "/" + method,
        headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
      };
      var req = https.request(opts, (res) => {
        var chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      });
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async start() {
    this.running = true;
    console.log("[telegram] Bot started: @" + (this.channel.bot_username || "unknown"));
    this.poll();
  }

  stop() {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    console.log("[telegram] Bot stopped: @" + (this.channel.bot_username || "unknown"));
  }

  async poll() {
    if (!this.running) return;
    try {
      var resp = await this.api("getUpdates", { offset: this.offset, timeout: 25, allowed_updates: ["message"] });
      if (resp.ok && resp.result && resp.result.length > 0) {
        for (var upd of resp.result) {
          this.offset = upd.update_id + 1;
          await this.handleUpdate(upd);
        }
      }
    } catch (err) {
      console.error("[telegram] Poll error for @" + (this.channel.bot_username || "?") + ":", err.message);
    }
    this.pollTimer = setTimeout(() => this.poll(), 500);
  }

  async handleUpdate(update) {
    if (!update.message || !update.message.text) return;
    var chat = update.message.chat;
    var text = update.message.text;
    var chatId = String(chat.id);

    // Check whitelist
    if (this.channel.chat_whitelist && this.channel.chat_whitelist.length > 0) {
      if (!this.channel.chat_whitelist.includes(chatId)) return;
    }

    // Log incoming
    await query(
      "INSERT INTO telegram_messages (channel_id, chat_id, direction, text) VALUES ($1, $2, $3, $4)",
      [this.channel.id, chatId, "in", text]
    );

    // Forward to agent if assigned
    if (!this.channel.agent_id) {
      await this.sendMessage(chatId, "No agent assigned to this bot yet.");
      return;
    }

    // Get or create conversation
    var convKey = chatId + ":" + this.channel.agent_id;
    var convId = this.conversations.get(convKey);
    if (!convId) {
      var agent = await queryOne("SELECT * FROM agents WHERE id = $1", [this.channel.agent_id]);
      if (!agent) {
        await this.sendMessage(chatId, "Agent not found.");
        return;
      }
      var conv = await queryOne(
        "INSERT INTO conversations (company_id, agent_id, title) VALUES ($1, $2, $3) RETURNING id",
        [agent.company_id, this.channel.agent_id, "Telegram: " + (chat.first_name || chat.title || chatId)]
      );
      convId = conv.id;
      this.conversations.set(convKey, convId);
    }

    // Insert user message
    var msg = await queryOne(
      "INSERT INTO conversation_messages (conversation_id, sender_type, body) VALUES ($1, $2, $3) RETURNING *",
      [convId, "user", text]
    );

    // Send to agent
    sendToAgent(this.channel.agent_id, "user.message", { conversationId: convId, messageId: msg.id, body: text, source: "telegram", telegramChatId: chatId, telegramChannelId: this.channel.id });
    broadcast("user.message", { agentId: this.channel.agent_id, conversationId: convId, messageId: msg.id, body: text, source: "telegram" });
  }

  async sendMessage(chatId, text) {
    await query(
      "INSERT INTO telegram_messages (channel_id, chat_id, direction, text) VALUES ($1, $2, $3, $4)",
      [this.channel.id, chatId, "out", text]
    );
    return this.api("sendMessage", { chat_id: chatId, text: text, parse_mode: "Markdown" });
  }
}

// Bot Manager — manages all active bots
const activeBots = new Map(); // channelId -> TelegramBot

async function startBot(channel) {
  if (activeBots.has(channel.id)) {
    activeBots.get(channel.id).stop();
  }
  var bot = new TelegramBot(channel);
  activeBots.set(channel.id, bot);
  await bot.start();
  return bot;
}

function stopBot(channelId) {
  var bot = activeBots.get(channelId);
  if (bot) {
    bot.stop();
    activeBots.delete(channelId);
  }
}

function getBot(channelId) {
  return activeBots.get(channelId) || null;
}

async function startAllBots() {
  var channels = await query("SELECT * FROM telegram_channels WHERE enabled = true");
  console.log("[telegram] Starting " + channels.length + " bot(s)...");
  for (var ch of channels) {
    try { await startBot(ch); }
    catch (err) { console.error("[telegram] Failed to start bot " + ch.id + ":", err.message); }
  }
}

// Listen for agent responses via Redis to relay back to Telegram
const Redis = require("ioredis");
const agentResponseSub = new Redis(process.env.BLUN_REDIS_URL || "redis://127.0.0.1:6379");
agentResponseSub.subscribe("blun:dashboard");
agentResponseSub.on("message", async (_ch, raw) => {
  try {
    var msg = JSON.parse(raw);
    if (msg.type !== "agent.message") return;
    var p = msg.payload;
    if (!p.conversationId || !p.body) return;

    // Find if this conversation is linked to a telegram chat
    for (var [, bot] of activeBots) {
      for (var [key, convId] of bot.conversations) {
        if (convId === p.conversationId) {
          var chatId = key.split(":")[0];
          await bot.sendMessage(chatId, p.body);
          return;
        }
      }
    }
  } catch (e) { /* ignore non-relevant messages */ }
});

module.exports = { TelegramBot, startBot, stopBot, getBot, startAllBots, activeBots };
