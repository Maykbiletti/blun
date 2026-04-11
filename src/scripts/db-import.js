#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || '/root/backups';
const DB_NAME = process.env.BLUN_DB_NAME || 'blun';
const DB_HOST = process.env.BLUN_DB_HOST || '127.0.0.1';
const DB_PORT = process.env.BLUN_DB_PORT || '5432';
const DB_USER = process.env.BLUN_DB_USER || 'blun';
const MAX_IMPORT_SIZE_GB = Number(process.env.MAX_IMPORT_SIZE_GB || 10);
const IMPORT_LOCK_FILE = process.env.IMPORT_LOCK || '/tmp/blun-db-import.lock';

// ── Lock management ─────────────────────────────────────────────────

function acquireLock() {
  if (fs.existsSync(IMPORT_LOCK_FILE)) {
    const lockContent = fs.readFileSync(IMPORT_LOCK_FILE, 'utf8').trim();
    const lockPid = Number(lockContent);
    if (lockPid && processExists(lockPid)) {
      throw new Error(`import already running (pid ${lockPid})`);
    }
    fs.unlinkSync(IMPORT_LOCK_FILE);
  }
  fs.writeFileSync(IMPORT_LOCK_FILE, String(process.pid), 'utf8');
}

function releaseLock() {
  try {
    if (fs.existsSync(IMPORT_LOCK_FILE)) {
      fs.unlinkSync(IMPORT_LOCK_FILE);
    }
  } catch (_) { /* best effort */ }
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

// ── Dump file validation ────────────────────────────────────────────

function validateDumpFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: `file not found: ${filePath}` };
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { valid: false, reason: 'dump file is empty' };
  }

  const sizeGb = stat.size / (1024 * 1024 * 1024);
  if (sizeGb > MAX_IMPORT_SIZE_GB) {
    return {
      valid: false,
      reason: `dump too large (${sizeGb.toFixed(2)}GB > ${MAX_IMPORT_SIZE_GB}GB limit)`
    };
  }

  const ext = path.extname(filePath).toLowerCase();
  const validExtensions = ['.sql', '.dump', '.gz'];
  if (!validExtensions.includes(ext) && !filePath.endsWith('.tar.gz')) {
    return { valid: false, reason: `unsupported file type: ${ext}` };
  }

  return {
    valid: true,
    filePath,
    sizeBytes: stat.size,
    sizeMb: Number((stat.size / (1024 * 1024)).toFixed(2)),
    extension: ext,
    modifiedAt: stat.mtime.toISOString()
  };
}

function computeChecksum(filePath) {
  const hash = crypto.createHash('sha256');
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest('hex');
}

// ── Manifest verification ───────────────────────────────────────────

function verifyAgainstManifest(filePath, backupDir) {
  const manifestPath = path.join(backupDir, 'backup-manifest.sha256');
  if (!fs.existsSync(manifestPath)) {
    return { verified: false, reason: 'no manifest file found' };
  }

  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const fileName = path.basename(filePath);
  const fileChecksum = computeChecksum(filePath);

  const lines = manifest.split('\n').filter(l => !l.startsWith('#') && l.trim());
  for (const line of lines) {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 2 && parts[1] === fileName) {
      if (parts[0] === fileChecksum) {
        return { verified: true, checksum: fileChecksum };
      }
      return {
        verified: false,
        reason: `checksum mismatch: expected ${parts[0]}, got ${fileChecksum}`
      };
    }
  }

  return { verified: false, reason: `file ${fileName} not in manifest` };
}

// ── Pre-import snapshot ─────────────────────────────────────────────

