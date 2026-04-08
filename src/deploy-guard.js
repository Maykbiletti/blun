// Deploy Guard — prevents unauthorized file writes and git operations
// Only the Operator (Dieter, agent ID 1) can deploy
// All other agents can only propose changes via chat

const fs = require('fs');
const path = require('path');

// Protected paths — NOBODY except operator can write these
const PROTECTED_FILES = [
  '/root/blun/dashboard/index.html',
  '/root/blun/dashboard/login.html',
  '/root/blun/server.js',
  '/root/blun/src/agent-engine.js',
  '/root/blun/src/deploy-guard.js',
  '/root/blun/dieter-daemon.js'
];

const PROTECTED_DIRS = [
  '/root/blun/dashboard/js/',
  '/root/blun/dashboard/components/',
  '/root/blun/src/middleware/'
];

const OPERATOR_ID = 1; // Dieter

// Check if a file path is protected
function isProtected(filePath) {
  var resolved = path.resolve(filePath);
  for (var i = 0; i < PROTECTED_FILES.length; i++) {
    if (resolved === PROTECTED_FILES[i]) return true;
  }
  for (var i = 0; i < PROTECTED_DIRS.length; i++) {
    if (resolved.startsWith(PROTECTED_DIRS[i])) return true;
  }
  return false;
}

// Validate if an agent can perform a deploy action
function canDeploy(agentId) {
  return agentId === OPERATOR_ID;
}

// Log deploy attempts
function logAttempt(agentId, action, filePath, allowed) {
  var ts = new Date().toISOString();
  var entry = ts + ' | Agent ' + agentId + ' | ' + action + ' | ' + filePath + ' | ' + (allowed ? 'ALLOWED' : 'BLOCKED') + '\n';
  fs.appendFileSync('/root/blun/deploy-guard.log', entry);
  if (!allowed) {
    console.log('[DEPLOY-GUARD] BLOCKED: Agent ' + agentId + ' tried to ' + action + ' ' + filePath);
  }
}

module.exports = { isProtected, canDeploy, logAttempt, OPERATOR_ID, PROTECTED_FILES, PROTECTED_DIRS };
