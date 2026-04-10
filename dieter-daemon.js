// Dieter CEO Daemon — 24/7 proactive organizer
// Runs every 5 minutes, checks all systems, takes action
// NEVER codes — only organizes, monitors, delegates

const http = require('http');
const { Client } = require('pg');
const { execSync } = require('child_process');
const autoIntegrator = require('./src/agent/auto-integrator');
const taskRunner = require('./src/agent/task-runner');
var _runningTasks = new Set();

const BLUN_PORT = process.env.BLUN_PORT || 3200;
const API_KEY = process.env.BLUN_API_KEY || 'blun-dev-key';
const AGENT_ID = 1; // Dieter
const CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute
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




// === AUTO-QA GATE: Prueft Agent-Code vor Merge ===
function autoQaCheck(filePath, content) {
  var issues = [];

  // 1. Emoji check
  var emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  var isMarkdown = /\.(md|markdown)$/i.test(filePath);
  var isCopyFile = /demo\.html$|report\.js$|pricing\.html$|cost-widget\.js$|agent-audit/i.test(filePath);
  if (!isMarkdown && !isCopyFile && emojiRegex.test(content)) issues.push("EMOJI detected");

  // 2. Blue color check DISABLED — #3b82f6 is our primary brand color

  // 3. Dummy data check (skip test files)
  var isTestFile = /\.(test|spec)\.(js|ts)$/i.test(filePath) || filePath.indexOf("/tests/") !== -1 || filePath.indexOf("test-") !== -1;
  if (!isTestFile && (content.includes("Agent-X") || content.includes("Example Agent") || content.includes("Demo Agent") || content.includes("Test Agent"))) {
    issues.push("DUMMY agent data detected");
  }

  // 4. Self-rendering check DISABLED — body.appendChild is legitimate for toasts/modals/onboarding overlays

  // 5. Protected file check
  var protectedFiles = ["agent-engine.js","code-tools.js","server.js",".env","package.json","package-lock.json","login.html","dieter-daemon.js","auth.js","db.js","blun.db"];
  var basename = filePath.split("/").pop();
  if (protectedFiles.indexOf(basename) !== -1) {
    issues.push("PROTECTED file: " + basename);
  }

  return issues;
}

// === AUTO DEPARTMENT SWITCH ===
var TASK_DEPT_MAP = {
  "dashboard": "Design & Frontend",
  "frontend": "Design & Frontend",
  "css": "Design & Frontend",
  "component": "Design & Frontend",
  "ui": "Design & Frontend",
  "ux": "Design & Frontend",
  "api": "Backend & Coding",
  "route": "Backend & Coding",
  "server": "Backend & Coding",
  "backend": "Backend & Coding",
  "middleware": "Backend & Coding",
  "database": "Backend & Coding",
  "db": "Backend & Coding",
  "auth": "Backend & Coding",
  "test": "QA & Testing",
  "qa": "QA & Testing",
  "review": "Qualitaetskontrolle",
  "bug": "QA & Testing",
  "deploy": "Infrastruktur & DevOps",
  "docker": "Infrastruktur & DevOps",
  "nginx": "Infrastruktur & DevOps",
  "ci": "Infrastruktur & DevOps",
  "dns": "Infrastruktur & DevOps",
  "server": "Infrastruktur & DevOps",
  "agent": "Agent System",
  "skill": "Agent System",
  "marketplace": "Agent System",
  "marketing": "Marketing & SEO",
  "seo": "Marketing & SEO",
  "landing": "Marketing & SEO",
  "content": "Marketing & SEO",
  "mobile": "Mobile & Desktop",
  "electron": "Mobile & Desktop",
  "app": "Mobile & Desktop",
  "video": "Video & Medien",
  "billing": "Business & Sales",
  "stripe": "Business & Sales",
  "affiliate": "Business & Sales",
  "model": "Infrastruktur & DevOps",
  "llm": "Infrastruktur & DevOps",
  "sidebar": "Design & Frontend",
  "kanban": "Design & Frontend"
};

