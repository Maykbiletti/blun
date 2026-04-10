const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const rename = promisify(fs.rename);
const unlink = promisify(fs.unlink);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_BACKUPS = 5;
const LOG_DIR = '/tmp';
const LOG_PATTERN = /^blun-.*\.log$/;

async function rotateLogFile(filePath) {
  try {
    const stats = await stat(filePath);

    if (stats.size < MAX_SIZE) {
      return;
    }

    const baseName = path.basename(filePath, '.log');
    const dir = path.dirname(filePath);

    // Shift existing backups
    for (let i = MAX_BACKUPS; i >= 1; i--) {
      const oldBackup = path.join(dir, `${baseName}.log.${i}`);
      const newBackup = path.join(dir, `${baseName}.log.${i + 1}`);

      try {
        await stat(oldBackup);
        if (i === MAX_BACKUPS) {
          await unlink(oldBackup);
        } else {
          await rename(oldBackup, newBackup);
        }
      } catch (err) {
        // File doesn't exist, continue
      }
    }

    // Move current log to .1
    const firstBackup = path.join(dir, `${baseName}.log.1`);
    await rename(filePath, firstBackup);

    // Create new empty log file
    fs.writeFileSync(filePath, '');

  } catch (err) {
    console.error(`Error rotating ${filePath}:`, err.message);
  }
}

async function rotateAll() {
  try {
    const files = await readdir(LOG_DIR);

    const logFiles = files
      .filter(file => LOG_PATTERN.test(file))
      .map(file => path.join(LOG_DIR, file));

    for (const logFile of logFiles) {
      await rotateLogFile(logFile);
    }

  } catch (err) {
    console.error('Error rotating logs:', err.message);
  }
}

module.exports = { rotateAll };