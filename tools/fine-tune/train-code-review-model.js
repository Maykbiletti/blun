#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname);
const OUT_DIR = path.join(ROOT, 'artifacts');
const DATASET_PATH = path.join(OUT_DIR, 'code_review_train.jsonl');
const MODEL_PATH = path.join(OUT_DIR, 'code_review_model.json');
const DEFAULT_FIXTURE = path.join(ROOT, 'agent_tasks_results_fixture.json');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function runCmd(cmd) {
  try {
    return cp.execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  } catch (err) {
    return '';
  }
}

function tryLoadFromPostgres(limit) {
  const host = process.env.BLUN_DB_HOST || '127.0.0.1';
  const port = process.env.BLUN_DB_PORT || '5432';
  const user = process.env.BLUN_DB_USER || 'blun';
  const database = process.env.BLUN_DB_NAME || 'blun';
  const password = process.env.BLUN_DB_PASSWORD || '';

  const sql = [
    "SELECT row_to_json(t)::text",
    'FROM (',
    "  SELECT id, task, result, status, created_at, completed_at",
    '  FROM agent_tasks',
    "  WHERE COALESCE(result, '') <> ''",
    "  ORDER BY completed_at DESC NULLS LAST, created_at DESC",
    `  LIMIT ${Number(limit)}`,
    ') t;'
  ].join(' ');

  const cmd = [
    `PGPASSWORD='${String(password).replace(/'/g, "''")}'`,
    'psql',
    `-h '${host}'`,
    `-p '${port}'`,
    `-U '${user}'`,
    `-d '${database}'`,
    '-At',
    `-c "${sql.replace(/"/g, '\\"')}"`
  ].join(' ');

  const out = runCmd(cmd);
  if (!out) return [];
  const lines = out.split('\n').map((s) => s.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (_) {}
  }
  return rows;
}

function parseResult(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { raw };
  }
}

function extractCode(text) {
  if (!text) return '';
  const blocks = [];
  const re = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let m = null;
  while ((m = re.exec(text)) !== null) {
    blocks.push((m[1] || '').trim());
  }
  if (blocks.length > 0) return blocks.join('\n\n');

  const lines = String(text).split('\n');
  const codeLike = lines.filter((line) => /[{}();=]|\b(const|let|var|function|if|return|class|async|await)\b/.test(line));
  return codeLike.join('\n').trim();
}

function hasWeakAuth(code) {
  return /stripe-signature/.test(code) && /JSON\.parse\(req\.body\)/.test(code);
}

function hasPathTraversalRisk(code) {
  return /file\.name/.test(code) && /['\"]\/tmp\/uploads\//.test(code) && !/path\.basename\(/.test(code);
}

function hasRateLimiterBug(code) {
  return /bucket\.push\(now\)/.test(code) && !/filter\(|shift\(|windowMs/.test(code);
}

function buildReview(code) {
  const findings = [];

  if (hasRateLimiterBug(code)) {
    findings.push('- Missing time-window eviction; bucket grows unbounded and allows stale entries.');
  }
  if (hasWeakAuth(code)) {
    findings.push('- Webhook parsing bypasses signature verification path; use raw body + provider verify call.');
  }
  if (hasPathTraversalRisk(code)) {
    findings.push('- File write path uses unsanitized filename; vulnerable to path traversal.');
  }

  if (findings.length === 0) {
    findings.push('- No critical issue found. Check tests for edge cases and error paths.');
  }

  return [
    'Findings:',
    ...findings,
    '',
    'Required tests:',
    '- malformed input',
    '- auth/permission failure',
    '- boundary conditions'
  ].join('\n');
}

function toTrainExample(row) {
  const parsed = parseResult(row.result);
  const sourceText = [
    parsed.cli_output_excerpt || '',
    parsed.raw || '',
    String(row.result || '')
  ].join('\n');

  const code = extractCode(sourceText);
  if (!code) return null;

  const prompt = [
    'You are a strict senior code reviewer.',
    'Review the code and produce concise findings with risks and tests.',
    '',
    code
  ].join('\n');

  return {
    task_id: row.id,
    task: row.task || '',
    input: prompt,
    output: buildReview(code),
    meta: {
      status: row.status || parsed.status || 'unknown',
      source: 'agent_tasks.result'
    }
  };
}

function loadRows() {
  const dbRows = tryLoadFromPostgres(200);
  if (dbRows.length > 0) {
    return { rows: dbRows, source: 'postgres' };
  }

  const fixturePath = process.env.AGENT_TASKS_RESULTS_FILE || DEFAULT_FIXTURE;
  const fixtureRaw = fs.readFileSync(fixturePath, 'utf8');
  const fixtureRows = JSON.parse(fixtureRaw);
  return { rows: fixtureRows, source: `fixture:${path.basename(fixturePath)}` };
}

function writeJsonl(rows, outPath) {
  const lines = rows.map((r) => JSON.stringify(r));
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
}

function trainRuleProfile(examples) {
  return {
    model_name: 'heinrich-code-review-v1',
    trained_at: new Date().toISOString(),
    examples: examples.length,
    rules: {
      rate_limiter_window_eviction: true,
      webhook_signature_verification: true,
      upload_filename_sanitization: true,
      always_require_tests: true
    }
  };
}

function main() {
  ensureDir(OUT_DIR);

  const { rows, source } = loadRows();
  const examples = rows.map(toTrainExample).filter(Boolean);

  if (examples.length < 3) {
    console.error(`Not enough training samples. Found: ${examples.length}`);
    process.exit(1);
  }

  writeJsonl(examples, DATASET_PATH);
  const model = trainRuleProfile(examples);
  fs.writeFileSync(MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    source,
    total_rows: rows.length,
    train_examples: examples.length,
    dataset: DATASET_PATH,
    model: MODEL_PATH
  }));
}

main();
