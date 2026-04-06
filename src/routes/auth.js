// BLUN - AI Organisator | MIT License
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");
const { authenticate, requireAuth } = require("../middleware/auth");

var router = express.Router();

function generateToken() {
  return crypto.randomBytes(48).toString("base64url");
}

async function createSession(userId) {
  var token = generateToken();
  var expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
    [userId, token, expires]
  );
  await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [userId]);
  return { token: token, expires_at: expires };
}

// POST /auth/register
router.post("/register", async function (req, res) {
  try {
    var { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    var existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }
    var hash = await bcrypt.hash(password, 12);
    var result = await pool.query(
      "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role, plan, created_at",
      [email.toLowerCase(), hash, name]
    );
    var user = result.rows[0];
    var session = await createSession(user.id);
    res.cookie("blun_token", session.token, { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user: user, token: session.token, expires_at: session.expires_at });
  } catch (err) {
    console.error("[auth] Register error:", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /auth/login
router.post("/login", async function (req, res) {
  try {
    var { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    var result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    var user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: "This account uses OAuth login" });
    }
    var valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    var session = await createSession(user.id);
    res.cookie("blun_token", session.token, { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan, avatar_url: user.avatar_url, created_at: user.created_at },
      token: session.token,
      expires_at: session.expires_at
    });
  } catch (err) {
    console.error("[auth] Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /auth/logout
router.post("/logout", authenticate, async function (req, res) {
  try {
    if (req.sessionToken) {
      await pool.query("DELETE FROM sessions WHERE token = $1", [req.sessionToken]);
    }
    res.clearCookie("blun_token");
    res.json({ ok: true });
  } catch (err) {
    console.error("[auth] Logout error:", err.message);
    res.status(500).json({ error: "Logout failed" });
  }
});

// GET /auth/me
router.get("/me", authenticate, requireAuth, async function (req, res) {
  res.json({ user: req.user });
});

// OAuth placeholders
router.get("/github", function (req, res) {
  res.status(501).json({ error: "GitHub OAuth not configured yet" });
});
router.get("/github/callback", function (req, res) {
  res.status(501).json({ error: "GitHub OAuth not configured yet" });
});
router.get("/google", function (req, res) {
  res.status(501).json({ error: "Google OAuth not configured yet" });
});
router.get("/google/callback", function (req, res) {
  res.status(501).json({ error: "Google OAuth not configured yet" });
});

module.exports = router;
