// rate-limiter DISABLED 2026-04-10 — Upstash not configured, limit too low for asset loads
// Keep export shape so server.js does not break
module.exports = function (req, res, next) { return next(); };
