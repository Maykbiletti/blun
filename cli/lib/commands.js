'use strict';

const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const api = require('./api');
const { c, log, info, success, warn, error, heading, table, spinner } = require('./utils');

const PID_FILE = path.join(process.cwd(), '.blun.pid');

// --- start ---

async function start() {
  if (!fs.existsSync(path.join(process.cwd(), 'server.js'))) {
    error('No server.js found. Are you in a BLUN project directory?');
    process.exit(1);
  }

  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isRunning(pid)) {
      warn(`Server already running (PID ${pid}).`);
      return;
    }
    fs.unlinkSync(PID_FILE);
  }

  info('Starting BLUN server...');

  const logFile = fs.openSync(path.join(process.cwd(), 'logs', 'server.log'), 'a');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', logFile, logFile],
    env: { ...process.env },
  });

  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  success(`Server started (PID ${child.pid}).`);
  log(`  ${c.dim('Logs:')} tail -f logs/server.log`);
}

// --- stop ---

async function stop() {
  if (!fs.existsSync(PID_FILE)) {
    warn('No running server found.');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);

  try {
    process.kill(pid, 'SIGTERM');
    success(`Server stopped (PID ${pid}).`);
  } catch {
    warn(`Process ${pid} not found. Cleaning up.`);
  }

  fs.unlinkSync(PID_FILE);
}

// --- status ---

async function status() {
  heading('BLUN Status');

  // Check if server is running locally
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isRunning(pid)) {
      success(`Server running (PID ${pid})`);
    } else {
      warn('PID file exists but process is dead.');
      fs.unlinkSync(PID_FILE);
    }
  } else {
    info('No local PID file found.');
  }

  // Try API
  try {
    const data = await api.get('/api/health');
    log();
    table([
      ['Version',   data.version || 'unknown'],
      ['Uptime',    formatUptime(data.uptime)],
      ['Agents',    String(data.agents || 0)],
      ['Companies', String(data.companies || 0)],
      ['Database',  data.database || 'unknown'],
      ['Redis',     data.redis ? 'connected' : 'disabled'],
    ]);
  } catch (err) {
    log();
    warn(err.message);
  }

  log();
}

// --- agent ---

async function agentList() {
  try {
    const agents = await api.get('/api/agents');
    heading('Agents');
    if (!agents.length) {
      info('No agents configured.');
      log();
      return;
    }
    for (const a of agents) {
      const status = a.active ? c.green('active') : c.dim('inactive');
      log(`    ${c.bold(a.name)}  ${status}  ${c.dim(a.model || '')}`);
    }
    log();
  } catch (err) {
    error(err.message);
  }
}

async function agentCreate(name) {
  if (!name) {
    error('Usage: blun agent create <name>');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, d) => new Promise((res) => {
    rl.question(`  ${c.yellow('?')} ${q} ${d ? c.dim(`(${d})`) + ' ' : ''}`, (a) => res(a.trim() || d || ''));
  });

  heading(`Create Agent: ${name}`);

  const model = await ask('Model:', 'claude-sonnet-4-20250514');
  const company = await ask('Company:', '');
  const systemPrompt = await ask('System prompt:', `You are ${name}, an AI assistant.`);

  rl.close();

  try {
    await api.post('/api/agents', { name, model, company, systemPrompt });
    success(`Agent "${name}" created.`);
  } catch (err) {
    // If server not running, create local file
    const agentDir = path.join(process.cwd(), 'agents');
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });

    const config = {
      name,
      model,
      company: company || null,
      systemPrompt,
      active: true,
      tools: [],
      skills: [],
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(agentDir, `${name}.json`),
      JSON.stringify(config, null, 2) + '\n'
    );
    success(`Agent "${name}" created locally in agents/${name}.json`);
  }

  log();
}

// --- company ---

async function companyList() {
  try {
    const companies = await api.get('/api/companies');
    heading('Companies');
    if (!companies.length) {
      info('No companies configured.');
      log();
      return;
    }
    for (const co of companies) {
      log(`    ${c.bold(co.name)}  ${c.dim(co.agents + ' agents')}`);
    }
    log();
  } catch (err) {
    error(err.message);
  }
}

async function companyCreate(name) {
  if (!name) {
    error('Usage: blun company create <name>');
    process.exit(1);
  }

  try {
    await api.post('/api/companies', { name });
    success(`Company "${name}" created.`);
  } catch (err) {
    const dir = path.join(process.cwd(), 'companies');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const config = {
      name,
      agents: [],
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(dir, `${name}.json`),
      JSON.stringify(config, null, 2) + '\n'
    );
    success(`Company "${name}" created locally in companies/${name}.json`);
  }

  log();
}

// --- migrate ---

async function migratePaperclip() {
  heading('Migrate from Paperclip');
  info('Scanning for Paperclip configuration...');

  const candidates = [
    path.join(process.cwd(), 'paperclip.config.js'),
    path.join(process.cwd(), 'AGENTS.md'),
    path.join(process.cwd(), '.paperclip'),
  ];

  let found = false;
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      success(`Found: ${path.basename(f)}`);
      found = true;
    }
  }

  if (!found) {
    warn('No Paperclip configuration found in current directory.');
    info('Place paperclip.config.js or AGENTS.md here and retry.');
    log();
    return;
  }

  // Parse AGENTS.md if present
  const agentsMd = path.join(process.cwd(), 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    const content = fs.readFileSync(agentsMd, 'utf8');
    const agentBlocks = content.split(/^##\s+/m).filter(Boolean);
    let count = 0;

    const agentDir = path.join(process.cwd(), 'agents');
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });

    for (const block of agentBlocks) {
      const nameMatch = block.match(/^(\S+)/);
      if (!nameMatch) continue;
      const agentName = nameMatch[1].toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!agentName) continue;

      const config = {
        name: agentName,
        model: 'claude-sonnet-4-20250514',
        systemPrompt: block.trim().slice(agentName.length).trim(),
        active: true,
        tools: [],
        skills: [],
        migratedFrom: 'paperclip',
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(agentDir, `${agentName}.json`),
        JSON.stringify(config, null, 2) + '\n'
      );
      count++;
    }

    success(`Migrated ${count} agents from AGENTS.md`);
  }

  log();
}

// --- skill / tool placeholders ---

async function skillInstall(name) {
  if (!name) {
    error('Usage: blun skill install <name>');
    process.exit(1);
  }
  heading('Install Skill');
  info(`Skill registry not yet available.`);
  info(`Placeholder: would install skill "${name}".`);
  log();
}

async function toolInstall(repo) {
  if (!repo) {
    error('Usage: blun tool install <repo>');
    process.exit(1);
  }
  heading('Install Tool');
  info(`Tool installation not yet available.`);
  info(`Placeholder: would clone and install from "${repo}".`);
  log();
}

// --- helpers ---

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function formatUptime(seconds) {
  if (!seconds) return 'unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  start, stop, status,
  agentList, agentCreate,
  companyList, companyCreate,
  migratePaperclip,
  skillInstall, toolInstall,
};
