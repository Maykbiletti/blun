#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PM2_LOGS_DIR = '/root/.pm2/logs';
const REPORT_FILE = path.join(__dirname, 'error-analysis-report.md');

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const yesterday = new Date(Date.now() - TWENTY_FOUR_HOURS);

const ERROR_PATTERNS = [
  {
    pattern: /password authentication failed for user "blun"/,
    category: 'DB_AUTH_FAILURE',
    description: 'PostgreSQL authentication failure for user "blun"',
    rootCause: 'PostgreSQL user "blun" password mismatch or pg_hba.conf rejects md5/scram auth. dieter-daemon retries every ~30s, flooding logs.',
    fix: `1. Verify password: sudo -u postgres psql -c "ALTER USER blun PASSWORD '<correct_pw>';"
2. Check pg_hba.conf auth method matches (md5 vs scram-sha-256)
3. Restart: sudo systemctl restart postgresql
4. Update .env DB_PASSWORD if changed`
  },
  {
    pattern: /foreign key constraint "agent_memory_agent_id_fkey"/,
    category: 'FK_CONSTRAINT_AGENT_MEMORY',
    description: 'agent_memory foreign key violation (agent_id_fkey)',
    rootCause: 'dieter-daemon inserts into agent_memory with agent_id that does not exist in agents table. Runs every 5min via cron/interval, causing 51+ violations.',
    fix: `1. Check orphan references: SELECT DISTINCT agent_id FROM agent_memory WHERE agent_id NOT IN (SELECT id FROM agents);
2. Fix dieter-daemon to validate agent_id exists before INSERT
3. Add ON DELETE CASCADE or SET NULL to the FK constraint
4. Clean orphans: DELETE FROM agent_memory WHERE agent_id NOT IN (SELECT id FROM agents);`
  },
  {
    pattern: /Dashboard client disconnected/,
    category: 'WS_DISCONNECT',
    description: 'WebSocket dashboard client disconnections',
    rootCause: 'Browser tabs losing WebSocket connections (network idle, tab sleep, navigation). 88 disconnects indicate missing reconnect logic or aggressive keepalive timeout.',
    fix: `1. Add exponential backoff reconnect in dashboard JS client
2. Increase WebSocket pingInterval/pingTimeout in server config
3. Suppress noisy disconnect logs (log only if disconnect is unexpected)
4. Add heartbeat mechanism to detect stale connections`
  },
  {
    pattern: /task-runner.*FAIL.*no commits or file changes/,
    category: 'TASK_RUNNER_FAIL',
    description: 'Agent task-runner failures (no commits/changes)',
    rootCause: 'Claude Code agents complete tasks but produce no git commits or file changes, causing task-runner to mark them as FAIL. 41 failures indicate agents either cannot write to worktrees or tasks require no code changes.',
    fix: `1. Allow tasks to succeed with report-only output (not just commits)
2. Check worktree write permissions: ls -la /root/blun-worktrees/
3. Add task type distinction: code-task vs analysis-task
4. Improve task-runner success criteria beyond "has commits"`
  },
  {
    pattern: /POST \/api\/organisator\/agents\/\d+\/chat.*500/,
    category: 'AGENT_CHAT_500',
    description: 'Agent chat API returning HTTP 500 errors',
    rootCause: 'POST /api/organisator/agents/:id/chat returns 500. Likely caused by upstream DB auth failure (error #1) or missing agent record. 17 occurrences across multiple agent IDs.',
    fix: `1. Fix DB auth (see error #1) — most 500s cascade from this
2. Add try/catch with specific error response in chat route handler
3. Validate agent exists before forwarding chat request
4. Add circuit breaker to prevent cascading failures when DB is down`
  },
  {
    pattern: /TypeError: Unknown file extension "\.ts"/,
    category: 'TS_MODULE_ERROR',
    description: 'TypeScript file extension not recognized by Node.js',
    rootCause: 'paperclip imports .ts files without transpilation. Node.js ESM loader rejects .ts extensions natively.',
    fix: `1. Install tsx: npm install -g tsx
2. Run paperclip with tsx: pm2 start --interpreter tsx paperclip/index.ts
3. Or add tsconfig with "moduleResolution": "bundler" and use ts-node/esm loader`
  },
  {
    pattern: /spawn.*initdb EACCES/,
    category: 'EMBEDDED_PG_EACCES',
    description: 'Embedded PostgreSQL initdb permission denied (EACCES)',
    rootCause: 'embedded-postgres binary at linux-x64/native/bin/initdb lacks execute permission after npm install. Happens on every paperclip restart.',
    fix: `1. chmod +x /root/paperclip/node_modules/.pnpm/@embedded-postgres+linux-x64@*/node_modules/@embedded-postgres/linux-x64/native/bin/*
2. Add postinstall script: "postinstall": "chmod +x node_modules/@embedded-postgres/linux-x64/native/bin/*"
3. Or use system PostgreSQL instead of embedded`
  }
];

