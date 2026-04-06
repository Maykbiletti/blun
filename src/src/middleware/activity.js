// BLUN - AI Organisator | MIT License
// Activity logging middleware
const { pool } = require("../db");

async function logActivity(userId, action, details, ipAddress) {
  try {
    await pool.query(
      "INSERT INTO activity_log (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)",
      [userId, action, details || {}, ipAddress || null]
    );
  } catch (err) {
    console.error("[activity] Log error:", err.message);
  }
}

function activityLogger(action, detailsFn) {
  return function (req, res, next) {
    var originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode < 400) {
        var userId = req.user ? req.user.id : null;
        var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
        var details = detailsFn ? detailsFn(req, data) : {};
        logActivity(userId, action, details, ip);
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { logActivity, activityLogger };
