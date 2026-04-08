// /root/blun/src/middleware/rate-limiter.js
// IP-basiertes Rate Limiting: 30 req/min, 429 bei Ueberschreitung

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

const hits = new Map();

// Cleanup alle 5 Minuten
setInterval(function () {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.start > WINDOW_MS) hits.delete(ip);
  }
}, 5 * 60 * 1000);

function rateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = hits.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { count: 1, start: now };
    hits.set(ip, entry);
    return next();
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  next();
}

module.exports = rateLimiter;
