// BLUN Support Chat — API Route
var express = require("express");
var router = express.Router();
var { findAnswer } = require("../support/knowledge");

// In-memory chat store
var chats = {};

router.post("/api/chat", function (req, res) {
  var message = (req.body.message || "").trim();
  var sessionId = req.body.sessionId || "anon-" + Date.now();

  if (!message) {
    return res.status(400).json({ error: "Message required" });
  }

  if (!chats[sessionId]) {
    chats[sessionId] = { messages: [], created: Date.now() };
  }

  chats[sessionId].messages.push({ role: "user", text: message, ts: Date.now() });

  var result = findAnswer(message);

  chats[sessionId].messages.push({ role: "assistant", text: result.answer, ts: Date.now() });

  // Clean old sessions (older than 1 hour)
  var cutoff = Date.now() - 3600000;
  var keys = Object.keys(chats);
  for (var i = 0; i < keys.length; i++) {
    if (chats[keys[i]].created < cutoff) delete chats[keys[i]];
  }

  res.json({
    reply: result.answer,
    category: result.category,
    lang: result.lang,
    sessionId: sessionId
  });
});

module.exports = router;
