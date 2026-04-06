// BLUN - AI Organisator | MIT License
// DSGVO/GDPR compliance routes
const express = require("express");
const { pool } = require("../db");
const { authenticate, requireAuth } = require("../middleware/auth");
const { logActivity } = require("../middleware/activity");

var router = express.Router();

// GET /privacy/policy — public
router.get("/policy", function (req, res) {
  res.json({
    title: "BLUN Privacy Policy (DSGVO/GDPR)",
    last_updated: "2026-04-06",
    controller: "BLUN AI Organisator",
    sections: [
      { heading: "1. Data We Collect", text: "We collect: email, name, usage data (agents created, messages sent), payment information (processed by Stripe), and technical data (IP address, browser info)." },
      { heading: "2. Legal Basis (Art. 6 DSGVO)", text: "Processing is based on: (a) contract performance for service delivery, (b) consent for optional features, (c) legitimate interest for security and fraud prevention." },
      { heading: "3. Data Storage", text: "Your data is stored on servers in Germany (Hetzner). We retain data only as long as necessary for the stated purposes or as required by law." },
      { heading: "4. Your Rights (Art. 15-22 DSGVO)", text: "You have the right to: access your data (Art. 15), rectify inaccurate data (Art. 16), erase your data (Art. 17), restrict processing (Art. 18), data portability (Art. 20), and object to processing (Art. 21)." },
      { heading: "5. Data Export (Art. 15/20)", text: "Use the Export function in your privacy settings to download all your personal data in machine-readable JSON format." },
      { heading: "6. Account Deletion (Art. 17)", text: "You can delete your account and all associated data at any time. This action is irreversible." },
      { heading: "7. Third Parties", text: "We share data only with: Stripe (payments), AI model providers (OpenAI, Anthropic) for agent functionality. All processors are GDPR-compliant." },
      { heading: "8. Cookies", text: "We use a single session cookie (blun_token) required for authentication. No tracking cookies." },
      { heading: "9. Contact", text: "For privacy inquiries, contact us through the platform or at the address listed in our Impressum." }
    ]
  });
});

// POST /privacy/consent — record consent
router.post("/consent", authenticate, requireAuth, async function (req, res) {
  try {
    var { consent_type, granted } = req.body;
    if (!consent_type) return res.status(400).json({ error: "consent_type required" });
    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    await pool.query(
      "INSERT INTO consent_records (user_id, consent_type, granted, ip_address) VALUES ($1, $2, $3, $4)",
      [req.user.id, consent_type, granted !== false, ip]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[privacy] consent error:", err.message);
    res.status(500).json({ error: "Failed to record consent" });
  }
});

// GET /privacy/export — export all user data (Art. 15/20)
router.get("/export", authenticate, requireAuth, async function (req, res) {
  try {
    var userId = req.user.id;
    var user = await pool.query("SELECT id, email, name, role, plan, oauth_provider, created_at, last_login FROM users WHERE id = $1", [userId]);
    var agents = await pool.query("SELECT id, name, model, system_prompt, status, created_at FROM agents WHERE owner_id = $1", [userId]);
    var conversations = await pool.query("SELECT id, agent_id, title, created_at FROM conversations WHERE user_id = $1", [userId]);
    var messages = await pool.query(
      "SELECT m.id, m.conversation_id, m.role, m.content, m.created_at FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.user_id = $1 ORDER BY m.created_at",
      [userId]
    );
    var costs = await pool.query("SELECT * FROM cost_events WHERE user_id = $1 ORDER BY created_at", [userId]);
    var consents = await pool.query("SELECT consent_type, granted, created_at FROM consent_records WHERE user_id = $1 ORDER BY created_at", [userId]);
    var activity = await pool.query("SELECT action, details, ip_address, created_at FROM activity_log WHERE user_id = $1 ORDER BY created_at", [userId]);

    var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    logActivity(userId, "data_export", {}, ip);

    res.json({
      exported_at: new Date().toISOString(),
      user: user.rows[0],
      agents: agents.rows,
      conversations: conversations.rows,
      messages: messages.rows,
      cost_events: costs.rows,
      consent_records: consents.rows,
      activity_log: activity.rows
    });
  } catch (err) {
    console.error("[privacy] export error:", err.message);
    res.status(500).json({ error: "Failed to export data" });
  }
});

// DELETE /privacy/account — delete account and all data (Art. 17)
router.delete("/account", authenticate, requireAuth, async function (req, res) {
  try {
    var userId = req.user.id;
    var confirm = req.body.confirm;
    if (confirm !== true && confirm !== "true") {
      return res.status(400).json({ error: "Must confirm deletion with {confirm: true}" });
    }
    var user = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
    if (user.rows[0] && user.rows[0].role === "owner") {
      return res.status(400).json({ error: "Owner account cannot self-delete. Transfer ownership first." });
    }
    // Delete all user data
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM consent_records WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM cost_events WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM conversations WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM agents WHERE owner_id = $1", [userId]);
    await pool.query("DELETE FROM activity_log WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    res.clearCookie("blun_token");
    res.json({ ok: true, message: "Account and all data permanently deleted" });
  } catch (err) {
    console.error("[privacy] account delete error:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
