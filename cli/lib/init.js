'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { c, log, success, info, heading, error } = require('./utils');

function ask(rl, question, defaultVal) {
  const suffix = defaultVal != null ? ` ${c.dim(`(${defaultVal})`)}` : '';
  return new Promise((resolve) => {
    rl.question(`  ${c.yellow('?')} ${question}${suffix} `, (answer) => {
      resolve(answer.trim() || (defaultVal != null ? String(defaultVal) : ''));
    });
  });
}

function choice(rl, question, options, defaultIdx = 0) {
  return new Promise((resolve) => {
    log();
    log(`  ${c.yellow('?')} ${question}`);
    options.forEach((opt, i) => {
      const marker = i === defaultIdx ? c.green('>') : ' ';
      const label = i === defaultIdx ? c.bold(opt.label) : opt.label;
      const hint = opt.hint ? c.dim(` -- ${opt.hint}`) : '';
      log(`    ${marker} ${label}${hint}`);
    });
    rl.question(`  ${c.dim('Enter choice [1-' + options.length + ']')} `, (answer) => {
      const idx = answer.trim() ? parseInt(answer.trim(), 10) - 1 : defaultIdx;
      resolve(options[Math.max(0, Math.min(idx, options.length - 1))].value);
    });
  });
}

async function run(projectName) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  heading('BLUN -- New Project');

  const name = projectName || await ask(rl, 'Project name:', path.basename(process.cwd()));
  const targetDir = path.resolve(process.cwd(), name);

  const db = await choice(rl, 'Database:', [
    { label: 'PostgreSQL', hint: 'recommended for production', value: 'postgres' },
    { label: 'SQLite',     hint: 'zero setup, local mode',     value: 'sqlite' },
  ], 0);

  const defaultRedis = db === 'postgres' ? 'yes' : 'no';
  const redisAnswer = await ask(rl, 'Enable Redis?', defaultRedis);
  const redis = ['yes', 'y', '1', 'true'].includes(redisAnswer.toLowerCase());

  const port = await ask(rl, 'Server port:', '3100');

  rl.close();

  log();
  info(`Creating project in ${c.bold(targetDir)}`);

  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir);
    if (entries.length > 0) {
      error(`Directory ${name} already exists and is not empty.`);
      process.exit(1);
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const templateDir = path.join(__dirname, '..', 'templates');

  // Generate .env
  let env = fs.readFileSync(path.join(templateDir, 'env.template'), 'utf8');
  env = env
    .replace('{{PORT}}', port)
    .replace('{{DB_TYPE}}', db)
    .replace('{{DB_URL}}', db === 'postgres'
      ? 'postgresql://blun:blun@localhost:5432/blun'
      : './data/blun.db')
    .replace('{{REDIS_ENABLED}}', redis ? 'true' : 'false')
    .replace('{{REDIS_URL}}', redis ? 'redis://127.0.0.1:6379' : '');
  fs.writeFileSync(path.join(targetDir, '.env'), env);

  // Generate package.json
  let pkg = fs.readFileSync(path.join(templateDir, 'package.json.template'), 'utf8');
  pkg = pkg.replace('{{NAME}}', name);
  fs.writeFileSync(path.join(targetDir, 'package.json'), pkg);

  // Generate server.js
  let server = fs.readFileSync(path.join(templateDir, 'server.js.template'), 'utf8');
  fs.writeFileSync(path.join(targetDir, 'server.js'), server);

  // Create directories
  for (const dir of ['agents', 'companies', 'skills', 'tools', 'data', 'logs']) {
    fs.mkdirSync(path.join(targetDir, dir), { recursive: true });
  }

  // Create .gitignore
  fs.writeFileSync(path.join(targetDir, '.gitignore'), [
    'node_modules/',
    '.env',
    'data/',
    'logs/',
    '*.log',
    '',
  ].join('\n'));

  log();
  success('Project created.');
  log();
  log(`  ${c.dim('Next steps:')}`);
  log();
  log(`    cd ${name}`);
  log(`    npm install`);
  log(`    blun start`);
  log();
}

module.exports = { run };
