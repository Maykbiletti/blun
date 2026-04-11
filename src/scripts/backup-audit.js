#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || '/root/backups';
const MIN_BACKUP_SIZE_MB = Number(process.env.MIN_BACKUP_SIZE_MB || 50);
const MAX_BACKUP_AGE_HOURS = Number(process.env.MAX_BACKUP_AGE_HOURS || 26);
const MIN_FREE_GB = Number(process.env.MIN_FREE_GB || 5);

function toIsoDate(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function parseBytesToGb(bytes) {
  return Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
}

function parseBackupFiles(entries, backupDir) {
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fullPath = path.join(backupDir, entry.name);
    const stat = fs.statSync(fullPath);

    if (stat.size === 0) continue;
    if (!/(\.sql|\.dump|\.tar\.gz)$/i.test(entry.name)) continue;

    candidates.push({
      name: entry.name,
      path: fullPath,
      sizeBytes: stat.size,
      createdAt: stat.mtime
    });
  }

  return candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function readDiskFreeGb(targetDir) {
  const { stdout } = await execFileAsync('df', ['-Pk', targetDir]);
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('df output unparsable');
  }

  const columns = lines[1].trim().split(/\s+/);
  const availableKb = Number(columns[3]);
  if (!Number.isFinite(availableKb)) {
    throw new Error('df available column unparsable');
  }

  return Number((availableKb / (1024 * 1024)).toFixed(2));
}

async function runAudit(backupDir) {
  if (!fs.existsSync(backupDir)) {
    return {
      status: 'critical',
      reason: `backup dir missing: ${backupDir}`,
      backupDir
    };
  }

  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const backups = parseBackupFiles(entries, backupDir);

  if (backups.length === 0) {
    return {
      status: 'critical',
      reason: 'no backup files found',
      backupDir
    };
  }

  const latest = backups[0];
  const now = Date.now();
  const ageHours = Number(((now - latest.createdAt.getTime()) / (1000 * 60 * 60)).toFixed(2));
  const sizeMb = Number((latest.sizeBytes / (1024 * 1024)).toFixed(2));
  const freeGb = await readDiskFreeGb(backupDir);

  let status = 'ok';
  const checks = [];

  if (sizeMb < MIN_BACKUP_SIZE_MB) {
    status = 'critical';
    checks.push(`latest backup too small (${sizeMb}MB < ${MIN_BACKUP_SIZE_MB}MB)`);
  }

  if (ageHours > MAX_BACKUP_AGE_HOURS) {
    status = status === 'critical' ? 'critical' : 'warning';
    checks.push(`latest backup too old (${ageHours}h > ${MAX_BACKUP_AGE_HOURS}h)`);
  }

  if (freeGb < MIN_FREE_GB) {
    status = 'critical';
    checks.push(`free disk too low (${freeGb}GB < ${MIN_FREE_GB}GB)`);
  }

  if (checks.length === 0) {
    checks.push('all checks passed');
  }

  return {
    status,
    backupDir,
    checkedAt: toIsoDate(new Date()),
    latestBackup: {
      name: latest.name,
      path: latest.path,
      sizeMb,
      createdAt: toIsoDate(latest.createdAt),
      ageHours
    },
    inventory: {
      files: backups.length,
      totalSizeGb: parseBytesToGb(backups.reduce((sum, file) => sum + file.sizeBytes, 0))
    },
    disk: {
      freeGb,
      minRequiredGb: MIN_FREE_GB
    },
    checks
  };
}

async function main() {
  const backupDir = process.argv[2] || DEFAULT_BACKUP_DIR;

  try {
    const report = await runAudit(backupDir);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (report.status === 'ok') process.exit(0);
    if (report.status === 'warning') process.exit(2);
    process.exit(3);
  } catch (error) {
    process.stderr.write(`backup-audit failed: ${error.message}\n`);
    process.exit(10);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runAudit,
  parseBackupFiles,
  readDiskFreeGb
};
