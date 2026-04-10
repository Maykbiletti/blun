#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Analysis für letzte 24h PM2 Logs
const logDir = '/root/.pm2/logs';
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const errorPatterns = {};
const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));

function extractErrorPattern(line) {
  // Verschiedene Error-Pattern extrahieren
  const patterns = [
    { name: 'SyntaxError', regex: /SyntaxError: (.+)/ },
    { name: 'TypeError', regex: /TypeError: (.+)/ },
    { name: 'EACCES', regex: /EACCES.*spawn (.+)/ },
    { name: 'FileExtension', regex: /Unknown file extension "(.+)"/ },
    { name: 'DatabaseConnection', regex: /(database|db|postgres|mysql).*(connection|connect|timeout)/i },
    { name: 'HTTPError', regex: /(http|https).*(error|timeout|refused)/i },
    { name: 'PermissionDenied', regex: /(permission denied|access denied|eacces)/i },
    { name: 'ModuleNotFound', regex: /cannot find module|module not found/i },
    { name: 'MemoryError', regex: /(out of memory|heap|memory)/i },
    { name: 'NetworkError', regex: /(network|socket|timeout|refused)/i }
  ];

  for (let pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) {
      return {
        type: pattern.name,
        detail: match[1] || match[0],
        line: line.trim()
      };
    }
  }
  return null;
}

function analyzeLogFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach(line => {
      if (line.toLowerCase().includes('error') ||
          line.toLowerCase().includes('exception') ||
          line.toLowerCase().includes('failed')) {

        const error = extractErrorPattern(line);
        if (error) {
          const key = `${error.type}: ${error.detail}`;
          if (!errorPatterns[key]) {
            errorPatterns[key] = {
              count: 0,
              type: error.type,
              detail: error.detail,
              sample: error.line,
              file: path.basename(filePath)
            };
          }
          errorPatterns[key].count++;
        }
      }
    });
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
}

// Alle Log-Dateien analysieren
logFiles.forEach(file => {
  const filePath = path.join(logDir, file);
  const stats = fs.statSync(filePath);

  // Nur Dateien der letzten 24h
  if (stats.mtime > yesterday) {
    analyzeLogFile(filePath);
  }
});

// Top 5 Fehler ermitteln
const topErrors = Object.entries(errorPatterns)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 5);

// Report generieren
console.log('═══════════════════════════════════════════════════════════════════');
console.log('                    SELF-HEALING ANALYSIS REPORT');
console.log('                     Last 24h PM2 Error Analysis');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('TOP 5 RECURRING ERRORS:\n');

topErrors.forEach((error, index) => {
  const [key, data] = error;

  console.log(`${index + 1}. ERROR TYPE: ${data.type}`);
  console.log(`   COUNT: ${data.count} occurrences`);
  console.log(`   SOURCE: ${data.file}`);
  console.log(`   DETAIL: ${data.detail}`);
  console.log(`   SAMPLE: ${data.sample.substring(0, 100)}...`);

  // Root Cause Analysis & Fix Vorschläge
  let rootCause = '';
  let fixSuggestion = '';

  switch (data.type) {
    case 'SyntaxError':
      rootCause = 'Ungültiger JavaScript Syntax, fehlendes try-Block vor catch';
      fixSuggestion = 'Code-Syntax prüfen, dieter-daemon.js:347 reparieren';
      break;
    case 'TypeError':
      rootCause = 'TypeScript Module ohne ts-node/tsx Loader';
      fixSuggestion = 'package.json "type": "module" + tsx/ts-node konfigurieren';
      break;
    case 'EACCES':
      rootCause = 'Fehlende Ausführungsberechtigungen für PostgreSQL initdb';
      fixSuggestion = 'chmod +x auf initdb binary + Docker User-Permissions';
      break;
    case 'FileExtension':
      rootCause = 'Node.js erkennt .ts Dateien ohne Transpiler nicht';
      fixSuggestion = 'tsconfig.json + tsx/ts-node in PM2 ecosystem.config.js';
      break;
    case 'DatabaseConnection':
      rootCause = 'PostgreSQL Service nicht erreichbar/gestartet';
      fixSuggestion = 'pg_isready check + service postgres restart';
      break;
    default:
      rootCause = 'Unbekannter Fehlertyp';
      fixSuggestion = 'Logs weiter analysieren + Debugging aktivieren';
  }

  console.log(`   ROOT CAUSE: ${rootCause}`);
  console.log(`   FIX SUGGESTION: ${fixSuggestion}`);
  console.log('   ───────────────────────────────────────────────────────────────\n');
});

// Zusammenfassung
console.log(`SUMMARY:`);
console.log(`- Total unique error patterns: ${Object.keys(errorPatterns).length}`);
console.log(`- Most critical: ${topErrors[0] ? topErrors[0][1].type : 'None'}`);
console.log(`- Total error occurrences: ${Object.values(errorPatterns).reduce((sum, e) => sum + e.count, 0)}`);
console.log(`- Analysis period: Last 24 hours`);
console.log(`- Generated: ${new Date().toISOString()}`);

// Auto-Healing Empfehlungen
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                      AUTO-HEALING RECOMMENDATIONS');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('1. Syntax Error Auto-Fix: Pre-commit hooks mit eslint/prettier');
console.log('2. Permission Auto-Fix: Docker init-scripts für binary permissions');
console.log('3. Module Auto-Fix: PM2 ecosystem mit proper TypeScript support');
console.log('4. Health Checks: Automated service restart bei kritischen Errors');
console.log('5. Log Monitoring: Alerting bei Error-Threshold überschreitung');