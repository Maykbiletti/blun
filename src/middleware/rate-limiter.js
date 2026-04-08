// /root/blun/src/middleware/rate-limiter.js
// IP-basiertes Rate Limiting: Differenziert Public (10/min) vs. Protected (120/min)

const WINDOW_MS = 60 * 1000;
const PUBLIC_LIMIT = 10;      // /api/contact, /api/newsletter/subscribe
const PROTECTED_LIMIT = 120;   // All /api/* routes (auth required)
const ADMIN_LIMIT = 30;        // /api/admin/* routes (extra strict)

// Track hits: { ip: { count: N, start: timestamp, type: 'public'|'protected'|'admin' } }
const hits = new Map();

// Cleanup old entries every 5 minutes
setInterval(function () {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now - entry.start > WINDOW_MS) {
      hits.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function rateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Localhost / internal requests are EXEMPT
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  // Determine endpoint type
  let endpointType = 'protected';
  let limit = PROTECTED_LIMIT;

  // Public endpoints (strict limit)
  if (req.path === '/api/contact' ||
      req.path === '/api/newsletter/subscribe' ||
      req.path === '/api/newsletter/unsubscribe' ||
      req.path === '/api/i18n/detect' ||
      req.path === '/api/i18n/languages' ||
      req.path.startsWith('/api/i18n/')) {
    endpointType = 'public';
    limit = PUBLIC_LIMIT;
  }
  // Admin endpoints (very strict)
  else if (req.path.startsWith('/api/admin')) {
    endpointType = 'admin';
    limit = ADMIN_LIMIT;
  }

  const now = Date.now();
  let entry = hits.get(ip);

  // New time window or first request
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { count: 1, start: now, type: endpointType };
    hits.set(ip, entry);
    return next();
  }

  entry.count++;

  // Check limit
  if (entry.count > limit) {
    return res.status(429).json({
      error: 'Too many requests',
      type: endpointType,
      limit: limit,
      retry_after: Math.ceil((entry.start + WINDOW_MS - now) / 1000)
    });
  }

  next();
}

module.exports = rateLimiter;
