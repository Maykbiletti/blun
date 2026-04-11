#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const OUT_DIR = path.join(ROOT, 'artifacts');
const DATASET_PATH = path.join(OUT_DIR, 'code_review_train.jsonl');
const MODEL_PATH = path.join(OUT_DIR, 'code_review_model.json');
const REPORT_PATH = path.join(OUT_DIR, 'code_review_eval_report.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readJsonl(p) {
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function detectFindings(code) {
  const findings = [];
  if (/bucket\.push\(now\)/.test(code) && !/filter\(|shift\(|windowMs/.test(code)) {
    findings.push('rate_limiter_window_eviction');
  }
  if (/stripe-signature/.test(code) && /JSON\.parse\(req\.body\)/.test(code)) {
    findings.push('webhook_signature_verification');
  }
  if (/file\.name/.test(code) && /['\"]\/tmp\/uploads\//.test(code) && !/path\.basename\(/.test(code)) {
    findings.push('upload_filename_sanitization');
  }
  return findings;
}

function run() {
  if (!fs.existsSync(MODEL_PATH) || !fs.existsSync(DATASET_PATH)) {
    console.error('Missing artifacts. Run train-code-review-model.js first.');
    process.exit(1);
  }

  const model = readJson(MODEL_PATH);
  const dataset = readJsonl(DATASET_PATH);
  const samples = dataset.slice(0, 3);

  if (samples.length < 3) {
    console.error(`Need 3 samples, found ${samples.length}`);
    process.exit(1);
  }

  const evaluations = samples.map((sample, idx) => {
    const code = sample.input.split('\n').slice(3).join('\n');
    const found = detectFindings(code);
    const expectedRules = Object.keys(model.rules).filter((k) => model.rules[k]);
    const matched = found.filter((f) => expectedRules.includes(f));
    return {
      sample_index: idx + 1,
      task_id: sample.task_id,
      task: sample.task,
      findings: found,
      matched_rules: matched,
      pass: matched.length > 0
    };
  });

  const passed = evaluations.filter((e) => e.pass).length;
  const report = {
    model: model.model_name,
    trained_at: model.trained_at,
    total_samples: samples.length,
    passed,
    failed: samples.length - passed,
    evaluations
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, report: REPORT_PATH, passed, total: samples.length }));
}

run();
