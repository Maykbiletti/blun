// BLUN - AI Organisator | MIT License
const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { pool } = require("../db");

var router = express.Router();

// Ensure uploads dir exists
var uploadsDir = path.join(__dirname, "..", "..", "dashboard", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

var upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadsDir); },
    filename: function (req, file, cb) {
      var ext = path.extname(file.originalname) || ".jpg";
      cb(null, "avatar-" + req.user.id + "-" + Date.now() + ext);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  }
});

// Plan limits
var PLAN_LIMITS = {
  free: { agents: 3, messages: 50 },
  pro: { agents: 20, messages: 500 },
  enterprise: { agents: 100, messages: 5000 }
};

// GET /api/profile
router.get("/", async function (req, res) {
  try {
    var result = await pool.query(
      "SELECT id, email, name, avatar_url, role, plan, created_at, last_login FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    var user = result.rows[0];
    var plan = (user.plan || "free").toLowerCase();
    var limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Count agents (via companies owned by user, if link exists)
    var agentsUsed = 0;
    try {
      var agentsRes = await pool.query("SELECT COUNT(*) as cnt FROM agents");
      agentsUsed = parseInt(agentsRes.rows[0].cnt, 10);
    } catch(e) {}

    // Count messages today
    var msgsToday = 0;
    try {
      var msgsRes = await pool.query("SELECT COUNT(*) as cnt FROM messages WHERE created_at >= CURRENT_DATE");
      msgsToday = parseInt(msgsRes.rows[0].cnt, 10);
    } catch(e) {}

    res.json({
      user: user,
      usage: {
        agents_used: agentsUsed,
        agents_limit: limits.agents,
        messages_today: msgsToday,
        messages_limit: limits.messages
      }
    });
  } catch (err) {
    console.error("[profile] GET error:", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PUT /api/profile
router.put("/", async function (req, res) {
  try {
    var { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
    // Check email uniqueness if changed
    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      var existing = await pool.query("SELECT id FROM users WHERE email = $1 AND id != $2", [email.toLowerCase(), req.user.id]);
      if (existing.rows.length > 0) return res.status(409).json({ error: "Email already in use" });
    }
    await pool.query("UPDATE users SET name = $1, email = $2 WHERE id = $3", [name, email.toLowerCase(), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[profile] PUT error:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// PUT /api/profile/password
router.put("/password", async function (req, res) {
  try {
    var { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: "Current and new password are required" });
    if (new_password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    var result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (!result.rows[0].password_hash) return res.status(400).json({ error: "Account uses OAuth — no password to change" });
    var valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    var hash = await bcrypt.hash(new_password, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[profile] Password error:", err.message);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// POST /api/profile/avatar
router.post("/avatar", upload.single("avatar"), async function (req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    var url = "/dashboard/uploads/" + req.file.filename;
    await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [url, req.user.id]);
    res.json({ ok: true, avatar_url: url });
  } catch (err) {
    console.error("[profile] Avatar error:", err.message);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

// DELETE /api/profile
router.delete("/", async function (req, res) {
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    res.clearCookie("blun_token");
    res.json({ ok: true });
  } catch (err) {
    console.error("[profile] DELETE error:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
