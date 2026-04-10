// BLUN - AI Organisator | MIT License
// Newsletter routes
const express = require("express");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { validateNewsletterPayload, renderNewsletterHtml } = require("../services/newsletter-renderer");

var router = express.Router();

// POST /api/newsletter/subscribe — public, no auth, rate-limited
router.post("/subscribe", async function (req, res) {
  try {
    var { email } = req.body;

    // Type and existence check
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    email = email.trim().toLowerCase();

    // Length check
    if (email.length > 100) {
      return res.status(400).json({ error: "Email address too long." });
    }

    // Email format validation (strict RFC-ish)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    await pool.query(
      "INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL, subscribed_at = NOW()",
      [email]
    );
    res.json({ ok: true, message: "You're in! We'll keep you posted." });
  } catch (err) {
    console.error("[newsletter] Subscribe error:", err.message);
    res.status(500).json({ error: "Failed to subscribe." });
  }
});

// POST /api/newsletter/unsubscribe — public, no auth, rate-limited
router.post("/unsubscribe", async function (req, res) {
  try {
    var { email } = req.body;

    // Type and existence check
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: "Email required." });
    }

    email = email.trim().toLowerCase();

    // Length and format check
    if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email address." });
    }

    await pool.query(
      "UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE email = $1",
      [email]
    );
    res.json({ ok: true, message: "You have been unsubscribed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to unsubscribe." });
  }
});

// GET /api/newsletter/subscribers — admin only (auth required)
router.get("/subscribers", authenticate, async function (req, res) {
  try {
    // Check admin role
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ error: "Admin access required." });
    }
    var result = await pool.query(
      "SELECT id, email, subscribed_at, unsubscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC"
    );
    var active = result.rows.filter(function(r) { return !r.unsubscribed_at; });
    res.json({ total: result.rows.length, active: active.length, subscribers: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load subscribers." });
  }
});

// POST /api/newsletter/send — save as draft (admin only)
router.post("/send", authenticate, async function (req, res) {
  try {
    // Check admin role
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ error: "Admin access required." });
    }
    var { subject, body, template, scheduled_at } = req.body;
    if (!subject) {
      return res.status(400).json({ error: "Subject and body are required." });
    }
    if ((template || "simple") !== "marketing_rich" && !body) {
      return res.status(400).json({ error: "Subject and body are required." });
    }
    // Validate subject/body length
    if (subject.length > 200 || (body && body.length > 10000)) {
      return res.status(400).json({ error: "Subject or body too long." });
    }
    var finalSubject = subject.trim();
    var finalBody = body ? body.trim() : "";
    var selectedTemplate = template || "simple";
    if (selectedTemplate === "marketing_rich") {
      var payloadValidation = validateNewsletterPayload({
        subject: finalSubject,
        body: finalBody,
        preheader: req.body.preheader,
        cta_label: req.body.cta_label,
        cta_url: req.body.cta_url,
        sections: req.body.sections,
        campaign: req.body.campaign
      });
      if (!payloadValidation.valid) {
        return res.status(400).json({ error: payloadValidation.error });
      }
      var rendered = renderNewsletterHtml({
        subject: finalSubject,
        body: finalBody,
        preheader: req.body.preheader,
        cta_label: req.body.cta_label,
        cta_url: req.body.cta_url,
        sections: req.body.sections,
        campaign: req.body.campaign
      });
      if (!rendered.ok) {
        return res.status(400).json({ error: rendered.error || "Failed to render template." });
      }
      finalBody = rendered.html;
    }

    var status = scheduled_at ? "scheduled" : "draft";
    var result = await pool.query(
      "INSERT INTO newsletters (subject, body, template, status, scheduled_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [finalSubject, finalBody, selectedTemplate, status, scheduled_at || null]
    );
    res.json({ ok: true, newsletter: result.rows[0] });
  } catch (err) {
    console.error("[newsletter] Send error:", err.message);
    res.status(500).json({ error: "Failed to save newsletter." });
  }
});

// POST /api/newsletter/preview — admin only (auth required)
router.post("/preview", authenticate, async function (req, res) {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ error: "Admin access required." });
    }
    var payload = {
      subject: req.body.subject,
      body: req.body.body || req.body.intro,
      preheader: req.body.preheader,
      cta_label: req.body.cta_label,
      cta_url: req.body.cta_url,
      sections: req.body.sections,
      campaign: req.body.campaign
    };
    var validation = validateNewsletterPayload(payload);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    var rendered = renderNewsletterHtml(payload);
    if (!rendered.ok) {
      return res.status(400).json({ error: rendered.error || "Template rendering failed." });
    }
    res.json({
      ok: true,
      html: rendered.html,
      text: rendered.text,
      meta: rendered.meta
    });
  } catch (err) {
    console.error("[newsletter] Preview error:", err.message);
    res.status(500).json({ error: "Failed to render newsletter preview." });
  }
});

// GET /api/newsletter/drafts — admin only (auth required)
router.get("/drafts", authenticate, async function (req, res) {
  try {
    // Check admin role
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "owner")) {
      return res.status(403).json({ error: "Admin access required." });
    }
    var result = await pool.query("SELECT * FROM newsletters ORDER BY created_at DESC LIMIT 50");
    res.json({ newsletters: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load newsletters." });
  }
});

module.exports = router;
