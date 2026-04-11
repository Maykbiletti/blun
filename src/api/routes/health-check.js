const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const router = express.Router();

// Initialize Postgres pool
const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'blun',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 1,
});

// Initialize Redis client
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  connect_timeout: 5000,
});

/**
 * Check Postgres connection
 */
async function checkPostgres() {
  try {
    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    return { status: 'healthy', message: 'Connected' };
  } catch (err) {
    return { status: 'unhealthy', message: err.message };
  }
}

/**
 * Check Redis connection
 */
async function checkRedis() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ status: 'unhealthy', message: 'Connection timeout' });
    }, 5000);

    redisClient.ping((err, reply) => {
      clearTimeout(timeout);
      if (err) {
        resolve({ status: 'unhealthy', message: err.message });
      } else if (reply === 'PONG') {
        resolve({ status: 'healthy', message: 'Connected' });
      } else {
        resolve({ status: 'unhealthy', message: 'Invalid response' });
      }
    });
  });
}

/**
 * Check disk space
 */
function checkDiskSpace() {
  try {
    const result = execSync('df -B1 / | tail -1').toString().split(/\s+/);
    const total = parseInt(result[1], 10);
    const used = parseInt(result[2], 10);
    const available = parseInt(result[3], 10);
    const usagePercent = ((used / total) * 100).toFixed(2);

    const threshold = 90;
    const status = usagePercent > threshold ? 'unhealthy' : 'healthy';

    return {
      status,
      total,
      used,
      available,
      usagePercent: parseFloat(usagePercent),
      message: `${usagePercent}% used`,
    };
  } catch (err) {
    return { status: 'unhealthy', message: err.message };
  }
}

/**
 * Check system memory
 */
function checkMemory() {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercent = ((usedMemory / totalMemory) * 100).toFixed(2);

    const threshold = 85;
    const status = usagePercent > threshold ? 'unhealthy' : 'healthy';

    return {
      status,
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      usagePercent: parseFloat(usagePercent),
      message: `${usagePercent}% used`,
    };
  } catch (err) {
    return { status: 'unhealthy', message: err.message };
  }
}

/**
 * Check PM2 process status
 */
function checkPM2Status() {
  try {
    const result = execSync('pm2 list --no-color 2>/dev/null || echo "not_running"').toString();

    if (result.includes('not_running') || result.trim() === '') {
      return {
        status: 'healthy',
        message: 'PM2 not running (acceptable)',
        processCount: 0,
      };
    }

    const lines = result.split('\n').filter(line => line.includes('online') || line.includes('stopped'));
    const onlineCount = lines.filter(line => line.includes('online')).length;
    const stoppedCount = lines.filter(line => line.includes('stopped')).length;

    const status = stoppedCount > 0 ? 'unhealthy' : 'healthy';

    return {
      status,
      online: onlineCount,
      stopped: stoppedCount,
      message: `${onlineCount} online, ${stoppedCount} stopped`,
    };
  } catch (err) {
    return {
      status: 'healthy',
      message: 'PM2 unavailable (acceptable)',
      processCount: 0,
    };
  }
}

/**
 * GET /api/health - Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const checks = {
      postgres: await checkPostgres(),
      redis: await checkRedis(),
      disk: checkDiskSpace(),
      memory: checkMemory(),
      pm2: checkPM2Status(),
    };

    const healthy = Object.values(checks).every(check => check.status === 'healthy');

    res.status(healthy ? 200 : 503).json({
      healthy,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      healthy: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
