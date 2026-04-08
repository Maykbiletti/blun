// BLUN - AI Organisator | MIT License
// Telegram Service — high-level API for sending notifications and managing bot interactions

const { query, queryOne } = require("../db");
const { getBot, activeBots } = require("../channels/telegram");

// Send a message to a specific Telegram chat via the assigned bot
async function sendNotification(channelId, chatId, text) {
  const bot = getBot(channelId);
  if (!bot) return { success: false, error: "Bot not active for channel " + channelId };
  try {
    const result = await bot.sendMessage(chatId, text);
    return { success: true, messageId: result && result.result && result.result.message_id };
  } catch (err) {
    console.error("[telegram-service] Send failed:", err.message);
    return { success: false, error: err.message };
  }
}

// Send notification to all whitelisted chats of a channel
async function broadcastToChannel(channelId, text) {
  const channel = await queryOne("SELECT * FROM telegram_channels WHERE id = $1", [channelId]);
  if (!channel) return { success: false, error: "Channel not found" };

  const bot = getBot(channelId);
  if (!bot) return { success: false, error: "Bot not active" };

  const targets = channel.chat_whitelist || [];
  const results = [];
  for (const chatId of targets) {
    try {
      await bot.sendMessage(chatId, text);
      results.push({ chatId, sent: true });
    } catch (err) {
      results.push({ chatId, sent: false, error: err.message });
    }
  }
  return { success: true, results };
}

// Send to a specific user by looking up their telegram_chat_id in the users table
async function sendToUser(userId, text) {
  const user = await queryOne(
    "SELECT u.telegram_chat_id, tc.id as channel_id FROM users u JOIN telegram_channels tc ON tc.company_id = u.company_id WHERE u.id = $1 AND u.telegram_chat_id IS NOT NULL AND tc.enabled = true LIMIT 1",
    [userId]
  );
  if (!user) return { success: false, error: "No telegram link for user " + userId };
  return sendNotification(user.channel_id, user.telegram_chat_id, text);
}

// Lookup which bots are currently active
function getActiveChannels() {
  const channels = [];
  for (const [id, bot] of activeBots) {
    channels.push({
      channelId: id,
      botUsername: bot.channel.bot_username || null,
      running: bot.running,
    });
  }
  return channels;
}

module.exports = { sendNotification, broadcastToChannel, sendToUser, getActiveChannels };
