const fs = require('fs');
const path = require('path');

const LOG_FILE = '/tmp/blun-requests.log';

function requestLogger(req, res, next) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Override res.end to capture the final status
    const originalEnd = res.end;
    res.end = function(...args) {
        const duration_ms = Date.now() - startTime;

        const logEntry = {
            timestamp,
            method: req.method,
            path: req.path || req.url,
            status: res.statusCode,
            duration_ms
        };

        const logLine = JSON.stringify(logEntry) + '\n';

        // Append to log file
        fs.appendFileSync(LOG_FILE, logLine);

        // Call original end method
        originalEnd.apply(res, args);
    };

    next();
}

module.exports = requestLogger;