// BLUN - AI Organisator | MIT License
// Contact form routes
const express = require("express");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

var router = express.Router();

// POST /api/contact — public, no auth, rate-limited via middleware
router.post("/", async function (req, res) {
  try {
    var { name, email, subject, message } = req.body;

    // Required field validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // String type check
    if (typeof name !== 'string' || typeof email !== 'string' || typeof subject !== 'string' || typeof message !== 'string') {
      return res.status(400).json({ error: "Invalid input types." });
    }

    // Length validation (prevent DoS via huge messages)
    if (name.length > 100 || email.length > 100 || message.length > 5000) {
      return res.status(400).json({ error: "Input too long." });
    }

    // Subject whitelist
    var allowed = ["General", "Support", "Enterprise", "Partnership"];
    if (!allowed.includes(subject.trim())) {
      return res.status(400).json({ error: "Invalid subject." });
    }

    // Email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Invalid email address." });
    }

    // Trim and insert
    var nameTrim = name.trim();
    var emailTrim = email.trim().toLowerCase();
    var messageTrim = message.trim();

    await pool.query(
      "INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)",
      [nameTrim, emailTrim, subject, messageTrim]
    );
    res.json({ ok: true, message: "Message received. We will get back to you soon." });
  } catch (err) {
    console.error("[contact] Error:", err.message);
    res.status(500).json({ error: "Failed to send message." });
  }
});

// GET /api/contact/messages — admin only (auth required)
router.get("/messages", authenticate, async function (req, res) {
  try {
    // Check admin role
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ error: "Admin access required." });
    }
    var result = await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100");
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages." });
  }
});

module.exports = router;
