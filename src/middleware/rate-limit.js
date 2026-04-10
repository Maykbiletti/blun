/**
 * Rate Limiter Middleware
 * Max 100 requests per minute per IP for /api/* endpoints
 */

const rateLimits = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [ip, data] of rateLimits.entries()) {
        if (now > data.resetTime) {
            rateLimits.delete(ip);
        }
    }
}

function rateLimit(req, res, next) {
    // Only apply to /api/* endpoints
    if (!req.path.startsWith('/api/')) {
        return next();
    }

    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const now = Date.now();

    // Cleanup expired entries periodically
    if (Math.random() < 0.1) { // 10% chance
        cleanupExpiredEntries();
    }

    let ipData = rateLimits.get(ip);

    if (!ipData) {
        // First request from this IP
        rateLimits.set(ip, {
            count: 1,
            resetTime: now + WINDOW_MS
        });
        return next();
    }

    if (now > ipData.resetTime) {
        // Window has expired, reset
        ipData.count = 1;
        ipData.resetTime = now + WINDOW_MS;
        return next();
    }

    if (ipData.count >= MAX_REQUESTS) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((ipData.resetTime - now) / 1000);

        res.set({
            'Retry-After': retryAfter,
            'X-RateLimit-Limit': MAX_REQUESTS,
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': new Date(ipData.resetTime).toISOString()
        });

        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            retryAfter: retryAfter
        });
    }

    // Increment counter
    ipData.count++;

    // Add headers for client info
    res.set({
        'X-RateLimit-Limit': MAX_REQUESTS,
        'X-RateLimit-Remaining': Math.max(0, MAX_REQUESTS - ipData.count),
        'X-RateLimit-Reset': new Date(ipData.resetTime).toISOString()
    });

    next();
}

module.exports = rateLimit;