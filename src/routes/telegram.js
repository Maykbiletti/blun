// BLUN - AI Organisator | MIT License
// Telegram Channel Routes

const { Router } = require("express");
const { query, queryOne } = require("../db");
const { authenticate, requireAuth } = require("../middleware/auth");
const { startBot, stopBot, getBot, activeBots } = require("../channels/telegram");
const https = require("https");

const router = Router();
router.use(authenticate);
router.use(requireAuth);

// Validate token with Telegram API
function validateToken(token) {
  return new Promise((resolve, reject) => {
    https.get("https://api.telegram.org/bot" + token + "/getMe", (res) => {
      var chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// POST /telegram/connect
router.post("/connect", async function (req, res) {
  try {
    var token = (req.body.bot_token || "").trim();
    if (!token) return res.status(400).json({ error: "bot_token is required" });

    // Validate with Telegram
    var resp = await validateToken(token);
    if (!resp.ok) return res.status(400).json({ error: "Invalid bot token: " + (resp.description || "unknown error") });

    var botInfo = resp.result;

    // Check if already connected
    var existing = await queryOne("SELECT id FROM telegram_channels WHERE bot_token = $1", [token]);
    if (existing) return res.status(409).json({ error: "This bot is already connected" });

    var ch = await queryOne(
      "INSERT INTO telegram_channels (user_id, bot_token, bot_username, agent_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.user.id, token, botInfo.username, req.body.agent_id || null]
    );

    // Auto-start
    await startBot(ch);

    res.json({ channel: ch, bot: botInfo });
  } catch (err) {
    console.error("[telegram] Connect error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /telegram
router.get("/", async function (req, res) {
  var channels = await query(
    "SELECT tc.*, a.name AS agent_name FROM telegram_channels tc LEFT JOIN agents a ON a.id = tc.agent_id WHERE tc.user_id = $1 ORDER BY tc.created_at DESC",
    [req.user.id]
  );
  // Add online status
  channels.forEach(function (ch) { ch.online = activeBots.has(ch.id); });
  res.json(channels);
});

// PATCH /telegram/:id
router.patch("/:id", async function (req, res) {
  var ch = await queryOne("SELECT * FROM telegram_channels WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  var sets = [];
  var params = [];
  var idx = 1;

  if (req.body.agent_id !== undefined) { sets.push("agent_id = $" + idx++); params.push(req.body.agent_id || null); }
  if (req.body.chat_whitelist !== undefined) { sets.push("chat_whitelist = $" + idx++); params.push(JSON.stringify(req.body.chat_whitelist)); }
  if (req.body.enabled !== undefined) { sets.push("enabled = $" + idx++); params.push(req.body.enabled); }

  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });

  params.push(req.params.id);
  await query("UPDATE telegram_channels SET " + sets.join(", ") + " WHERE id = $" + idx, params);

  var updated = await queryOne("SELECT * FROM telegram_channels WHERE id = $1", [req.params.id]);

  // Restart or stop bot as needed
  if (updated.enabled) {
    await startBot(updated);
  } else {
    stopBot(updated.id);
  }

  res.json(updated);
});

// DELETE /telegram/:id
router.delete("/:id", async function (req, res) {
  var ch = await queryOne("SELECT * FROM telegram_channels WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  stopBot(ch.id);
  await query("DELETE FROM telegram_channels WHERE id = $1", [ch.id]);
  res.json({ deleted: true });
});

// POST /telegram/:id/test
router.post("/:id/test", async function (req, res) {
  var ch = await queryOne("SELECT * FROM telegram_channels WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  var chatId = req.body.chat_id;
  if (!chatId) return res.status(400).json({ error: "chat_id is required" });

  var bot = getBot(ch.id);
  if (!bot) return res.status(400).json({ error: "Bot is not running" });

  var result = await bot.sendMessage(chatId, "BLUN Test Message — Your bot is connected and working!");
  res.json({ sent: true, result: result });
});

module.exports = router;
