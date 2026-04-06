// BLUN - AI Organisator | MIT License
const { pool } = require("../db");

async function authenticate(req, res, next) {
  var token = null;
  var authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.blun_token) {
    token = req.cookies.blun_token;
  }
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    var result = await pool.query(
      "SELECT s.*, u.id AS user_id, u.email, u.name, u.avatar_url, u.role, u.plan, u.oauth_provider, u.api_key, u.created_at AS user_created_at " +
      "FROM sessions s JOIN users u ON s.user_id = u.id " +
      "WHERE s.token = $1 AND s.expires_at > NOW()",
      [token]
    );
    if (result.rows.length === 0) {
      req.user = null;
      return next();
    }
    var row = result.rows[0];
    req.user = {
      id: row.user_id,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      role: row.role,
      plan: row.plan,
      oauth_provider: row.oauth_provider,
      api_key: row.api_key,
      created_at: row.user_created_at
    };
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error("[auth] Session check failed:", err.message);
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== "admin" && req.user.role !== "owner") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { authenticate, requireAuth, requireAdmin };
