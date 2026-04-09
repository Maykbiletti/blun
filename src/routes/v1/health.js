const express = require('express');
const db = require('../../db');
const logger = require('../../logger');

const router = express.Router();

// GET /health — Health Check mit DB-Connection + Memory Usage
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  try {
    // 1. Test DB Connection
    let dbHealth = { status: 'healthy', responseTime: 0 };
    try {
      const dbStart = Date.now();
      await db.query('SELECT 1 as ping');
      dbHealth.responseTime = Date.now() - dbStart;
    } catch (err) {
      dbHealth.status = 'unhealthy';
      dbHealth.error = err.message;
      logger.error('DB Health Check Failed:', err);
    }

    // 2. Memory Usage
    const endMemory = process.memoryUsage();
    const memoryUsage = {
      heapUsed: Math.round(endMemory.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(endMemory.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(endMemory.rss / 1024 / 1024) + 'MB',
      external: Math.round(endMemory.external / 1024 / 1024) + 'MB'
    };

    // 3. Uptime
    const uptime = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`;

    // 4. Response
    const responseTime = Date.now() - startTime;
    const overallStatus = dbHealth.status === 'healthy' ? 'healthy' : 'degraded';

    res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      uptime: {
        seconds: uptime,
        formatted: uptimeFormatted
      },
      checks: {
        database: dbHealth,
        server: {
          status: 'healthy',
          responseTime: responseTime + 'ms'
        }
      },
      memory: memoryUsage,
      environment: process.env.NODE_ENV || 'development'
    });

    // Log health check if DB is unhealthy
    if (dbHealth.status !== 'healthy') {
      logger.warn('Health Check: DB Unhealthy', { dbHealth, memory: memoryUsage });
    }

  } catch (err) {
    logger.error('Health Check Error:', err);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message,
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

module.exports = router;
