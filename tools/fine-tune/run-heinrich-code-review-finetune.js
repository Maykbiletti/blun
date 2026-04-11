#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const path = require('path');

const ROOT = __dirname;
const train = path.join(ROOT, 'train-code-review-model.js');
const test = path.join(ROOT, 'test-code-review-model.js');

function run(scriptPath) {
  return cp.execSync(`node '${scriptPath}'`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function main() {
  const trainOut = run(train).trim();
  const testOut = run(test).trim();
  process.stdout.write(`${trainOut}\n${testOut}\n`);
}

main();