async function createPreImportSnapshot(snapshotDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotFile = path.join(snapshotDir, `pre-import-${timestamp}.sql`);

  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  try {
    await execFileAsync('pg_dump', [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-f', snapshotFile,
      '--no-owner',
      '--no-privileges',
      DB_NAME
    ], { timeout: 300000 });

    return { success: true, snapshotFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Import execution ────────────────────────────────────────────────

function buildImportCommand(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isCompressed = ext === '.gz' || filePath.endsWith('.tar.gz');

  if (ext === '.dump') {
    return {
      cmd: 'pg_restore',
      args: [
        '-h', DB_HOST,
        '-p', DB_PORT,
        '-U', DB_USER,
        '-d', DB_NAME,
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        '-j', '4',
        filePath
      ]
    };
  }

  if (isCompressed) {
    return {
      pipeline: true,
      decompressCmd: 'gunzip',
      decompressArgs: ['-c', filePath],
      cmd: 'psql',
      args: ['-h', DB_HOST, '-p', DB_PORT, '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1']
    };
  }

  return {
    cmd: 'psql',
    args: [
      '-h', DB_HOST,
      '-p', DB_PORT,
      '-U', DB_USER,
      '-d', DB_NAME,
      '-v', 'ON_ERROR_STOP=1',
      '-f', filePath
    ]
  };
}

function runImport(importSpec) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    if (importSpec.pipeline) {
      const decompress = spawn(importSpec.decompressCmd, importSpec.decompressArgs);
      const importer = spawn(importSpec.cmd, importSpec.args, { stdio: ['pipe', 'pipe', 'pipe'] });

      decompress.stdout.pipe(importer.stdin);

      let stderr = '';
      importer.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      decompress.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      importer.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, durationMs, durationSec: Math.round(durationMs / 1000) });
        } else {
          reject(new Error(`import exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      decompress.on('error', (err) => reject(err));
      importer.on('error', (err) => reject(err));
    } else {
      const proc = spawn(importSpec.cmd, importSpec.args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, durationMs, durationSec: Math.round(durationMs / 1000) });
        } else {
          reject(new Error(`import exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    }
  });
}

// ── Import report ───────────────────────────────────────────────────

function generateReport(validation, manifest, snapshot, importResult, filePath) {
  return {
    importedAt: new Date().toISOString(),
    source: {
      file: path.basename(filePath),
      path: filePath,
      sizeMb: validation.sizeMb,
      checksum: manifest.verified ? manifest.checksum : computeChecksum(filePath)
    },
    target: {
      database: DB_NAME,
      host: DB_HOST,
      port: DB_PORT
    },
    manifestCheck: manifest.verified ? 'passed' : manifest.reason,
    preImportSnapshot: snapshot.success ? snapshot.snapshotFile : `skipped: ${snapshot.error}`,
    result: importResult.success ? 'success' : 'failed',
    durationSec: importResult.durationSec || null,
    status: importResult.success ? 'ok' : 'error'
  };
}

// ── Main ────────────────────────────────────────────────────────────

async function importDatabase(filePath, options = {}) {
  const backupDir = options.backupDir || path.dirname(filePath);
  const snapshotDir = options.snapshotDir || path.join(backupDir, 'snapshots');
  const skipManifest = options.skipManifest || false;
  const skipSnapshot = options.skipSnapshot || false;

  // 1. Validate dump file
  const validation = validateDumpFile(filePath);
  if (!validation.valid) {
    return { status: 'error', reason: validation.reason };
  }

  // 2. Verify against manifest
  let manifest = { verified: false, reason: 'skipped' };
  if (!skipManifest) {
    manifest = verifyAgainstManifest(filePath, backupDir);
    if (!manifest.verified && !options.forceImport) {
      return { status: 'error', reason: `manifest verification failed: ${manifest.reason}` };
    }
  }

  // 3. Create pre-import snapshot
  let snapshot = { success: false, error: 'skipped' };
  if (!skipSnapshot) {
    snapshot = await createPreImportSnapshot(snapshotDir);
  }

  // 4. Run import
  const importSpec = buildImportCommand(filePath);
  const importResult = await runImport(importSpec);

  // 5. Generate report
  return generateReport(validation, manifest, snapshot, importResult, filePath);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('usage: db-import.js <dump-file> [--skip-manifest] [--skip-snapshot] [--force]\n');
    process.exit(1);
  }

  const args = process.argv.slice(3);
  const options = {
    skipManifest: args.includes('--skip-manifest'),
    skipSnapshot: args.includes('--skip-snapshot'),
    forceImport: args.includes('--force')
  };

  try {
    acquireLock();
    const report = await importDatabase(path.resolve(filePath), options);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    releaseLock();
    process.exit(report.status === 'ok' ? 0 : 3);
  } catch (err) {
    releaseLock();
    process.stderr.write(`db-import failed: ${err.message}\n`);
    process.exit(10);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  importDatabase,
  validateDumpFile,
  verifyAgainstManifest,
  buildImportCommand,
  computeChecksum
};
