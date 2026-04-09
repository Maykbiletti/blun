/**
 * CORS Middleware für BLUN.ai
 * Whitelist-basiert mit Preflight-Handler und CDN-optimiert
 */

const ALLOWED_ORIGINS = [
    'https://blun.ai',
    'https://www.blun.ai',
    'https://dashboard.blun.ai',
    'https://api.blun.ai',
    'http://localhost:3200',  // Development
    'http://localhost:3000',  // Frontend Dev
    'http://127.0.0.1:3200',
    'http://127.0.0.1:3000'
];

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
const ALLOWED_HEADERS = [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-API-Key',
    'X-Client-Version'
];

/**
 * CORS Origin Check
 */
function isOriginAllowed(origin) {
    if (!origin) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

/**
 * CORS Preflight Handler
 */
function handlePreflight(req, res) {
    const origin = req.headers.origin;

    if (!isOriginAllowed(origin)) {
        return res.status(403).json({
            error: 'CORS origin not allowed',
            origin: origin
        });
    }

    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24h Cache

    // CDN Caching Vary Headers
    res.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');

    res.status(200).end();
}

/**
 * CORS Middleware
 */
function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    // OPTIONS Preflight Request
    if (req.method === 'OPTIONS') {
        return handlePreflight(req, res);
    }

    // Origin Check für alle anderen Requests
    if (origin && isOriginAllowed(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
    }

    // Standard Headers für alle Responses
    res.header('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));

    // CDN Vary Headers für Cache Optimization
    res.header('Vary', 'Origin, Accept-Encoding');

    // Security: Expose Only Safe Headers
    res.header('Access-Control-Expose-Headers', 'X-Total-Count, X-RateLimit-*');

    next();
}

module.exports = corsMiddleware;