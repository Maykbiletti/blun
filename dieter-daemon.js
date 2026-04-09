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
const DEPLOY_INTERVAL = 150 * 60 * 1000; // 2.5 hours between deploys
var lastDeployTime = 0;
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



// ========== TASK DISTRIBUTION ==========


// === FAIR ROUND-ROBIN DISTRIBUTOR ===
var _rrIndex = 0;

async function getIdleAgents(db) {
  var busy = await db.query("SELECT DISTINCT agent_id FROM agent_tasks WHERE status = 'in_progress'");
  var busyIds = busy.rows.map(function(r) { return r.agent_id; });
  var all = await db.query("SELECT id, name, role, department FROM blun_agents WHERE id != 1 AND status = 'active'");
  return all.rows.filter(function(a) { return busyIds.indexOf(a.id) === -1; });
}

function pickNextIdle(idleAgents) {
  if (!idleAgents.length) return null;
  _rrIndex = _rrIndex % idleAgents.length;
  var agent = idleAgents[_rrIndex];
  _rrIndex++;
  return agent;
}

async function distributeTasks(db) {
  // Check for pending tasks
  var pending = await db.query(
    "SELECT * FROM agent_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5"
  );
  if (!pending.rows.length) {
    // Check master task list
    var masterList = await db.query(
      "SELECT content FROM agent_memory WHERE agent_id = 1 AND key = 'task_list'"
    );
    if (!masterList.rows.length) return { msg: 'Keine Tasks', distributed: 0 };
    return { msg: 'Task-Liste vorhanden, keine pending', distributed: 0 };
  }

  log('Found ' + pending.rows.length + ' pending tasks');
  var distributed = 0;

  for (var i = 0; i < pending.rows.length; i++) {
    var task = pending.rows[i];
    // Fair distribution: reassign if target agent is busy
    var idleAgents = await getIdleAgents(db);
    if (task.agent_id) {
      var targetIdle = idleAgents.some(function(a) { return a.id === task.agent_id; });
      if (!targetIdle && idleAgents.length > 0) {
        var next = pickNextIdle(idleAgents);
        log("Fair reassign: Task " + task.id + " von Agent " + task.agent_id + " -> " + next.name + " (" + next.id + ")");
        task.agent_id = next.id;
        await db.query("UPDATE agent_tasks SET agent_id = $1 WHERE id = $2", [next.id, task.id]);
      }
      try {
        var chatResult = await callAPI('POST', '/api/organisator/agents/' + task.agent_id + '/chat', {
          message: 'AUFGABE: ' + task.task
        });
        await db.query("UPDATE agent_tasks SET status = 'in_progress' WHERE id = $1", [task.id]);
        log('Task ' + task.id + ' sent to agent ' + task.agent_id);
        distributed++;
      } catch(e) {
        log('Task send error: ' + e.message);
      }
    } else {
      // Not assigned — let Dieter decide
      try {
        var agents = await db.query("SELECT id, name, role, department FROM blun_agents WHERE id != 1 AND status = 'active'");
        var agentList = agents.rows.map(function(a) { return a.name + ' (' + a.role + ')'; }).join(', ');
        var decisionResult = await callAPI('POST', '/api/organisator/agents/1/chat', {
          message: 'Weise diese Code-Aufgabe dem passenden Agent zu. Antworte NUR mit [TOOL:ASSIGN_TASK:AgentName|Aufgabe]. Die Aufgabe MUSS einen Dateipfad enthalten! Aufgabe: ' + task.task + '. Agents: ' + agentList
        });
        log('Dieter decision for task ' + task.id + ': ' + (decisionResult.response || '').substring(0, 100));
        distributed++;
      } catch(e) {
        log('Dieter decision error: ' + e.message);
      }
    }
  }

  return { msg: distributed + ' Tasks verteilt', distributed: distributed };
}

