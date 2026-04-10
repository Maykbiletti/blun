#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

const logFile = '/root/.pm2/logs/blun-error.log';
const lines = execSync(`tail -20000 ${logFile} 2>/dev/null || echo ""`).toString().split('\n');

const errorPatterns = {
  'REDIS_URL_PARSE': {
    pattern: /TypeError: Failed to parse URL from \/multi-exec/,
    count: 0,
    severity: 'P0',
    impact: 'Rate limiter completely broken',
    rootCause: 'Upstash Redis client missing URL/token configuration',
    fix: [
      '1. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars',
      '2. Or use fallback in-memory rate limiter if redis unavailable',
      '3. Add error handling in rate-limiter.js middleware'
    ]
  },
  'REDIS_MODULE_MISSING': {
    pattern: /Cannot find module '@upstash\/redis'/,
    count: 0,
    severity: 'P0',
    impact: 'Rate limiter fails to initialize',
    rootCause: '@upstash/redis not installed in node_modules',
    fix: [
      '1. Run: npm install @upstash/redis',
      '2. Verify package-lock.json includes the package',
      '3. Run: npm ci to use locked dependencies'
    ]
  },
  'TABLE_NOT_EXISTS': {
    pattern: /relation "websites" does not exist/,
    count: 0,
    severity: 'P1',
    impact: 'Websites feature completely broken',
    rootCause: 'Database migration 003 or 004 not executed',
    fix: [
      '1. Run: npm run migrate (ensure migrations 003-004 exist)',
      '2. Verify /src/migrations/003-*.sql and 004-*.sql are present',
      '3. Check database connection and role permissions'
    ]
  },
  'TEMPLATE_SYNTAX': {
    pattern: /Unexpected token '<<'/,
    count: 0,
    severity: 'P1',
    impact: 'Template rendering broken',
    rootCause: 'Invalid template syntax or wrong parser configuration',
    fix: [
      '1. Find files using <<: grep -r "<<" src/',
      '2. Fix template syntax or use proper escape sequences',
      '3. Check Express template engine configuration'
    ]
  },
  'DB_PERMISSION': {
    pattern: /permission denied for table/,
    count: 0,
    severity: 'P2',
    impact: 'Feature access restricted',
    rootCause: 'Database role missing required permissions',
    fix: [
      '1. Connect to DB and grant permissions:',
      '   GRANT ALL ON TABLE software_projects TO <role>;',
      '   GRANT ALL ON TABLE websites TO <role>;',
      '2. Run as superuser and verify role configuration'
    ]
  }
};

lines.forEach(line => {
  Object.keys(errorPatterns).forEach(key => {
    if (errorPatterns[key].pattern.test(line)) {
      errorPatterns[key].count++;
    }
  });
});

const results = Object.entries(errorPatterns)
  .map(([key, data]) => ({
    error: key,
    count: data.count,
    severity: data.severity,
    impact: data.impact,
    rootCause: data.rootCause,
    fixes: data.fix
  }))
  .filter(r => r.count > 0)
  .sort((a, b) => {
    const severityOrder = { P0: 0, P1: 1, P2: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count;
  })
  .slice(0, 5);

console.log('\n=== TOP 5 RECURRING ERRORS (24h) ===\n');
results.forEach((err, idx) => {
  console.log(`${idx + 1}. [${err.severity}] ${err.error}`);
  console.log(`   Count: ${err.count}`);
  console.log(`   Impact: ${err.impact}`);
  console.log(`   Root Cause: ${err.rootCause}`);
  console.log(`   Fixes:`);
  err.fixes.forEach(f => console.log(`     ${f}`));
  console.log();
});

fs.writeFileSync('/root/blun/tools/error-analysis.json', JSON.stringify(results, null, 2));
process.exit(results.length > 0 ? 1 : 0);
