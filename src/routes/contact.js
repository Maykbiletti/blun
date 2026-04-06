// BLUN - AI Organisator | MIT License
// Contact form routes
const express = require("express");
const { pool } = require("../db");

var router = express.Router();

// POST /api/contact — public, no auth
router.post("/", async function (req, res) {
  try {
    var { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "All fields are required." });
    }
    var allowed = ["General", "Support", "Enterprise", "Partnership"];
    if (!allowed.includes(subject)) {
      return res.status(400).json({ error: "Invalid subject." });
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email address." });
    }
    await pool.query(
      "INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)",
      [name.trim(), email.trim().toLowerCase(), subject, message.trim()]
    );
    res.json({ ok: true, message: "Message received. We will get back to you soon." });
  } catch (err) {
    console.error("[contact] Error:", err.message);
    res.status(500).json({ error: "Failed to send message." });
  }
});

// GET /api/contact/messages — admin only
router.get("/messages", async function (req, res) {
  try {
    var result = await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100");
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages." });
  }
});

module.exports = router;
