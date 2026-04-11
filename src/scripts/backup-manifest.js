#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || '/root/backups';

function listBackupCandidates(backupDir) {
  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/(\.sql|\.dump|\.tar\.gz)$/i.test(entry.name)) continue;

    const fullPath = path.join(backupDir, entry.name);
    const stat = fs.statSync(fullPath);

    if (stat.size === 0) continue;
    files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const input = fs.readFileSync(filePath);
  hash.update(input);
  return hash.digest('hex');
}

function generateManifest(backupDir, outFile) {
  if (!fs.existsSync(backupDir)) {
    throw new Error(`backup dir missing: ${backupDir}`);
  }

  const files = listBackupCandidates(backupDir);
  if (files.length === 0) {
    throw new Error('no backup files found');
  }

  const rows = files.map((file) => {
    const digest = sha256File(file.path);
    const sizeMb = Number((file.sizeBytes / (1024 * 1024)).toFixed(2));
    return `${digest}  ${file.name}  size_mb=${sizeMb}`;
  });

  const output = [
    `# backup manifest`,
    `# generated_at=${new Date().toISOString()}`,
    `# backup_dir=${backupDir}`,
    ...rows,
    ''
  ].join('\n');

  fs.writeFileSync(outFile, output, 'utf8');
  return { outFile, fileCount: files.length };
}

function main() {
  const backupDir = process.argv[2] || DEFAULT_BACKUP_DIR;
  const outFile = process.argv[3] || path.join(backupDir, 'backup-manifest.sha256');

  try {
    const result = generateManifest(backupDir, outFile);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`backup-manifest failed: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  listBackupCandidates,
  sha256File,
  generateManifest
};