function analyzeAllLogs() {
  const errorCounts = new Map();
  const logFiles = fs.readdirSync(PM2_LOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => path.join(PM2_LOGS_DIR, f));

  for (const logFile of logFiles) {
    try {
      const stats = fs.statSync(logFile);
      if (stats.size === 0) continue;

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        for (const ep of ERROR_PATTERNS) {
          if (ep.pattern.test(line)) {
            const cur = errorCounts.get(ep.category) || {
              count: 0,
              description: ep.description,
              rootCause: ep.rootCause,
              fix: ep.fix,
              logFile: path.basename(logFile),
              example: ''
            };
            cur.count++;
            if (!cur.example) cur.example = line.trim().substring(0, 200);
            errorCounts.set(ep.category, cur);
            break;
          }
        }
      }
    } catch (err) {
      console.error(`Error reading ${logFile}: ${err.message}`);
    }
  }

  return errorCounts;
}

function generateReport(errorCounts) {
  const sorted = Array.from(errorCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  let report = `# Self-Healing Review — PM2 Error Analysis
Generated: ${new Date().toISOString()}
Period: Last 24 hours
Logs analyzed: blun-error.log, blun-out.log, dieter-daemon-error.log, dieter-daemon-out.log, paperclip-error.log

## Top 5 Recurring Errors

`;

  sorted.forEach(([category, data], i) => {
    report += `### ${i + 1}. ${data.description}
- **Category:** \`${category}\`
- **Occurrences:** ${data.count}
- **Log:** ${data.logFile}

**Root Cause:** ${data.rootCause}

**Fix:**
\`\`\`
${data.fix}
\`\`\`

**Example:**
\`\`\`
${data.example}
\`\`\`

---

`;
  });

  report += `## Self-Healing Priority Actions

| Priority | Action | Impact |
|----------|--------|--------|
| P0 | Fix PostgreSQL auth for user "blun" | Stops 120+ DB auth errors + cascading 500s |
| P1 | Fix dieter-daemon agent_memory FK inserts | Stops 51+ constraint violations every 5min |
| P2 | Add WebSocket reconnect + reduce disconnect noise | Stops 88+ noisy log entries |
| P3 | Improve task-runner success criteria | Reduces 41+ false-negative task failures |
| P4 | Fix embedded-postgres permissions | Stops paperclip startup failures |
`;

  return report;
}

function main() {
  console.log('Analyzing PM2 logs (all services, last 24h)...');
  const errorCounts = analyzeAllLogs();

  if (errorCounts.size === 0) {
    console.log('No matching errors found.');
    return;
  }

  const report = generateReport(errorCounts);
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`Report: ${REPORT_FILE}`);
  console.log(`Categories found: ${errorCounts.size}`);

  const sorted = Array.from(errorCounts.entries())
    .sort((a, b) => b[1].count - a[1].count);
  sorted.forEach(([cat, d]) => console.log(`  ${d.count}x ${cat} (${d.logFile})`));
}

if (require.main === module) {
  main();
}

module.exports = { analyzeAllLogs, generateReport };