async function autoDistributeFromList(db) {
  // Load the master feature list from Dieter's memory
  var masterList = await db.query(
    "SELECT content FROM agent_memory WHERE agent_id = 1 AND key = 'task_list'"
  );
  if (!masterList.rows.length) return;

  // Check if there are already tasks in progress
  // No limit — distribute ALL tasks

  // Ask Dieter to pick next tasks from the list
  var result = await callAPI('POST', '/api/organisator/agents/1/chat', {
    message: 'Verteile Code-Tasks an idle Agents. JEDER Task MUSS einen konkreten Dateipfad enthalten! Format: [TOOL:ASSIGN_TASK:AgentName|Erstelle/Fix/Baue DATEIPFAD — Beschreibung]. Expertise: Fritz=dashboard/js/, Greta=dashboard/components/, Heinrich=src/routes/, Klaus=src/middleware/, Sandra=dashboard/css/, Petra=src/db/, Guenter=src/routes/deploy.js, Werner=src/routes/agent-comm.js, Rolf=dashboard/css/mobile.css, Leon=dashboard/css/. VERBOTEN: Marketing, Video, Analyse, Konzept, Report. NUR echten Code!'
  });
  log('Auto-distribute: ' + (result.response || '').substring(0, 200));
}


// ========== AGENT PULL-LOOP ==========

async function agentPullLoop(db) {
  var agents = await db.query(
    "SELECT id, name, role, department, status FROM blun_agents WHERE id != 1 AND status = 'active'"
  );
  if (!agents.rows.length) return { msg: "Keine aktiven Agents", pinged: 0 };

  var busy = await db.query(
    "SELECT DISTINCT agent_id FROM tasks WHERE status = 'in_progress'"
  );
  var busyIds = busy.rows.map(function(r) { return r.agent_id; });

  var idle = agents.rows.filter(function(a) { return busyIds.indexOf(a.id) === -1; });
  if (!idle.length) return { msg: agents.rows.length + " Agents alle beschaeftigt", pinged: 0 };

  log("Idle agents: " + idle.map(function(a) { return a.name; }).join(", "));

  var pending = await db.query(
    "SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT " + idle.length
  );

  var pinged = 0;
  for (var i = 0; i < idle.length && i < pending.rows.length; i++) {
    var agent = idle[i];
    var task = pending.rows[i];

    await db.query("UPDATE tasks SET agent_id = $1, status = 'in_progress' WHERE id = $2", [agent.id, task.id]);

    try {
      await callAPI("POST", "/api/organisator/agents/" + agent.id + "/chat", {
        message: "NEUER TASK #" + task.id + ": " + task.title + "\nDetails: " + (task.description || "Keine Details") + "\nBitte erledige das und melde dich wenn fertig."
      });
      log("Task #" + task.id + " an " + agent.name + " zugewiesen");
      pinged++;
    } catch(e) {
      log("Fehler bei Task-Zuweisung an " + agent.name + ": " + e.message);
    }
  }

  return { msg: pinged + "/" + idle.length + " idle Agents bekamen Tasks", pinged: pinged };
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

    // Distribute tasks + Deploy cycle (every 2.5h)
    var now = Date.now();
    var isDeployCycle = (now - lastDeployTime >= DEPLOY_INTERVAL);

    try {
      var taskResult = await distributeTasks(db);
      report.push(taskResult.msg);

      if (isDeployCycle) {
        lastDeployTime = now;
        log("=== DEPLOY CYCLE (every 2.5h) ===");

        try {
          var pullResult = await agentPullLoop(db);
          report.push(pullResult.msg);
        } catch(e) { log('Pull-loop error: ' + e.message); }

        await autoDistributeFromList(db);
      } else {
        var minsLeft = Math.round((DEPLOY_INTERVAL - (now - lastDeployTime)) / 60000);
        report.push("Naechster Deploy in " + minsLeft + " Min");
      }
    } catch(e) { log('Task distribution error: ' + e.message); }

    // Save heartbeat
    var status = problems.length > 0 ? 'warning' : 'healthy';
    await saveHeartbeat(db, status, report.join(' | '));

    // Record heartbeat for all active agents
    try {
      var allAgents = await callAPI('GET', '/api/organisator/agents');
      if (Array.isArray(allAgents)) {
        for (var i = 0; i < allAgents.length; i++) {
          var ag = allAgents[i];
          await db.query('INSERT INTO agent_heartbeats (agent_id, status, model, tokens_used, cost) VALUES ($1,$2,$3,0,0)', [ag.id, ag.status || 'active', ag.model || 'haiku']);
        }
      }
    } catch(e) { log('Heartbeat error: ' + e.message); }

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
