#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const HEALTH_ENDPOINT = '/api/health';
const LOG_FILE = '/tmp/blun-health.log';
const CHECK_INTERVAL = 60000; // 60 seconds

function log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
}

async function checkHealth() {
    try {
        const response = await fetch(`http://localhost:3000${HEALTH_ENDPOINT}`, {
            timeout: 5000
        });

        if (!response.ok) {
            log(`HEALTH CHECK FAILED: HTTP ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        log(`HEALTH CHECK ERROR: ${error.message}`);
    }
}

// Initialize log file
log('Health monitor started');

// Start monitoring
setInterval(checkHealth, CHECK_INTERVAL);

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('Health monitor stopped');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Health monitor stopped');
    process.exit(0);
});

// Initial check
checkHealth();