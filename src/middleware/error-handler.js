const fs = require('fs');
const path = require('path');

const errorHandler = (err, req, res, next) => {
    const timestamp = new Date().toISOString();
    const errorCode = err.statusCode || err.code || 500;
    const errorMessage = err.message || 'Internal Server Error';

    const errorLog = {
        timestamp,
        error: errorMessage,
        code: errorCode,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    };

    // Log to file
    const logEntry = JSON.stringify(errorLog) + '\n';
    fs.appendFileSync('/tmp/blun-errors.log', logEntry);

    // Send response
    res.status(errorCode).json({
        error: errorMessage,
        code: errorCode,
        timestamp
    });
};

module.exports = errorHandler;