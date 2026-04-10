const rateStore = new Map();
const RATE_LIMIT = 100;
const WINDOW_SIZE = 60000; // 1 minute in ms

function cleanup() {
    const now = Date.now();
    for (const [ip, data] of rateStore.entries()) {
        data.requests = data.requests.filter(timestamp => now - timestamp < WINDOW_SIZE);
        if (data.requests.length === 0) {
            rateStore.delete(ip);
        }
    }
}

function rateLimiter(req, res, next) {
    // Only apply to /api/* routes
    if (!req.path.startsWith('/api/')) {
        return next();
    }

    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Initialize or get client data
    if (!rateStore.has(clientIP)) {
        rateStore.set(clientIP, { requests: [] });
    }

    const clientData = rateStore.get(clientIP);

    // Filter out old requests (outside time window)
    clientData.requests = clientData.requests.filter(timestamp => now - timestamp < WINDOW_SIZE);

    // Check if limit exceeded
    if (clientData.requests.length >= RATE_LIMIT) {
        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Maximum ${RATE_LIMIT} requests per minute allowed.`,
            retryAfter: Math.ceil(WINDOW_SIZE / 1000)
        });
    }

    // Add current request
    clientData.requests.push(now);

    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance to cleanup
        setImmediate(cleanup);
    }

    next();
}

module.exports = rateLimiter;