async function autoSwitchDepartment(db, agentId, taskTitle) {
  var title = (taskTitle || "").toLowerCase();
  // Skip dept switch for QA review tasks — those are temporary assignments
  if (title.indexOf("qa") !== -1 || title.indexOf("review") !== -1) return;
  var newDept = null;
  var keys = Object.keys(TASK_DEPT_MAP);
  for (var k = 0; k < keys.length; k++) {
    if (title.indexOf(keys[k]) !== -1) {
      newDept = TASK_DEPT_MAP[keys[k]];
      break;
    }
  }
  if (newDept) {
    var current = await db.query("SELECT department FROM blun_agents WHERE id = $1", [agentId]);
    if (current.rows.length && current.rows[0].department !== newDept) {
      await db.query("UPDATE blun_agents SET department = $1 WHERE id = $2", [newDept, agentId]);
      log("Dept switch: Agent " + agentId + " -> " + newDept + " (task: " + title.substring(0, 40) + ")");
    }
  }
}

// === FAIR ROUND-ROBIN DISTRIBUTOR ===
var _rrIndex = 0;

async function getIdleAgents(db) {
  var busy = await db.query("SELECT DISTINCT agent_id FROM agent_tasks WHERE status IN ('in_progress','processing')");
  var busyIds = busy.rows.map(function(r) { return r.agent_id; });
  var all = await db.query("SELECT id, name, role, department, model FROM blun_agents WHERE id != 1 AND status = 'active'");
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
    "SELECT * FROM agent_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 30"
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
    // Fair distribution: reassign if target agent is busy (but NOT QA tasks)
    var idleAgents = await getIdleAgents(db);
    var isQaTask = (task.task || "").toLowerCase().indexOf("qa") !== -1 || (task.task || "").toLowerCase().indexOf("review") !== -1;
    if (task.agent_id && !isQaTask) {
      var targetIdle = idleAgents.some(function(a) { return a.id === task.agent_id; });
      if (!targetIdle && idleAgents.length > 0) {
        var next = pickNextIdle(idleAgents);
        log("Fair reassign: Task " + task.id + " von Agent " + task.agent_id + " -> " + next.name + " (" + next.id + ")");
        task.agent_id = next.id;
        await db.query("UPDATE agent_tasks SET agent_id = $1 WHERE id = $2", [next.id, task.id]);
      }
      try {
        if (_runningTasks.has(task.id)) { log('Task ' + task.id + ' already running, skip'); continue; }
        var agentRow = idleAgents.find(function(a){ return a.id === task.agent_id; });
        if (!agentRow) {
          var ar = await db.query('SELECT id, name, role, department, model FROM blun_agents WHERE id = $1', [task.agent_id]);
          agentRow = ar.rows[0];
        }
        if (!agentRow) { log('Task ' + task.id + ': agent ' + task.agent_id + ' not found'); continue; }
        await db.query("UPDATE agent_tasks SET status = 'in_progress' WHERE id = $1", [task.id]);
        _runningTasks.add(task.id);
        log('Task ' + task.id + ' -> ' + agentRow.name + ' via task-runner');
        // Fire-and-forget: let Claude CLI run in background, task-runner updates DB
        (function(a, t){
          taskRunner.executeTask(a, t, db.query.bind(db))
            .then(function(r){ log('Task ' + t.id + ' result: ' + JSON.stringify(r).substring(0, 200)); })
            .catch(function(err){ log('Task ' + t.id + ' runner error: ' + err.message); })
            .finally(function(){ _runningTasks.delete(t.id); });
        })(agentRow, task);
        await autoSwitchDepartment(db, task.agent_id, task.task);
        distributed++;
      } catch(e) {
        log('Task send error: ' + e.message);
      }
    } else {
      // Not assigned — let Dieter decide, but with live load stats so he balances
      try {
        var agents = await db.query("SELECT id, name, role, department, model FROM blun_agents WHERE id != 1 AND status = 'active'");
        var loads = await db.query("SELECT a.name, COUNT(t.id)::int AS open FROM blun_agents a LEFT JOIN agent_tasks t ON t.agent_id = a.id AND t.status IN ('pending','processing') WHERE a.id != 1 AND a.status = 'active' GROUP BY a.name ORDER BY open ASC");
        var agentList = loads.rows.map(function(r) { return r.name + '(' + r.open + ')'; }).join(', ');
        var decisionResult = await callAPI('POST', '/api/organisator/agents/1/internal-chat', {
          message: 'Weise diese Code-Aufgabe dem passenden Agent zu. LAST-BALANCE: vermeide Agents die bereits viele offene Tasks haben, bevorzuge freie. Antworte NUR mit [TOOL:ASSIGN_TASK:AgentName|Aufgabe]. Die Aufgabe MUSS einen Dateipfad enthalten! Aufgabe: ' + task.task + '. Agents mit offener Task-Zahl (aufsteigend, niedrig=bevorzugt): ' + agentList
        });
        log('Dieter decision for task ' + task.id + ': ' + (decisionResult.response || '').substring(0, 100));
        distributed++;
      } catch(e) {
        log('Dieter decision error: ' + e.message);
      }
    }
  }

  // Post-decision load balancer: cap any single agent at CAP open tasks
  try {
    var CAP = 12;
    var hot = await db.query("SELECT a.id, a.name, COUNT(t.id)::int AS open FROM blun_agents a LEFT JOIN agent_tasks t ON t.agent_id = a.id AND t.status IN ('pending','processing') WHERE a.id != 1 AND a.status = 'active' GROUP BY a.id, a.name HAVING COUNT(t.id) > " + CAP + " ORDER BY open DESC");
    if (hot.rows.length) {
      var cold = await db.query("SELECT a.id, a.name, COUNT(t.id)::int AS open FROM blun_agents a LEFT JOIN agent_tasks t ON t.agent_id = a.id AND t.status IN ('pending','processing') WHERE a.id != 1 AND a.status = 'active' GROUP BY a.id, a.name HAVING COUNT(t.id) < " + CAP + " ORDER BY open ASC");
      for (var h = 0; h < hot.rows.length; h++) {
        var over = hot.rows[h].open - CAP;
        // Move `over` pending tasks from hot agent to coldest agents
        var movable = await db.query("SELECT id FROM agent_tasks WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT $2", [hot.rows[h].id, over]);
        var ci = 0;
        for (var m = 0; m < movable.rows.length; m++) {
          if (!cold.rows.length) break;
          var target = cold.rows[ci % cold.rows.length];
          await db.query("UPDATE agent_tasks SET agent_id = $1 WHERE id = $2", [target.id, movable.rows[m].id]);
          target.open = (target.open || 0) + 1;
          log('Rebalance: task ' + movable.rows[m].id + ' ' + hot.rows[h].name + ' -> ' + target.name);
          ci++;
        }
      }
    }
  } catch(re) { log('Rebalance error: ' + re.message); }

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
  var result = await callAPI('POST', '/api/organisator/agents/1/internal-chat', {
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
    "SELECT DISTINCT agent_id FROM tasks WHERE status IN ('in_progress','processing')"
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
      await callAPI("POST", "/api/organisator/agents/" + agent.id + "/internal-chat", {
        message: "NEUER TASK #" + task.id + ": " + task.title + "\nDetails: " + (task.description || "Keine Details") + "\nBitte erledige das und melde dich wenn fertig."
      });
      log("Task #" + task.id + " an " + agent.name + " zugewiesen");
      await autoSwitchDepartment(db, agent.id, task.title);
      pinged++;
    } catch(e) {
      log("Fehler bei Task-Zuweisung an " + agent.name + ": " + e.message);
    }
  }

  return { msg: pinged + "/" + idle.length + " idle Agents bekamen Tasks", pinged: pinged };
}


