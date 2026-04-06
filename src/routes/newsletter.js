// BLUN - AI Organisator | MIT License
// Newsletter routes
const express = require("express");
const { pool } = require("../db");

var router = express.Router();

// POST /api/newsletter/subscribe — public, no auth
router.post("/subscribe", async function (req, res) {
  try {
    var { email } = req.body;
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    await pool.query(
      "INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL, subscribed_at = NOW()",
      [email.trim().toLowerCase()]
    );
    res.json({ ok: true, message: "You're in! We'll keep you posted." });
  } catch (err) {
    console.error("[newsletter] Subscribe error:", err.message);
    res.status(500).json({ error: "Failed to subscribe." });
  }
});

// POST /api/newsletter/unsubscribe — public
router.post("/unsubscribe", async function (req, res) {
  try {
    var { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required." });
    await pool.query(
      "UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    res.json({ ok: true, message: "You have been unsubscribed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to unsubscribe." });
  }
});

// GET /api/newsletter/subscribers — admin, requires auth (handled by /api middleware)
router.get("/subscribers", async function (req, res) {
  try {
    var result = await pool.query(
      "SELECT id, email, subscribed_at, unsubscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC"
    );
    var active = result.rows.filter(function(r) { return !r.unsubscribed_at; });
    res.json({ total: result.rows.length, active: active.length, subscribers: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load subscribers." });
  }
});

// POST /api/newsletter/send — save as draft (admin)
router.post("/send", async function (req, res) {
  try {
    var { subject, body, template, scheduled_at } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and body are required." });
    }
    var status = scheduled_at ? "scheduled" : "draft";
    var result = await pool.query(
      "INSERT INTO newsletters (subject, body, template, status, scheduled_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [subject, body, template || "simple", status, scheduled_at || null]
    );
    res.json({ ok: true, newsletter: result.rows[0] });
  } catch (err) {
    console.error("[newsletter] Send error:", err.message);
    res.status(500).json({ error: "Failed to save newsletter." });
  }
});

// GET /api/newsletter/drafts — admin
router.get("/drafts", async function (req, res) {
  try {
    var result = await pool.query("SELECT * FROM newsletters ORDER BY created_at DESC LIMIT 50");
    res.json({ newsletters: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load newsletters." });
  }
});

module.exports = router;
