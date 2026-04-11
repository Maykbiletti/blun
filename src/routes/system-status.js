const express = require('express');
const { exec } = require('child_process');
const { pool } = require('../db');

const router = express.Router();

function execCommand(command) {
  return new Promise(function (resolve, reject) {
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, function (error, stdout, stderr) {
      if (error) {
        error.stderr = stderr;
        return reject(error);
      }
      resolve((stdout || '').trim());
    });
  });
}

function toNumber(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getPm2Status() {
  try {
    var raw = await execCommand('pm2 jlist');
    var list = JSON.parse(raw || '[]');
    var now = Date.now();

    return {
      ok: true,
      count: Array.isArray(list) ? list.length : 0,
      processes: (Array.isArray(list) ? list : []).map(function (proc) {
        var env = proc.pm2_env || {};
        var monit = proc.monit || {};
        var pmUptime = toNumber(env.pm_uptime, 0);
        var uptimeSeconds = pmUptime > 0 ? Math.max(0, Math.floor((now - pmUptime) / 1000)) : 0;

        return {
          name: proc.name || null,
          pm_id: proc.pm_id,
          status: env.status || null,
          cpu_percent: toNumber(monit.cpu, 0),
          memory_bytes: toNumber(monit.memory, 0),
          uptime_seconds: uptimeSeconds
        };
      })
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      processes: []
    };
  }
}

async function getPostgresStatus() {
  try {
    var result = await pool.query('SELECT NOW() AS ts');
    return {
      ok: true,
      timestamp: result.rows[0] && result.rows[0].ts ? result.rows[0].ts : null
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

async function getDiskStatus() {
  try {
    var output = await execCommand('df -k /root');
    var lines = output.split('\n').filter(Boolean);
    var row = lines.length > 1 ? lines[1] : '';
    var parts = row.trim().split(/\s+/);

    if (parts.length < 6) {
      throw new Error('Unexpected df output format');
    }

    return {
      ok: true,
      filesystem: parts[0],
      size_kb: toNumber(parts[1], 0),
      used_kb: toNumber(parts[2], 0),
      available_kb: toNumber(parts[3], 0),
      used_percent: toNumber(parts[4].replace('%', ''), 0),
      mountpoint: parts.slice(5).join(' ')
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

router.get('/', async function (_req, res) {
  var values = await Promise.all([getPm2Status(), getPostgresStatus(), getDiskStatus()]);
  var pm2 = values[0];
  var postgres = values[1];
  var disk = values[2];
  var ok = pm2.ok && postgres.ok && disk.ok;

  res.status(ok ? 200 : 503).json({
    ok: ok,
    timestamp: new Date().toISOString(),
    pm2: pm2,
    postgres: postgres,
    disk: disk
  });
});

module.exports = router;