// ========== AUTO INTEGRATOR (Junior) ==========
// Checks worktrees for completed code, QA checks, merges, integrates

async function autoIntegrate(db) {
  var fs = require("fs");
  var worktreeBase = "/root/blun-worktrees/";
  var merged = [];
  var failed = [];

  var agents = await db.query("SELECT id, name FROM blun_agents WHERE id != 1 AND status = 'active'");
  
  for (var i = 0; i < agents.rows.length; i++) {
    var agent = agents.rows[i];
    var dir = worktreeBase + "agent-" + agent.name.toLowerCase();
    if (!fs.existsSync(dir)) continue;

    try {
      var ahead = execSync("cd " + dir + " && git log main..HEAD --oneline 2>/dev/null | wc -l").toString().trim();
      if (parseInt(ahead) === 0) continue;

      var files = execSync("cd " + dir + " && git diff main...HEAD --name-only --diff-filter=AM 2>/dev/null").toString().trim();
      if (!files) continue;

      var fileList = files.split(String.fromCharCode(10));
      var qaPass = true;
      var qaIssues = [];

      for (var j = 0; j < fileList.length; j++) {
        var filePath = fileList[j].trim();
        if (!filePath) continue;
        try {
          var fileExists = false;
          try { execSync("cd " + dir + " && test -f " + JSON.stringify(filePath)); fileExists = true; } catch(eExist) {}
          if (!fileExists) continue;
          var diffOnly = "";
          try {
            var rawDiff = execSync("cd " + dir + " && git diff main...HEAD -- " + JSON.stringify(filePath) + " 2>/dev/null").toString();
            diffOnly = rawDiff.split(String.fromCharCode(10)).filter(function(ln){return ln.length>0 && ln.charAt(0)==="+" && ln.substring(0,3)!=="+++";}).map(function(ln){return ln.substring(1);}).join(String.fromCharCode(10));
          } catch(eDiff) { diffOnly = ""; }
          var issues = autoQaCheck(filePath, diffOnly);
          if (issues.length > 0) {
            qaPass = false;
            qaIssues.push(filePath + ": " + issues.join(", "));
          }
          if (filePath.endsWith(".js")) {
            try {
              execSync("cd " + dir + " && node -c " + JSON.stringify(filePath) + " 2>&1");
            } catch(syntaxErr) {
              qaPass = false;
              qaIssues.push(filePath + ": SYNTAX ERROR");
            }
            // Dependency check: new require("<external>") must resolve in /root/blun
            try {
              var reqRe = /require\(["']([^"'\.\/][^"']*)["']\)/g;
              var mm; var seen = {};
              var builtins = {fs:1,path:1,os:1,http:1,https:1,crypto:1,child_process:1,url:1,util:1,stream:1,events:1,zlib:1,buffer:1,querystring:1,net:1,tls:1,dns:1,cluster:1,worker_threads:1,assert:1,readline:1,process:1,timers:1,string_decoder:1,v8:1,vm:1,module:1,perf_hooks:1};
              while ((mm = reqRe.exec(diffOnly)) !== null) {
                var parts = mm[1].split("/");
                var mod = parts[0].charAt(0) === "@" ? parts.slice(0,2).join("/") : parts[0];
                if (seen[mod] || builtins[mod]) continue;
                seen[mod] = 1;
                try {
                  execSync("node /root/blun/tools/check-dep.js " + JSON.stringify(mod));
                } catch(depErr) {
                  qaPass = false;
                  qaIssues.push(filePath + ": MISSING DEP " + mod);
                }
              }
            } catch(eDep) {}
          }
        } catch(e) {}
      }

      if (!qaPass) {
        log("QA FAIL " + agent.name + ": " + qaIssues.join("; "));
        failed.push(agent.name + " (" + qaIssues.length + " issues)");
        continue;
      }

      var branch = "agent/" + agent.name.toLowerCase();
      // Safety: skip if agent worktree is on a non-agent branch (feature/*, etc.)
      var worktreeBranch = "";
      try {
        worktreeBranch = execSync("cd " + dir + " && git rev-parse --abbrev-ref HEAD 2>/dev/null").toString().trim();
      } catch(eBr) { worktreeBranch = ""; }
      if (worktreeBranch && worktreeBranch !== branch) {
        log("Skip auto-merge " + agent.name + ": worktree on " + worktreeBranch + " (not " + branch + ")");
        continue;
      }
      try {
        var mergeOut = "";
        try {
          mergeOut = execSync("cd /root/blun && git merge " + branch + " --no-edit 2>&1").toString();
        } catch(mergeExecErr) {
          // execSync throws on non-zero exit — ALWAYS abort to clean up half-merge state
          try { execSync("cd /root/blun && git merge --abort 2>/dev/null"); } catch(eAbort) {}
          log("Merge failed " + agent.name + ": " + (mergeExecErr.stdout || mergeExecErr.message || "unknown").toString().substring(0, 200));
          failed.push(agent.name + " (merge failed)");
          continue;
        }
        if (mergeOut.indexOf("CONFLICT") !== -1) {
          try { execSync("cd /root/blun && git merge --abort 2>/dev/null"); } catch(eAbort) {}
          failed.push(agent.name + " (merge conflict)");
          continue;
        }
        log("MERGED " + agent.name + ": " + fileList.length + " files");
        merged.push(agent.name);

        // Auto-integrate each new file into running system
        var integrations = [];
        for (var fi = 0; fi < fileList.length; fi++) {
          var fpath = fileList[fi].trim();
          if (!fpath) continue;
          try {
            var ir = autoIntegrator.integrateFile(fpath, "/root/blun");
            if (ir.action) {
              integrations.push(fpath + " -> " + ir.action);
              log("INTEGRATED " + fpath + ": " + ir.action);
            }
          } catch(intErr) {
            log("Integrate file error " + fpath + ": " + intErr.message);
          }
        }

        // If we modified index.html or server.js, commit those changes
        if (integrations.length > 0) {
          try {
            execSync("cd /root/blun && git add dashboard/index.html server.js 2>/dev/null");
            execSync("cd /root/blun && BLUN_DEPLOYER=dieter git commit -m 'auto-integrate: " + agent.name + " files (" + integrations.length + ")' 2>&1");
          } catch(commitErr) { log("Integration commit skipped: " + commitErr.message.substring(0, 100)); }
        }

        execSync("cd " + dir + " && git reset --hard main 2>/dev/null");
        await db.query("UPDATE agent_tasks SET status = 'completed', completed_at = NOW() WHERE agent_id = $1 AND status IN ('processing', 'in_progress')", [agent.id]);
      } catch(mergeErr) {
        try { execSync("cd /root/blun && git merge --abort 2>/dev/null"); } catch(eA) {}
        log("Merge error " + agent.name + ": " + mergeErr.message);
        failed.push(agent.name + " (merge error)");
      }
    } catch(e) {
      log("Integrate check error " + agent.name + ": " + e.message);
    }
  }

  if (merged.length > 0) {
    try {
      execSync("cd /root/blun && git push pro main 2>&1");
      execSync("pm2 restart blun --silent 2>/dev/null");
      log("DEPLOYED: " + merged.join(", "));
      await sendTelegram("Auto-Deploy: " + merged.length + " Agent(s) gemerged: " + merged.join(", "));
    } catch(pushErr) {
      log("Push/restart error: " + pushErr.message);
    }
  }

  return { merged: merged, failed: failed };
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

    // Auto-integrate agent code
    try {
      var intResult = await autoIntegrate(db);
      if (intResult.merged.length) report.push("Merged: " + intResult.merged.join(", "));
      if (intResult.failed.length) report.push("QA-Fail: " + intResult.failed.join(", "));
    } catch(e) { log("Integrate error: " + e.message); }

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
