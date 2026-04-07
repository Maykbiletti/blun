// Dieter CEO Daemon — 24/7 proactive organizer
// Runs every 5 minutes, checks all systems, takes action
// NEVER codes — only organizes, monitors, delegates

const http = require('http');
const { Client } = require('pg');
const { execSync } = require('child_process');

const BLUN_PORT = process.env.BLUN_PORT || 3200;
const API_KEY = process.env.BLUN_API_KEY || 'blun-dev-key';
const AGENT_ID = 1; // Dieter
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1605241602';

function log(msg) {
  console.log('[' + new Date().toISOString() + '] ' + msg);
}

function callAPI(method, path, body) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: '127.0.0.1', port: BLUN_PORT, path: path, method: method,
      headers: { 'Content-Type': 'application/json', 'x-blun-key': API_KEY }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { resolve({ raw: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    if (data) req.write(data);
    req.end();
  });
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  return new Promise(function(resolve) {
    var data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' });
    var opts = {
      hostname: 'api.telegram.org', port: 443, method: 'POST',
      path: '/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    var https = require('https');
    var req = https.request(opts, function(res) {
      res.on('data', function() {});
      res.on('end', resolve);
    });
    req.on('error', resolve);
    req.write(data);
    req.end();
  });
}

async function getDB() {
  var db = new Client({ host: 'localhost', database: 'blun', user: 'blun', password: 'blun2026secure' });
  await db.connect();
  return db;
}

async function saveHeartbeat(db, status, details) {
  await db.query(
    'INSERT INTO agent_heartbeats (agent_id, status, model, tokens_used, cost) VALUES ($1, $2, $3, 0, 0)',
    [AGENT_ID, status, details]
  );
}

async function saveMemory(db, key, content) {
  await db.query(
    'INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = EXCLUDED.content, updated_at = now()',
    [AGENT_ID, key, content]
  );
}

// ========== CHECKS ==========

async function checkBLUNHealth() {
  var result = await callAPI('GET', '/api/health');
  if (result.error || result.status !== 'ok') {
    return { ok: false, msg: 'BLUN API nicht erreichbar: ' + (result.error || JSON.stringify(result)) };
  }
  return { ok: true, msg: 'BLUN API OK' };
}

async function checkModels() {
  var result = await callAPI('GET', '/api/models');
  var models = (result && result.models) ? result.models : [];
  var installed = models.filter(function(m) { return m.status === 'installed' || m.status === 'running'; });
  var running = models.filter(function(m) { return m.status === 'running'; });
  return {
    ok: true,
    total: models.length,
    installed: installed.length,
    running: running.length,
    msg: running.length + ' Modelle laufen, ' + installed.length + ' installiert'
  };
}

async function checkAgents(db) {
  var result = await db.query('SELECT id, name, status, role FROM blun_agents');
  var agents = result.rows;
  var active = agents.filter(function(a) { return a.status === 'active'; });
  var problems = agents.filter(function(a) { return a.status === 'error' || a.status === 'idle'; });

  // Auto-reset idle/error agents
  for (var i = 0; i < problems.length; i++) {
    var a = problems[i];
    log('Resetting agent ' + a.name + ' (was ' + a.status + ')');
    await db.query('UPDATE blun_agents SET status = $1 WHERE id = $2', ['active', a.id]);
  }

  return {
    ok: problems.length === 0,
    total: agents.length,
    active: active.length,
    reset: problems.length,
    msg: active.length + '/' + agents.length + ' Agents active' + (problems.length > 0 ? ', ' + problems.length + ' resettet' : '')
  };
}

async function checkDisk() {
  try {
    var output = execSync('df -h / --output=pcent | tail -1').toString().trim();
    var percent = parseInt(output);
    return {
      ok: percent < 85,
      percent: percent,
      msg: 'Disk ' + percent + '%' + (percent >= 85 ? ' ⚠️ WARNUNG' : '')
    };
  } catch(e) {
    return { ok: true, percent: 0, msg: 'Disk check failed' };
  }
}

async function checkPM2() {
  try {
    var output = execSync('pm2 jlist 2>/dev/null').toString();
    var procs = JSON.parse(output);
    var stopped = procs.filter(function(p) { return p.pm2_env.status !== 'online'; });

    // Auto-restart stopped processes
    for (var i = 0; i < stopped.length; i++) {
      log('Restarting PM2 process: ' + stopped[i].name);
      try { execSync('pm2 restart ' + stopped[i].pm_id); } catch(e) {}
    }

    return {
      ok: stopped.length === 0,
      total: procs.length,
      online: procs.length - stopped.length,
      restarted: stopped.length,
      msg: (procs.length - stopped.length) + '/' + procs.length + ' PM2 online' + (stopped.length > 0 ? ', ' + stopped.length + ' restartet' : '')
    };
  } catch(e) {
    return { ok: true, total: 0, msg: 'PM2 check: ' + e.message };
  }
}

async function checkRAM() {
  try {
    var output = execSync("free -g | grep Mem | awk '{print $2, $3, $4}'").toString().trim();
    var parts = output.split(' ');
    var total = parseInt(parts[0]);
    var used = parseInt(parts[1]);
    var free = parseInt(parts[2]);
    return {
      ok: free > 10,
      total: total, used: used, free: free,
      msg: 'RAM ' + used + '/' + total + ' GB (' + free + ' GB frei)' + (free <= 10 ? ' ⚠️ WENIG RAM' : '')
    };
  } catch(e) {
    return { ok: true, msg: 'RAM check failed' };
  }
}

// ========== MAIN LOOP ==========

async function runCheck() {
  log('=== Dieter CEO Check ===');
  var db = await getDB();
  var problems = [];
  var report = [];

  try {
    // Run all checks
    var health = await checkBLUNHealth();
    var models = await checkModels();
    var agents = await checkAgents(db);
    var disk = await checkDisk();
    var pm2 = await checkPM2();
    var ram = await checkRAM();

    report.push(health.msg);
    report.push(models.msg);
    report.push(agents.msg);
    report.push(disk.msg);
    report.push(pm2.msg);
    report.push(ram.msg);

    if (!health.ok) problems.push('🚨 ' + health.msg);
    if (!agents.ok) problems.push('⚠️ Agents: ' + agents.msg);
    if (!disk.ok) problems.push('⚠️ ' + disk.msg);
    if (!pm2.ok) problems.push('⚠️ PM2: ' + pm2.msg);
    if (!ram.ok) problems.push('⚠️ ' + ram.msg);

    // Save heartbeat
    var status = problems.length > 0 ? 'warning' : 'healthy';
    await saveHeartbeat(db, status, report.join(' | '));

    // Save last check to memory
    await saveMemory(db, 'last_health_check', new Date().toISOString() + '\n' + report.join('\n'));

    // Log
    log(report.join(' | '));

    // Alert on problems
    if (problems.length > 0) {
      var alertMsg = '🤖 <b>Dieter CEO Alert</b>\n\n' + problems.join('\n');
      log('ALERT: ' + problems.join(', '));
      await sendTelegram(alertMsg);
    }

    // Hourly summary (on the hour)
    var now = new Date();
    if (now.getMinutes() < 5) {
      await saveMemory(db, 'hourly_summary_' + now.getHours(),
        now.toISOString() + ' — ' + report.join(' | ')
      );
    }

  } catch(e) {
    log('ERROR: ' + e.message);
  } finally {
    await db.end();
  }
}

// Start
log('Dieter CEO Daemon starting...');
log('Check interval: ' + (CHECK_INTERVAL / 1000) + 's');
runCheck();
setInterval(runCheck, CHECK_INTERVAL);
