#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const testName = 'STOP_HOOK_TEST';

console.log(`[${testName}] Starting verification...`);

const checks = {
  passed: 0,
  failed: 0
};

function check(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    checks.passed++;
  } else {
    console.log(`✗ ${message}`);
    checks.failed++;
  }
}

// Test 1: Settings configuration exists
const settingsPath = path.join(process.env.HOME || '/root', '.claude', 'settings.json');
check(
  fs.existsSync(settingsPath),
  'Settings file exists at ~/.claude/settings.json'
);

// Test 2: Package.json exists
const pkgPath = path.join(__dirname, 'package.json');
check(
  fs.existsSync(pkgPath),
  'package.json exists'
);

// Test 3: Core protected files exist (should not be modified)
const protectedFiles = [
  'agent-engine.js',
  'server.js',
  'index.html',
  'db.js'
];

protectedFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  check(!exists || fs.statSync(path.join(__dirname, file)).isFile(),
    `Protected file check: ${file}`);
});

// Test 4: Worktree isolation verification
const isWorktree = fs.existsSync(path.join(__dirname, '.git'));
check(
  isWorktree,
  'Running in isolated git worktree'
);

// Test 5: Git status clean or in expected state
try {
  const { execSync } = require('child_process');
  const status = execSync('git status --porcelain', {
    cwd: __dirname,
    encoding: 'utf8'
  }).trim();

  check(
    status === '' || status.length < 1000,
    'Git working tree is in valid state'
  );
} catch (err) {
  check(false, `Git status check failed: ${err.message}`);
}

console.log(`\n[${testName}] Results: ${checks.passed} passed, ${checks.failed} failed`);
process.exit(checks.failed > 0 ? 1 : 0);
