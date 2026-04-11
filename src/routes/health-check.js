// BLUN - AI Organisator | MIT License
/**
 * Health Check Route
 * Provides system health status with parallel checks for optimal performance
 */

const express = require('express');
const { execSync } = require('child_process');
const { pool } = require('../db');

const router = express.Router();
const startTime = Date.now();

/**
 * Retrieves the current git hash of the running application
 * @returns {Promise<string>} Git commit hash, or 'unknown' if not available
 */
async function getGitHash() {
  try {
    const hash = execSync('git rev-parse HEAD', {
      cwd: process.env.APP_ROOT || '/root/blun',
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    return hash || 'unknown';
  } catch (err) {
    return 'unknown';
  }
}

/**
 * Checks database connection and responds with connection status
 * @returns {Promise<{status: string, latency?: number, error?: string}>}
 */
async function checkDatabase() {
  const startCheck = Date.now();
  try {
    await pool.query('SELECT NOW() AS ts');
    return {
      status: 'connected',
      latency: Date.now() - startCheck
    };
  } catch (err) {
    return {
      status: 'disconnected',
      error: err.message
    };
  }
}

/**
 * Retrieves PM2 process list and status
 * @returns {Promise<{count: number, processes: Array, error?: string}>}
 */
async function getPM2Processes() {
  try {
    const output = execSync('pm2 list --no-ansi --format json 2>/dev/null || echo "[]"', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const processes = JSON.parse(output || '[]');
    return {
      count: processes.length,
      processes: processes.map(p => ({
        name: p.name || p.script,
        status: p.pm2_env?.status || 'unknown',
        restarts: p.pm2_env?.restart_time || 0,
        uptime: p.pm2_env?.created_at ? Date.now() - new Date(p.pm2_env.created_at).getTime() : 0
      }))
    };
  } catch (err) {
    return {
      count: 0,
      processes: [],
      error: 'PM2 unavailable'
    };
  }
}

/**
 * Calculates system uptime in milliseconds since application start
 * @returns {number} Uptime in milliseconds
 */
function getSystemUptime() {
  return Date.now() - startTime;
}

/**
 * GET /api/health
 * Returns comprehensive health check with parallel status checks
 *
 * Response:
 * {
 *   status: "healthy" | "degraded" | "critical",
 *   timestamp: ISO8601 string,
 *   uptime_ms: number,
 *   uptime_human: string,
 *   git_hash: string,
 *   db_connection: { status, latency?, error? },
 *   pm2_processes: { count, processes, error? },
 *   checks_timestamp: ISO8601 string
 * }
 */
router.get('/', async (req, res) => {
  try {
    const checksStart = Date.now();
    const now = new Date();
    const uptime = getSystemUptime();

    // Run all checks in parallel for optimal performance
    const [
      gitHash,
      dbStatus,
      pm2Status
    ] = await Promise.all([
      getGitHash(),
      checkDatabase(),
      getPM2Processes()
    ]);

    // Determine overall health status
    let overallStatus = 'healthy';
    if (dbStatus.status !== 'connected') {
      overallStatus = 'critical';
    } else if (pm2Status.error || dbStatus.latency > 1000) {
      overallStatus = 'degraded';
    }

    // Format uptime into human-readable format
    const formatUptime = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
      if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    };

    const response = {
      status: overallStatus,
      timestamp: now.toISOString(),
      uptime_ms: uptime,
      uptime_human: formatUptime(uptime),
      git_hash: gitHash,
      db_connection: dbStatus,
      pm2_processes: pm2Status,
      checks_timestamp: new Date(checksStart).toISOString(),
      checks_duration_ms: Date.now() - checksStart
    };

    // Return appropriate HTTP status code
    const statusCode = overallStatus === 'critical' ? 503 : 200;
    res.status(statusCode).json(response);

  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({
      status: 'critical',
      error: 'Health check failed',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
