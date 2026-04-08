#!/usr/bin/env node

/**
 * PM2 Monitoring Script
 * - Alert wenn RAM > 80 GB
 * - Alert wenn Prozess crasht
 * - Log an /root/backups/pm2-monitor.log
 */

const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const LOG_FILE = '/root/backups/pm2-monitor.log';
const RAM_THRESHOLD_GB = 80;
const CHECK_INTERVAL = 60000; // 1 Minute

// Logging Helper
function log(level, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);

  // Append to log file
  fs.appendFileSync(LOG_FILE, logLine + '\n', (err) => {
    if (err) console.error('Log write error:', err);
  });
}

// Get total system RAM in GB
function getTotalRAM() {
  return os.totalmem() / (1024 * 1024 * 1024);
}

// Get used RAM in GB
function getUsedRAM() {
  const used = os.totalmem() - os.freemem();
  return used / (1024 * 1024 * 1024);
}

// Check RAM usage
async function checkRAM() {
  const used = getUsedRAM();
  const total = getTotalRAM();
  const percent = (used / total) * 100;

  if (used > RAM_THRESHOLD_GB) {
    log('WARN', `RAM USAGE HIGH: ${used.toFixed(2)}GB / ${total.toFixed(2)}GB (${percent.toFixed(1)}%)`);

    // Try to get PM2 process breakdown
    try {
      const { stdout } = await execAsync('pm2 monit --nostream 2>&1 | head -30', { timeout: 5000 });
      log('INFO', `PM2 Status:\n${stdout}`);
    } catch (err) {
      log('ERROR', `Failed to get PM2 status: ${err.message}`);
    }

    return false; // Alert triggered
  } else {
    log('OK', `RAM: ${used.toFixed(2)}GB / ${total.toFixed(2)}GB (${percent.toFixed(1)}%)`);
    return true;
  }
}

// Check PM2 process status
async function checkProcesses() {
  try {
    const { stdout } = await execAsync('pm2 list --nostream 2>&1');
    const lines = stdout.split('\n');

    let hasCrashed = false;

    // Look for crashed or errored processes
    for (const line of lines) {
      if (line.includes('stopped') || line.includes('errored') || line.includes('crashed')) {
        log('ERROR', `Process failure detected: ${line.trim()}`);
        hasCrashed = true;
      }
    }

    if (!hasCrashed) {
      log('OK', 'All PM2 processes healthy');
    }

    return !hasCrashed;
  } catch (err) {
    log('ERROR', `PM2 list failed: ${err.message}`);
    return false;
  }
}

// Send alert (stub for Slack/Email integration)
async function sendAlert(alertType, message) {
  log('ALERT', `[${alertType}] ${message}`);

  // TODO: Integrate with Slack webhook or Email service
  // Example:
  // curl -X POST -H 'Content-type: application/json' \
  //   --data '{"text":"BLUN Alert: '${message}'"}' \
  //   $SLACK_WEBHOOK_URL

  // For now, just log and create alert file
  const alertFile = `/root/backups/alerts/${new Date().toISOString().replace(/:/g, '-')}_${alertType}.txt`;
  try {
    fs.mkdirSync('/root/backups/alerts', { recursive: true });
    fs.writeFileSync(alertFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    log('ERROR', `Failed to write alert file: ${err.message}`);
  }
}

// Main monitoring loop
async function monitor() {
  log('INFO', '=== PM2 Monitor Started ===');

  let ramAlertSent = false;
  let processAlertSent = false;

  setInterval(async () => {
    const ramOk = await checkRAM();
    const processesOk = await checkProcesses();

    // Send alerts (only once per condition)
    if (!ramOk && !ramAlertSent) {
      await sendAlert('RAM_HIGH', `RAM usage exceeded ${RAM_THRESHOLD_GB}GB threshold`);
      ramAlertSent = true;
    } else if (ramOk && ramAlertSent) {
      log('INFO', 'RAM usage normalized');
      ramAlertSent = false;
    }

    if (!processesOk && !processAlertSent) {
      await sendAlert('PROCESS_CRASH', 'One or more PM2 processes have crashed or errored');
      processAlertSent = true;
    } else if (processesOk && processAlertSent) {
      log('INFO', 'All processes restored');
      processAlertSent = false;
    }
  }, CHECK_INTERVAL);
}

// Start monitoring
monitor().catch(err => {
  log('FATAL', `Monitor failed to start: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('INFO', 'Monitor shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('INFO', 'Monitor interrupted');
  process.exit(0);
});
