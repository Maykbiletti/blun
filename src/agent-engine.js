// BLUN - AI Organisator | MIT License
// Thin wrapper — modules in src/agent/
var codeTools = require("./code-tools");
var { callClaudeCLIStream } = require("./claude-stream");

const { query, queryOne } = require("./db");
const { v4: uuid } = require("uuid");

// === MODULE IMPORTS ===
var llm = require("./agent/llm");
var perf = require("./agent/performance");
var messaging = require("./agent/messaging");
var codeGraph = require("./agent/code-graph");
var visualQA = require("./agent/visual-qa");
var memLayers = require("./agent/memory-layers");
var dream = require("./agent/dream");
var skillsLoader = require("./agent/skills-loader");

// Re-export from modules
var callLLM = llm.callLLM;
var callClaudeCLI = llm.callClaudeCLI;
var callCodexCLI = llm.callCodexCLI;
var callCLI = llm.callCLI;
var getRateLimitStatus = llm.getRateLimitStatus;
var acquireCliSlot = llm.acquireCliSlot;
var releaseCliSlot = llm.releaseCliSlot;
var pauseCli = llm.pauseCli;
var decryptKey = llm.decryptKey;
var fetchWithRateLimit = llm.fetchWithRateLimit;

var selfHealTask = perf.selfHealTask;
var mentorReview = perf.mentorReview;
var awardXP = perf.awardXP;
var scoreTask = perf.scoreTask;
var updatePerformance = perf.updatePerformance;
var routeTask = perf.routeTask;
var splitTask = perf.splitTask;
var getLeaderboard = perf.getLeaderboard;
var autoScoreTask = perf.autoScoreTask;

var sendAgentMessage = messaging.sendAgentMessage;
var getAgentInbox = messaging.getAgentInbox;
var markMessageRead = messaging.markMessageRead;
var replyToMessage = messaging.replyToMessage;
var broadcastMessage = messaging.broadcastMessage;
var getUnreadSummary = messaging.getUnreadSummary;

var indexFileToGraph = codeGraph.indexFileToGraph;
var findRelatedFiles = codeGraph.findRelatedFiles;
var suggestAgentForFile = codeGraph.suggestAgentForFile;

var visualQACheck = visualQA.visualQACheck;
var autoVisualQA = visualQA.autoVisualQA;

var saveLayeredMemory = memLayers.saveLayeredMemory;
var loadLayeredMemory = memLayers.loadLayeredMemory;
var promoteMemory = memLayers.promoteMemory;
var filterNoiseFromDecisions = memLayers.filterNoiseFromDecisions;

var dreamCycle = dream.dreamCycle;
var startDreamCycle = dream.startDreamCycle;
var stopDreamCycle = dream.stopDreamCycle;

// Wire circular dependencies

// Active agent loops
const activeAgents = new Map();

// === MEMORY FUNCTIONS (kept inline — tightly coupled to heartbeat) ===

async function loadAgentMemory(agentId) {
  var rows = await query("SELECT key, content as value FROM agent_memory WHERE agent_id = $1", [agentId]);
  var mem = {};
  for (var i = 0; i < rows.length; i++) mem[rows[i].key] = rows[i].value;
  return mem;
}

async function loadSmartMemory(agentId, userMessage, maxChars) {
  maxChars = maxChars || 8000;
  var rows = await query("SELECT key, content as value, updated_at FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC", [agentId]);
  if (!rows.length) return "";
  var priority = ["identity", "personality", "rules", "security", "rename", "vision", "skill_"];
  var selected = [];
  var totalChars = 0;
  var msg = (userMessage || "").toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    var dominated = false;
    for (var p = 0; p < priority.length; p++) {
      if (rows[i].key.indexOf(priority[p]) !== -1) { dominated = true; break; }
    }
    if (dominated && totalChars + rows[i].value.length < maxChars) {
      selected.push(rows[i]);
      totalChars += rows[i].value.length;
    }
  }
  if (msg.length > 5) {
    try {
      var fuzzyRows = await query(
        "SELECT key, content as value, updated_at, similarity(content, $2) as sim FROM agent_memory WHERE agent_id = $1 AND similarity(content, $2) > 0.05 ORDER BY sim DESC LIMIT 10",
        [agentId, userMessage.substring(0, 200)]
      );
      for (var fi = 0; fi < fuzzyRows.length; fi++) {
        if (selected.indexOf(fuzzyRows[fi]) !== -1) continue;
        if (totalChars >= maxChars) break;
        var alreadyIn = false;
        for (var si = 0; si < selected.length; si++) {
          if (selected[si].key === fuzzyRows[fi].key) { alreadyIn = true; break; }
        }
        if (!alreadyIn && totalChars + fuzzyRows[fi].value.length < maxChars) {
          selected.push(fuzzyRows[fi]);
          totalChars += fuzzyRows[fi].value.length;
        }
      }
    } catch(fzErr) {}
  }
  var words = msg.split(/\s+/).filter(function(w) { return w.length > 3; });
  for (var i = 0; i < rows.length; i++) {
    if (selected.indexOf(rows[i]) !== -1) continue;
    if (totalChars >= maxChars) break;
    var keyLow = (rows[i].key + " " + rows[i].value.substring(0, 200)).toLowerCase();
    var match = false;
    for (var w = 0; w < words.length; w++) {
      if (keyLow.indexOf(words[w]) !== -1) { match = true; break; }
    }
    if (match && totalChars + rows[i].value.length < maxChars) {
      selected.push(rows[i]);
      totalChars += rows[i].value.length;
    }
  }
  for (var i = 0; i < rows.length; i++) {
    if (selected.indexOf(rows[i]) !== -1) continue;
    if (totalChars >= maxChars) break;
    if (totalChars + rows[i].value.length < maxChars) {
      selected.push(rows[i]);
      totalChars += rows[i].value.length;
    }
  }
  if (!selected.length) return "";
  return "\n\nDein Gedaechtnis (" + selected.length + "/" + rows.length + " Erinnerungen geladen):\n" + selected.map(function(r) { return r.key + ": " + r.value; }).join("\n");
}

async function saveAgentMemory(agentId, key, value, tags, category) {
  var tagArr = tags || [];
  var cat = category || 'general';
  if (typeof tagArr === 'string') tagArr = tagArr.split(',').map(function(t){return t.trim();});
  await query(
    "INSERT INTO agent_memory (agent_id, key, content, tags, category, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, tags = $4, category = $5, updated_at = NOW()",
    [agentId, key, value, tagArr, cat]
  );
}

async function searchAgentMemory(agentId, searchQuery, limit) {
  limit = limit || 5;
  var rows = await query(
    "SELECT key, content as value, tags, category, similarity(content, $2) as relevance FROM agent_memory WHERE agent_id = $1 AND (similarity(content, $2) > 0.05 OR content ILIKE $3) ORDER BY relevance DESC NULLS LAST LIMIT $4",
    [agentId, searchQuery.substring(0, 200), '%' + searchQuery.substring(0, 50) + '%', limit]
  );
  return rows;
}

async function searchMemoryByTag(agentId, tag) {
  var rows = await query(
    "SELECT key, content as value, tags, category FROM agent_memory WHERE agent_id = $1 AND $2 = ANY(tags) ORDER BY updated_at DESC",
    [agentId, tag]
  );
  return rows;
}
// Wire circular dependencies (after all functions defined)perf.setDeps({ sendAgentMessage: sendAgentMessage, saveAgentMemory: saveAgentMemory, routeTask: routeTask, callLLM: callLLM });visualQA.setDeps({ saveAgentMemory: saveAgentMemory, sendAgentMessage: sendAgentMessage, callLLM: callLLM });dream.setDeps({ callLLM: callLLM, saveAgentMemory: saveAgentMemory });

// === CREWAI PATTERNS: Sequential Pipeline + Delegation ===

async function runPipeline(tasks, companyId) {
  // Sequential pipeline: each task output becomes context for the next
  var context = "";
  var results = [];
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var agentId = task.agentId;
    if (!agentId && task.department) {
      // Dynamic routing by department (CrewAI hierarchical pattern)
      var routed = await routeTask(task.description, companyId);
      agentId = routed ? routed.agentId : null;
    }
    if (!agentId) { results.push({ step: i, error: "No agent found" }); continue; }

    // Inject previous step context
    var fullTask = task.description;
    if (context) fullTask = "KONTEXT AUS VORHERIGEM SCHRITT:\n" + context + "\n\nDEINE AUFGABE:\n" + task.description;

    await query("INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW())", [agentId, fullTask, task.parentTaskId || null]);
    console.log("[pipeline] Step " + i + " -> Agent " + agentId + ": " + task.description.substring(0, 80));

    // Wait for completion (poll)
    var maxWait = task.timeoutMs || 300000;
    var start = Date.now();
    var result = null;
    while (Date.now() - start < maxWait) {
      var row = await queryOne("SELECT status, result FROM agent_tasks WHERE agent_id = $1 AND task = $2 ORDER BY id DESC LIMIT 1", [agentId, fullTask]);
      if (row && (row.status === 'completed' || row.status === 'completed_no_code' || row.status === 'error')) {
        result = row;
        break;
      }
      await new Promise(function(r) { setTimeout(r, 10000); });
    }

    if (result) {
      context = (result.result || "").substring(0, 3000);
      results.push({ step: i, agentId: agentId, status: result.status, output: context.substring(0, 500) });
    } else {
      results.push({ step: i, agentId: agentId, status: "timeout" });
      break;
    }
  }
  return results;
}

async function delegateTask(fromAgentId, toAgentId, task, reason) {
  // CrewAI-style delegation: one agent delegates to another
  await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES ($1, $2, 'pending', NOW())", [toAgentId, task]);
  await sendAgentMessage(fromAgentId, toAgentId, "Delegation", "Ich delegiere dir: " + task + (reason ? "\nGrund: " + reason : ""), "high");
  console.log("[delegate] Agent " + fromAgentId + " -> Agent " + toAgentId + ": " + task.substring(0, 80));
  return { delegated: true, toAgentId: toAgentId };
}

// === HEARTBEAT (core orchestration) ===
async function heartbeat(agentId) {
  var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent || agent.status === "idle") {
    stopAgent(agentId);
    return;
  }

  var pendingTask = await queryOne(
    "SELECT * FROM agent_tasks WHERE agent_id = $1 AND status IN ('pending', 'in_progress') ORDER BY created_at ASC LIMIT 1",
    [agentId]
  );

  var status = "active";
  var tokens = 0, cost = 0;

  // === OPERATOR AUTO-DISPATCH: If operator has no tasks, assign to idle agents ===
  if (!pendingTask && agent.company_id) {
    try {
      var isOperator = await queryOne("SELECT id FROM blun_agents WHERE company_id = $1 ORDER BY id LIMIT 1", [agent.company_id]);
      if (isOperator && isOperator.id === agentId) {
        var idleAgents = await query(
          "SELECT a.id, a.name, a.role FROM blun_agents a WHERE a.company_id = $1 AND a.id != $2 AND a.status = 'active' AND NOT EXISTS (SELECT 1 FROM agent_tasks t WHERE t.agent_id = a.id AND t.status IN ('pending','in_progress','processing')) LIMIT 5",
          [agent.company_id, agentId]
        );
        if (idleAgents.length > 0) {
          var agentList = idleAgents.map(function(a) { return a.name + " (ID " + a.id + ", " + (a.role||"no role") + ")"; }).join(", ");
          var dispatchPrompt = "Agents brauchen CODE-Tasks: " + agentList + "." + "\nJeder Task MUSS einen Dateipfad (.js/.css/.html) enthalten!" + "\nBEISPIELE:" + "\n[TOOL:ASSIGN_TASK:5:Erstelle dashboard/components/notifications.js — Toast-Notification System mit show/hide/auto-dismiss]" + "\n[TOOL:ASSIGN_TASK:8:Fix src/routes/v1/auth.js Zeile 42 — bcrypt.compare fehlt bei Login-Validierung]" + "\n[TOOL:ASSIGN_TASK:12:Baue dashboard/css/dark-theme.css — CSS Custom Properties fuer Dark Mode]" + "\nVERBOTEN: Analyse, Report, Konzept, Planung, Recherche, Dokumentation" + "\nGESCHUETZT (NIEMALS Tasks dafuer erstellen): agent-engine.js, code-tools.js, server.js, .env, package.json, index.html, dieter-daemon.js, auth.js, db.js. NUR Tasks fuer NEUE Dateien vergeben! DESIGN: Keine Emojis, kein Blau, Windows Dark Theme Grau (#1e1e1e/#2d2d2d/#3c3c3c), keine Dummy-Daten!" + "\nStruktur: src/routes/ (API), dashboard/ (Frontend+Components), src/middleware/, public/" + "\nNUR [TOOL:ASSIGN_TASK:id:task] Zeilen!";
          var identityRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'identity'", [agentId]);
          var sysPrompt = (identityRow ? identityRow.content : "Du bist der Operator.") + "\nDu verteilst autonom Tasks an dein Team.";
          var dispatchResult = await callLLM(agent.model || "claude-sonnet", [{ role: "system", content: sysPrompt }, { role: "user", content: dispatchPrompt }], agentId);
          if (dispatchResult && dispatchResult.content) {
            var dLines = dispatchResult.content.split("\n");
            for (var di = 0; di < dLines.length; di++) {
              var dm = dLines[di].match(/\[TOOL:ASSIGN_TASK:(\d+):([^\]]+)\]/i);
              if (dm) {
                var taskDesc = dm[2].trim();
                var tdl = taskDesc.toLowerCase();
                // Quality Gate: MUST have file path AND code verb, checked BEFORE insert
                var hasFile = /\.(js|css|html|json|ts|jsx|tsx)/.test(tdl) || tdl.indexOf("src/") !== -1 || tdl.indexOf("dashboard/") !== -1 || tdl.indexOf("routes/") !== -1 || tdl.indexOf("components/") !== -1;
                var hasVerb = tdl.indexOf("erstell") !== -1 || tdl.indexOf("bau") !== -1 || tdl.indexOf("fix") !== -1 || tdl.indexOf("implement") !== -1 || tdl.indexOf("refactor") !== -1 || tdl.indexOf("schreib") !== -1 || tdl.indexOf("add") !== -1 || tdl.indexOf("code") !== -1 || tdl.indexOf("optimier") !== -1;
                var banned = tdl.indexOf("analys") !== -1 || tdl.indexOf("report") !== -1 || tdl.indexOf("pipeline") !== -1 || tdl.indexOf("strategi") !== -1 || tdl.indexOf("konzept") !== -1 || tdl.indexOf("recherch") !== -1 || tdl.indexOf("dokumentation") !== -1 || tdl.indexOf("bewert") !== -1 || tdl.indexOf("zusammenfass") !== -1;
                if (!hasFile || !hasVerb || banned) {
                  console.log("[operator] REJECTED (need file+verb, no analysis): " + taskDesc.substring(0,80));
                  continue;
                }
                await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES ($1, $2, 'pending', NOW())", [parseInt(dm[1]), taskDesc]);
                console.log("[operator] ACCEPTED task for agent " + dm[1] + ": " + taskDesc.substring(0,80));
              }
            }
            tokens = (dispatchResult.usage && dispatchResult.usage.output_tokens) || 0;
            cost = tokens * 0.000003;
          }
        }
      }
    } catch(dispatchErr) { console.error("[operator] Auto-dispatch error:", dispatchErr.message); }

    // === OPERATOR WORKTREE MONITOR: Check if agents are producing code ===
    try {
      var cp6 = require("child_process");
      var fs3 = require("fs");
      var wtDir = "/root/blun-worktrees/";
      if (fs3.existsSync(wtDir)) {
        var worktrees = fs3.readdirSync(wtDir).filter(function(d) { return fs3.statSync(wtDir + d).isDirectory(); });
        for (var wi = 0; wi < worktrees.length; wi++) {
          var wtPath = wtDir + worktrees[wi];
          var wtDiff = await new Promise(function(res){ cp6.exec("cd " + wtPath + " && git diff --stat HEAD 2>/dev/null && git diff --cached --stat 2>/dev/null", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
          var wtLog = await new Promise(function(res){ cp6.exec("cd " + wtPath + " && git log main..HEAD --oneline 2>/dev/null", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
          if (wtDiff || wtLog) {
            console.log("[operator-monitor] " + worktrees[wi] + " hat Aenderungen: " + (wtLog || wtDiff).substring(0,150));
          } else {
            console.log("[operator-monitor] " + worktrees[wi] + " — keine Code-Aenderungen");
          }
        }
      }
    } catch(wtErr) { console.error("[operator-monitor] Worktree check error:", wtErr.message); }

    // === OPERATOR MERGE: Merge agent branches into main ===
    try {
      var cp5 = require("child_process");
      var branches = await new Promise(function(res){ cp5.exec("cd /root/blun && git branch --list 'agent/*'", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
      if (branches) {
        var brList = branches.split("\n").map(function(b){ return b.trim().replace("* ",""); }).filter(function(b){ return b.length > 0; });
        for (var bi = 0; bi < brList.length; bi++) {
          var br = brList[bi];
          // Check if branch has commits ahead of main
          var ahead = await new Promise(function(res){ cp5.exec("cd /root/blun && git log main.." + br + " --oneline", {timeout:5000}, function(e,o){ res((o||"").trim()); }); });
          if (ahead) {
            console.log("[operator] QA review + merge for " + br + ": " + ahead.substring(0,100));
            var brWorktree = "/root/blun-worktrees/" + br.replace(/\//g, "-");
            var brDiff = await new Promise(function(res){ cp5.exec("cd /root/blun && git diff main..." + br, {timeout:10000,maxBuffer:500000}, function(e,o,er){ res((o||"").substring(0,5000)); }); });
            var qaCwd = require("fs").existsSync(brWorktree) ? brWorktree : "/root/blun";
            var qaPrompt = "Du bist Helmut, QA-Lead. Pruefe diesen Code-Diff vom Branch " + br + ":" + "\n\n" + brDiff + "\n\n" + "CHECKLISTE (ALLE Punkte pruefen!):" + "\n1. SYNTAX: Fuehre node -c auf alle geaenderten .js Dateien aus" + "\n2. SICHERHEIT: Keine XSS, SQL-Injection, fehlende Auth-Checks" + "\n3. INTEGRATION: Sind neue CSS/JS Dateien in dashboard/index.html eingebunden? Neue .css braucht <link>, neue .js in components/ braucht <script>. Wenn nicht: QA:FAIL — Dieter muss das einbinden!" + "\n4. REFERENZEN: Werden neue Funktionen/Variablen auch aufgerufen? Tote Imports?" + "\n5. VERBOTENE DATEIEN: agent-engine.js, code-tools.js, server.js, .env, package.json, index.html, dieter-daemon.js, auth.js, db.js — wenn geaendert: QA:FAIL" + "\n6. FUNKTIONSTEST: Stelle sicher dass die Aenderung sichtbar/nutzbar ist (nicht nur Backend ohne Frontend)" + "\nWenn du Probleme findest: NUR in Agent-eigenen Dateien fixen. Geschuetzte Dateien NICHT anfassen — QA:FAIL melden. Antworte am Ende mit QA:PASS oder QA:FAIL + Begruendung.";
            var qaArgs = ["--print", "-", "--output-format", "text", "--max-turns", "15", "--model", "claude-sonnet-4-20250514"];
            var qaResult = await new Promise(function(resolve) {
              var child = cp5.spawn("claude", qaArgs, { cwd: qaCwd, timeout: 120000, env: Object.assign({}, process.env, { DISABLE_INTERACTIVITY: "1" }) });
              var out = "";
              child.stdin.write(qaPrompt);
              child.stdin.end();
              child.stdout.on("data", function(d) { if (out.length < 500000) out += d.toString(); });
              child.stderr.on("data", function(d) { if (out.length < 500000) out += d.toString(); });
              child.on("close", function(code) { resolve({ output: out, code: code }); });
              child.on("error", function(err) { resolve({ output: "", code: -1 }); });
              setTimeout(function() { try { child.kill("SIGTERM"); } catch(e){} }, 120000);
            });
            var qaOutput = qaResult.output || "";
            var qaPassed = qaOutput.indexOf("QA:PASS") !== -1 || qaOutput.indexOf("PASS") !== -1;
            console.log("[operator] QA result for " + br + ": " + (qaPassed ? "PASS" : "FAIL") + " (" + qaOutput.length + " chars)");
            if (require("fs").existsSync(brWorktree)) {
              await new Promise(function(res){ cp5.exec("cd " + brWorktree + " && git add -A && git diff --cached --quiet || git commit -m 'QA fixes by Helmut'", {timeout:10000}, function(e,o,er){ res(true); }); });
            }
            if (qaPassed) {
              // NO AUTO-MERGE: Only Dieter Junior approves merges
              console.log("[operator] QA PASSED for " + br + " — awaiting Dieter Junior approval to merge. NO auto-merge.");
              await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES ((SELECT id FROM agents WHERE LOWER(name) = 'dieter junior' LIMIT 1), $1, 'pending', NOW())", ["MERGE APPROVAL: Branch " + br + " hat QA bestanden (Helmut: PASS). Pruefe den Diff und entscheide: MERGE oder REJECT. Branch: " + br]);
            } else {
              console.log("[operator] Branch " + br + " NOT merged - QA failed. Keeping worktree for rework.");
            }
          }
        }
      }
    } catch(mergeErr) { console.error("[operator] Merge error:", mergeErr.message); }

    // === AUTO-INTEGRATE: Detect new components and add to index.html ===
    try {
      var fs4 = require("fs");
      var cp7 = require("child_process");
      var indexPath = "/root/blun/dashboard/index.html";
      var compDir = "/root/blun/dashboard/components/";
      if (false && fs4.existsSync(indexPath) && fs4.existsSync(compDir)) { // DISABLED: No auto-integrate into index.html
        var indexHtml = fs4.readFileSync(indexPath, "utf8");
        var compFiles = fs4.readdirSync(compDir).filter(function(f) { return f.endsWith(".js"); });
        var added = [];
        for (var ci = 0; ci < compFiles.length; ci++) {
          var scriptTag = 'components/' + compFiles[ci];
          if (indexHtml.indexOf(scriptTag) === -1) {
            // Insert before closing </body> tag
            var insertPoint = indexHtml.lastIndexOf("</body>");
            if (insertPoint !== -1) {
              var newTag = '  <script src="components/' + compFiles[ci] + '"></script>\n';
              indexHtml = indexHtml.substring(0, insertPoint) + newTag + indexHtml.substring(insertPoint);
              added.push(compFiles[ci]);
            }
          }
        }
        if (added.length > 0) {
          fs4.writeFileSync(indexPath, indexHtml);
          console.log("[auto-integrate] Added " + added.length + " new components to index.html: " + added.join(", "));
          await new Promise(function(res){ cp7.exec("cd /root/blun && BLUN_DEPLOYER=dieter git add dashboard/index.html && BLUN_DEPLOYER=dieter git commit -m 'Auto-integrate: " + added.join(", ") + "'", {timeout:10000}, function(e,o,er){ res(true); }); });
        }
      }
    } catch(intErr) { console.error("[auto-integrate] Error:", intErr.message); }

    // === AUTO-DEPLOY: Schedule-based deploy system ===
    try {
      // Deploy schedule from settings (default: 7:00, 10:00, 13:00, 16:00, 19:00)
      var deploySettingsRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'deploy_schedule'", [agentId]);
      var deploySchedule = deploySettingsRow ? JSON.parse(deploySettingsRow.content) : { hours: [7, 10, 13, 16, 19], windowMinutes: 15 };
      var now = new Date();
      var currentHour = now.getHours();
      var currentMin = now.getMinutes();
      var lastDeploy = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'last_auto_deploy'", [agentId]);
      var lastDeployTime = lastDeploy ? new Date(lastDeploy.content) : new Date(0);

      // Check if we're in a deploy window
      var inDeployWindow = false;
      for (var dh = 0; dh < deploySchedule.hours.length; dh++) {
        if (currentHour === deploySchedule.hours[dh] && currentMin < (deploySchedule.windowMinutes || 15)) {
          inDeployWindow = true;
          break;
        }
      }
      // Also allow deploy if 30min since last and enough work done
      var minutesSinceDeploy = (Date.now() - lastDeployTime.getTime()) / 60000;
      var recentCompleted = await queryOne("SELECT count(*) as c FROM agent_tasks WHERE agent_id IN (SELECT id FROM blun_agents WHERE company_id = $1) AND status = 'completed' AND completed_at > NOW() - interval '60 min'", [agent.company_id]);
      var enoughWork = recentCompleted && parseInt(recentCompleted.c) >= 3;

      if ((inDeployWindow || (enoughWork && minutesSinceDeploy > 60)) && minutesSinceDeploy > 15) {
        console.log("[operator] Deploy check: window=" + inDeployWindow + " enough=" + enoughWork + " lastDeploy=" + Math.round(minutesSinceDeploy) + "min ago");
        var cp2 = require("child_process");
        // Check for real code changes first
        var diffCheck = await new Promise(function(res){ cp2.exec("cd /root/blun && git diff --name-only HEAD", {timeout:5000}, function(e,o,er){ res((o||"").trim()); }); });
        var codeFiles = diffCheck.split("\n").filter(function(f){ return f.match(/\.(js|html|css|json)$/) && !f.startsWith("test-"); });
        if (codeFiles.length === 0) {
          console.log("[operator] No real code changes, skipping deploy. Only: " + diffCheck.substring(0,200));
          await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, "last_auto_deploy", new Date().toISOString()]);
        } else {
          console.log("[operator] Real code changes: " + codeFiles.join(", ").substring(0,200));
          var check = await new Promise(function(res){ cp2.exec("node -c /root/blun/server.js && node -c /root/blun/src/agent-engine.js && node -c /root/blun/src/code-tools.js", {timeout:10000}, function(e,o,er){ res({err:e,out:(o||"")+(er||"")}); }); });
          if (!check.err) {
            var gitConn = await queryOne("SELECT config FROM user_connections WHERE type = 'git' AND company_id = $1 ORDER BY id LIMIT 1", [agent.company_id]);
            var sshKey = "/root/.ssh/id_ed25519_github_pro";
            var gitUrl = "blun-pro";
            if (gitConn && gitConn.config) {
              var cfg = typeof gitConn.config === "string" ? JSON.parse(gitConn.config) : gitConn.config;
              if (cfg.ssh_key) sshKey = cfg.ssh_key;
              if (cfg.url) gitUrl = cfg.url;
            }
            var pushCmd = 'BLUN_DEPLOYER=dieter git add -A && BLUN_DEPLOYER=dieter git commit -m "Auto-deploy: ' + recentCompleted.c + ' tasks completed" && GIT_SSH_COMMAND="ssh -i ' + sshKey + ' -o StrictHostKeyChecking=no" git push ' + gitUrl + ' main 2>&1';
            var pushOut = await new Promise(function(res){ cp2.exec(pushCmd, {cwd:"/root/blun",timeout:60000,maxBuffer:500000}, function(e,o,er){ res((o||"")+(er||"")); }); });
            console.log("[operator] Auto-push: " + pushOut.substring(0,200));
            var restart = await new Promise(function(res){ cp2.exec("pm2 restart blun", {timeout:15000}, function(e,o,er){ res((o||"")+(er||"")); }); });
            console.log("[operator] Auto-deploy done: " + restart.substring(0,100));
            await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, "last_auto_deploy", new Date().toISOString()]);
          } else {
            console.error("[operator] Auto-deploy blocked — syntax error: " + check.out.substring(0,200));
          }
        }
      }
    } catch(deployErr) { console.error("[operator] Auto-deploy error:", deployErr.message); }
  }

  if (pendingTask) {
    status = "working";
    await query("UPDATE blun_agents SET status = $1, last_heartbeat = NOW() WHERE id = $2", ["working", agentId]);
    await query("UPDATE agent_tasks SET status = $1 WHERE id = $2", ["processing", pendingTask.id]);

    try {
      // Load identity
      var identityRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'IDENTITY'", [agentId]);
      if (!identityRow) {
        var identityContent = "# " + (agent.name || "Agent") + "\n" +
          "- Rolle: " + (agent.role || "KI-Agent") + "\n" +
          (agent.department ? "- Abteilung: " + agent.department + "\n" : "") +
          "- Team: BLUN.ai Agent-Team\n" +
          "- Sprache: Deutsch\n" +
          "Ich bin " + (agent.name || "ein Agent") + " und Teil des BLUN Agent-Teams.";
        await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, 'IDENTITY', $2) ON CONFLICT (agent_id, key) DO NOTHING", [agentId, identityContent]);
        identityRow = { content: identityContent };
      }
      // Load skills
      var agentSkills = await query(
        "SELECT s.name, s.code, s.description FROM skills s JOIN agent_skills as2 ON as2.skill_id = s.id WHERE as2.agent_id = $1 AND s.safe = true",
        [agentId]
      );
      var nl = String.fromCharCode(10);
      var skillStr = "";
      if (agentSkills.length) {
        skillStr = nl+nl+"=== DEINE SKILLS (AKTIV NUTZEN!) ==="+nl;
        skillStr += "Du MUSST die folgenden Skills bei jeder Aufgabe aktiv anwenden. Sie enthalten Regeln, Frameworks und Methoden die deine Arbeit leiten."+nl+nl;
        for (var si = 0; si < agentSkills.length; si++) {
          var sk = agentSkills[si];
          var content = (sk.code || sk.description || "").substring(0, 3000);
          skillStr += "### SKILL: " + sk.name + nl + content + nl + nl;
        }
      }
      // Load memory
      var memBudget = (agent.model && (agent.model.startsWith("local:") || agent.model.includes("gemma") || agent.model.includes("llama"))) ? 500 : 8000;
      var memStr = await loadSmartMemory(agentId, pendingTask.task, memBudget);
      var msgStr = await getUnreadSummary(agentId);
      if (msgStr) memStr += msgStr;
      // Load auto_memory (decisions/blockers from previous tasks)
      try {
        var autoMemRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'auto_memory'", [agentId]);
        if (autoMemRow && autoMemRow.content) {
          var am = JSON.parse(autoMemRow.content);
          var amStr = '';
          if (am.decisions && am.decisions.length) amStr += '\nFruehere Entscheidungen: ' + am.decisions.join('; ');
          if (am.blockers && am.blockers.length) amStr += '\nBekannte Blocker: ' + am.blockers.join('; ');
          if (am.context && am.context.length) amStr += '\nKontext: ' + am.context.join('; ');
          if (am.last_task) amStr += '\nLetzter Task: ' + am.last_task;
          if (amStr) memStr += '\n\n=== AUTO-MEMORY ===\n' + amStr;
        }
      } catch(amLoad) { /* silent */ }

      // === PAPERCLIP-STYLE CLI EXECUTION ===
      var sysContext = (identityRow ? identityRow.content + "\n\n" : "") + (agent.system_prompt || "Du bist ein hilfreicher Agent.") + skillStr + "\n\nKONTEXT AUS MEMORY:\n" + memStr;
      var taskPrompt = sysContext + "\n\nTask: " + pendingTask.task + "\n\nWICHTIG: Schreibe SOFORT Code in die genannte Datei. KEIN Analysieren, kein Erklaeren, kein Planen. Erster Schritt = Write Tool benutzen. Du hast Zugriff auf Read, Write, Edit, Bash. Benutze sie JETZT." + "\nVERBOTENE DATEIEN (NIEMALS aendern, NIEMALS lesen, NIEMALS oeffnen): agent-engine.js, code-tools.js, server.js, .env, package.json, package-lock.json, index.html, login.html, dieter-daemon.js, auth.js, db.js. DU DARFST NUR NEUE DATEIEN ERSTELLEN. Bestehende Dateien NICHT modifizieren! Erstelle immer neue .js/.css Dateien in dashboard/components/, dashboard/css/, src/routes/v1/, src/middleware/." + "\nDEIN ARBEITSVERZEICHNIS: " + worktreePath + " -- Alle Dateien MUESSEN hier geschrieben werden. NIEMALS in /tmp oder andere Verzeichnisse schreiben! Nutze IMMER relative Pfade." + "\nDESIGN-REGELN (PFLICHT): Keine Emojis. Kein Blau (#3b82f6). Farbschema: Windows Dark Theme Grau — #1e1e1e (bg), #2d2d2d (cards), #3c3c3c (hover), #cccccc (text), #ffffff (headings). Akzent: #0078d4 NUR fuer Links/Buttons. Keine Dummy-Daten — nur echte API-Calls. Keine selbst-rendernden Components (kein document.body.appendChild). Clean, minimalistisch, professionell.";

      // === ISOLATED WORKSPACE (Paperclip-style): Agent gets empty dir, only produces new files ===
      var cp2 = require("child_process");
      var fs2 = require("fs");
      var pathMod = require("path");
      var branchName = "agent/" + (agent.name || "agent-" + agentId).toLowerCase().replace(/[^a-z0-9]/g, "-");
      var worktreePath = "/root/blun-worktrees/" + branchName.replace(/\//g, "-");
      var workspacePath = "/root/blun-workspaces/" + branchName.replace(/\//g, "-");
      // Ensure worktree exists for committing later
      try {
        if (!fs2.existsSync("/root/blun-worktrees")) fs2.mkdirSync("/root/blun-worktrees", {recursive:true});
        if (!fs2.existsSync(worktreePath)) {
          var branchExists = await new Promise(function(res){ cp2.exec("cd /root/blun && git branch --list " + branchName, {timeout:5000}, function(e,o){ res((o||"").trim().length > 0); }); });
          if (!branchExists) {
            await new Promise(function(res){ cp2.exec("cd /root/blun && git branch " + branchName + " main", {timeout:5000}, function(e,o,er){ res(true); }); });
          }
          await new Promise(function(res){ cp2.exec("cd /root/blun && git worktree add " + worktreePath + " " + branchName, {timeout:10000}, function(e,o,er){ res(true); }); });
        }
      } catch(brErr) { console.error("[agent-cli] Worktree error:", brErr.message); }
      // Fresh isolated workspace — agent can ONLY create new files here
      try {
        if (fs2.existsSync(workspacePath)) cp2.execSync("rm -rf " + workspacePath, {timeout:5000});
        fs2.mkdirSync(workspacePath, {recursive:true});
        // Copy ONLY task-relevant files (read-only context)
        var taskFiles = [];
        var pathPatterns = (pendingTask.task || "").match(/(?:dashboard|src|shared|electron|blun-mobile)\/[a-zA-Z0-9_.\/-]+/g) || [];
        for (var pp = 0; pp < pathPatterns.length; pp++) {
          var srcFile = "/root/blun/" + pathPatterns[pp];
          if (fs2.existsSync(srcFile)) taskFiles.push(pathPatterns[pp]);
        }
        for (var tf = 0; tf < taskFiles.length; tf++) {
          var destDir = pathMod.dirname(workspacePath + "/" + taskFiles[tf]);
          fs2.mkdirSync(destDir, {recursive:true});
          fs2.copyFileSync("/root/blun/" + taskFiles[tf], workspacePath + "/" + taskFiles[tf]);
        }
        fs2.writeFileSync(workspacePath + "/WORKSPACE.md", "# Agent Workspace\nIsolierter Workspace. Schreibe neue Dateien hier.\nHauptprojekt: /root/blun (NUR LESEN!)\nNur Dateien in diesem Verzeichnis werden uebernommen.\n");
        console.log("[agent-cli] Isolated workspace: " + workspacePath + " (" + taskFiles.length + " files copied)");
      } catch(wsErr) { console.error("[agent-cli] Workspace error:", wsErr.message); workspacePath = worktreePath; }

      // Check for existing session to resume (Paperclip-style)
      var sessionRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'cli_session_id'", [agentId]);
      var sessionId = sessionRow ? sessionRow.content.trim() : null;

      // Determine CLI: claude or codex based on agent model
      var cliCmd = "claude";
      var cliModel = "claude-sonnet-4-20250514";
      if (agent.model && (agent.model.includes("codex") || agent.model.includes("gpt"))) {
        cliCmd = "codex";
        cliModel = "";
      }

      // Build args (from Paperclip adapter-claude-local)
      var cp2 = require("child_process");
      var cliArgs;
      if (cliCmd === "codex") {
        cliArgs = ["exec", "--skip-git-repo-check", "--full-auto"];
        if (cliModel) cliArgs.push("--model", cliModel);
      } else {
        cliArgs = ["--print", "-", "--output-format", "stream-json", "--verbose", "--max-turns", "15"];
        if (cliModel) cliArgs.push("--model", cliModel);
      }

      if (cliCmd === "codex") cliArgs.push(taskPrompt.substring(0,2000));
      await acquireCliSlot(agent.name);
      var cliResult = await new Promise(function(resolve) {
        var child = cp2.spawn(cliCmd, cliArgs, {
          cwd: worktreePath,
          timeout: 180000,
          env: Object.assign({}, process.env, { DISABLE_INTERACTIVITY: "1" })
        });
        var stdout = "", stderr = "";
        if (cliCmd !== "codex") child.stdin.write(taskPrompt);
        child.stdin.end();
        child.stdout.on("data", function(d) { if (stdout.length < 2000000) stdout += d.toString(); });
        child.stderr.on("data", function(d) { if (stderr.length < 500000) stderr += d.toString(); });
        child.on("close", function(code) { resolve({ stdout: stdout, stderr: stderr, code: code }); });
        child.on("error", function(err) { resolve({ stdout: stdout, stderr: stderr, code: -1, err: err }); });
        setTimeout(function() { try { child.kill("SIGTERM"); } catch(e){} }, 180000);
      });

      // Parse session ID from stream-json for resume next time
      var newSessionId = null;
      try {
        var sjLines = (cliResult.stdout || "").split("\n");
        for (var si = sjLines.length - 1; si >= 0; si--) {
          if (sjLines[si].indexOf("session_id") !== -1) {
            var sjObj = JSON.parse(sjLines[si]);
            if (sjObj.session_id) { newSessionId = sjObj.session_id; break; }
          }
        }
      } catch(parseErr) {}
      if (newSessionId) {
        await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()", [agentId, "cli_session_id", newSessionId]);
      }

      // Extract text from stream-json events
      var finalContent = "";
      try {
        var sjLines2 = (cliResult.stdout || "").split("\n");
        for (var si2 = 0; si2 < sjLines2.length; si2++) {
          try {
            var ev = JSON.parse(sjLines2[si2]);
            if (ev.type === "assistant" && ev.message && ev.message.content) {
              for (var pi = 0; pi < ev.message.content.length; pi++) {
                if (ev.message.content[pi].type === "text") finalContent += ev.message.content[pi].text + "\n";
              }
            }
            if (ev.result) finalContent += ev.result;
          } catch(e2) {}
        }
      } catch(e3) {}
      if (!finalContent) finalContent = (cliResult.stdout || "").substring(0, 5000);
      if (!finalContent) finalContent = "CLI returned no output";

      releaseCliSlot(agent.name);
      // Detect ratelimit from CLI output
      if ((cliResult.stderr || "").indexOf("rate") !== -1 || (cliResult.stderr || "").indexOf("429") !== -1 || (cliResult.stderr || "").indexOf("overloaded") !== -1) {
        pauseCli(120);
        console.log("[ratelimit] CLI hit rate limit for " + agent.name);
      }
      tokens = 0; cost = 0;
      console.log("[agent-cli] " + agent.name + " exit=" + cliResult.code + " session=" + (newSessionId||"none") + " output=" + finalContent.length + "ch");

      // Paperclip model: detect changes via git status in worktree, then commit
      try {
        
// === AUTO-QA: Reject bad code before commit ===
function autoQaReject(filePath, worktreePath) {
  try {
    var fs = require("fs");
    var fullPath = worktreePath + "/" + filePath;
    if (!fs.existsSync(fullPath)) return [];
    var content = fs.readFileSync(fullPath, "utf8");
    var issues = [];
    var emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    if (emojiRegex.test(content)) issues.push("EMOJI");
    if (content.includes("#3b82f6") || content.includes("blue-500") || content.includes("blue-600")) issues.push("BLUE");
    if (content.includes("Agent-X") || content.includes("Example Agent") || content.includes("Demo Agent")) issues.push("DUMMY");
    if (content.includes("document.body.appendChild") || content.includes("document.body.innerHTML")) issues.push("SELF-RENDER");
    return issues;
  } catch(e) { return []; }
}

        var _protected = ["agent-engine.js","code-tools.js","server.js",".env","package.json","package-lock.json","index.html","login.html","dieter-daemon.js","auth.js","db.js","blun.db"];
        var statusOut = await new Promise(function(res){ cp2.exec("cd " + worktreePath + " && git status --porcelain", {timeout:10000}, function(e,o){ res((o||"").trim()); }); });
        var changedFiles = statusOut.split("\n").filter(function(l){ return l.trim().length > 0; }).map(function(l){ return l.trim().substring(3); });
        var safeFiles = changedFiles.filter(function(f){ var bn = f.split("/").pop(); return _protected.indexOf(bn) === -1; });
        var blocked = changedFiles.length - safeFiles.length;
        if (blocked > 0) console.log("[agent-cli] BLOCKED " + blocked + " protected files");
        // Auto-QA: reject files with emojis, blue, dummy data
        var qaClean = safeFiles.filter(function(f) {
          var issues = autoQaReject(f, worktreePath);
          if (issues.length > 0) { console.log("[auto-qa] REJECTED " + f + ": " + issues.join(", ")); return false; }
          return true;
        });
        if (qaClean.length < safeFiles.length) console.log("[auto-qa] " + (safeFiles.length - qaClean.length) + " files rejected by QA gate");
        safeFiles = qaClean;
        var hasChanges = safeFiles.length > 0;
        if (hasChanges) {
          var commitMsg = agent.name + ": " + pendingTask.task.substring(0,60);
          var _gitAddList = safeFiles.map(function(f){ return '"' + f.replace(/"/g, '') + '"'; }).join(' ');
          await new Promise(function(res){ cp2.exec('cd ' + worktreePath + ' && git add -- ' + _gitAddList + ' && git commit -m "' + commitMsg.replace(/"/g, '\"') + '"', {timeout:10000}, function(e,o,er){ res(true); }); });
          console.log("[agent-cli] Committed in worktree " + worktreePath);
          // Push QA task to Helmut (ID 29)
          try {
            await query("INSERT INTO agent_tasks (agent_id, task, status, created_at) VALUES (29, $1, 'pending', NOW())", ["QA REVIEW: Branch " + branchName + " von " + agent.name + " hat neue Commits. Pruefe den Code in " + worktreePath + " mit git diff main.." + branchName + ". Bei QA:PASS melde an Operator zum Mergen. Bei QA:FAIL beschreibe die Probleme."]);
            console.log("[agent-cli] QA task created for Helmut: " + branchName);
          } catch(qaErr) { console.error("[agent-cli] QA task creation error:", qaErr.message); }
        }
      } catch(gitErr) { console.error("[agent-cli] Git commit error:", gitErr.message); }
      // Quality check: only mark completed if agent ACTUALLY committed in this run
      if (hasChanges) {
        await query("UPDATE agent_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3", ["completed", finalContent, pendingTask.id]);
        console.log("[agent-cli] " + agent.name + " PRODUCED CODE in worktree " + worktreePath);
        try { await autoScoreTask(pendingTask.id, true, null); await awardXP(agentId, 10, 'task_completed'); } catch(se) {}
      } else {
        await query("UPDATE agent_tasks SET status = $1, result = $2, completed_at = NOW() WHERE id = $3", ["completed_no_code", finalContent, pendingTask.id]);
        console.log("[agent-cli] " + agent.name + " produced NO code changes, marked as completed_no_code");
        try { await selfHealTask(pendingTask.id); } catch(shErr) { console.error('[self-heal] Error:', shErr.message); }
        try { await autoScoreTask(pendingTask.id, false, null); } catch(se) {}
      }
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "user", pendingTask.task]);
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", finalContent]);
  // Auto-memory: save last activity
  try {
    var today = new Date().toISOString().substring(0,10);
    var fc = typeof finalContent !== 'undefined' ? finalContent : '';
    var summary = (fc || "").substring(0,300).replace(/\n/g,' ');
    await saveAgentMemory(agentId, 'zuletzt_' + today, 'Chat: ' + (typeof message !== 'undefined' && message ? message : (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '')).substring(0,80) + ' | Antwort: ' + summary);
  } catch(me) { console.error('[auto-memory]', me.message); }

  // === AUTO-MEMORY SKILL: Extract decisions, blockers, context ===
  try {
    var fc2 = typeof finalContent !== 'undefined' ? (finalContent || '') : '';
    if (fc2.length > 50) {
      var lines = fc2.split('\n');
      var decisions = [];
      var blockers = [];
      var context = [];
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        var lower = line.toLowerCase();
        if (line.length < 15 || line.length > 300) continue;
        // Decision patterns
        if (lower.match(/\b(implemented|created|added|fixed|changed|switched|replaced|built|wrote|deployed|installed|configured|set up|refactored)\b/)) {
          decisions.push(line.substring(0, 200));
        }
        // Blocker patterns
        if (lower.match(/\b(error|failed|blocked|cannot|broken|missing|timeout|rejected|denied|permission|not found|crash)\b/)) {
          blockers.push(line.substring(0, 200));
        }
        // Context patterns (file paths, configs)
        if (line.match(/\/(root|src|dashboard|api|config)\//)) {
          context.push(line.substring(0, 200));
        }
      }
      var autoMem = {
        decisions: filterNoiseFromDecisions(decisions).slice(-5),
        blockers: blockers.slice(-3),
        context: context.slice(-3),
        last_task: (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '').substring(0, 100),
        has_code: typeof hasChanges !== 'undefined' ? hasChanges : false,
        updated: new Date().toISOString()
      };
      var autoTags = ['auto_memory'];
      if (autoMem.has_code) autoTags.push('code_change');
      if (autoMem.blockers.length > 0) autoTags.push('has_blockers');
      await saveAgentMemory(agentId, 'auto_memory', JSON.stringify(autoMem), autoTags, 'auto');
      if (decisions.length > 0 || blockers.length > 0) {
        console.log('[auto-memory] ' + agent.name + ': ' + decisions.length + ' decisions, ' + blockers.length + ' blockers saved');
      }
    }
  } catch(amErr) { console.error('[auto-memory-extract]', amErr.message); }

      status = "active";
    } catch (err) {
      console.error("[agent-engine] Task error for " + agentId + ":", err.message);
      await query("UPDATE agent_tasks SET status = $1, result = $2 WHERE id = $3", ["error", err.message, pendingTask.id]);
      status = "error";
    }
  }

  // === HEALTH MONITORING: Track consecutive failures, auto-pause ===
  try {
    var recentTasks = await query("SELECT status FROM agent_tasks WHERE agent_id = $1 ORDER BY id DESC LIMIT 3", [agentId]);
    var rows = recentTasks ? recentTasks.rows || recentTasks : [];
    var consecutiveFails = 0;
    for (var fi = 0; fi < rows.length; fi++) {
      if (rows[fi].status === "error" || rows[fi].status === "completed_no_code") consecutiveFails++;
      else break;
    }
    if (consecutiveFails >= 3) {
      console.error("[health] Agent " + agentId + " (" + agent.name + ") failed 3x in a row — AUTO-PAUSING");
      await query("UPDATE blun_agents SET status = 'paused' WHERE id = $1", [agentId]);
      await saveAgentMemory(agentId, "health_paused", "Auto-paused after 3 consecutive failures at " + new Date().toISOString());
      // Notify operator
      var operatorRow = await queryOne("SELECT id FROM blun_agents WHERE company_id = $1 AND role = 'operator' LIMIT 1", [agent.company_id]);
      if (operatorRow) {
        await query("INSERT INTO agent_tasks (agent_id, task, status, priority) VALUES ($1, $2, 'pending', 'high')", [operatorRow.id, "HEALTH ALERT: Agent " + agent.name + " wurde nach 3 Fehlschlaegen auto-pausiert. Pruefe die letzten Tasks und entscheide ob der Agent reaktiviert werden soll."]);
      }
      status = "paused";
    }
  } catch(healthErr) { console.error("[health] Check error:", healthErr.message); }

  await query("UPDATE blun_agents SET status = $1, last_heartbeat = NOW() WHERE id = $2", [status, agentId]);
  await query("INSERT INTO agent_heartbeats (agent_id, status, model, tokens_used, cost) VALUES ($1, $2, $3, $4, $5)", [agentId, status, agent.model, tokens, cost]);
}
function startAgent(agentId) {
  if (activeAgents.has(agentId)) return;

  // Set status to active FIRST, before any heartbeat runs
  startDreamCycle(agentId);
  query("UPDATE blun_agents SET status = $1, last_heartbeat = NOW() WHERE id = $2", ["active", agentId]).then(function() {
    var run = async function() {
      try { await heartbeat(agentId); } catch (e) { console.error("[agent-engine] Heartbeat error:", e.message); }
    };

    queryOne("SELECT heartbeat_interval FROM blun_agents WHERE id = $1", [agentId]).then(function(row) {
      var interval = ((row && row.heartbeat_interval) || 60) * 1000;
      var timer = setInterval(run, interval);
      activeAgents.set(agentId, { timer: timer, running: true });
      // Run first heartbeat after a short delay
      setTimeout(run, 1000);
    });
  });
}

function stopAgent(agentId) {
  stopDreamCycle(agentId);
  var entry = activeAgents.get(agentId);
  if (entry) {
    clearInterval(entry.timer);
    activeAgents.delete(agentId);
  }
  query("UPDATE blun_agents SET status = $1 WHERE id = $2", ["idle", agentId]).catch(function() {});
}

function getActiveAgents() {
  return Array.from(activeAgents.keys());
}

async function chatWithAgent(agentId, message) {
  var agent = await queryOne("SELECT * FROM blun_agents WHERE id = $1", [agentId]);
  if (!agent) throw new Error("Agent not found");

  // Auto-generate IDENTITY if not set
  var identityRow = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'IDENTITY'", [agentId]);
  if (!identityRow) {
    var identityContent = "# " + (agent.name || "Agent") + "\n" +
      "- Rolle: " + (agent.role || "KI-Agent") + "\n" +
      (agent.department ? "- Abteilung: " + agent.department + "\n" : "") +
      "- Team: BLUN.ai Agent-Team\n" +
      "- Sprache: Deutsch\n" +
      (agent.personality ? "- Vibe: " + agent.personality.substring(0, 150).split("\n")[0] + "\n" : "") +
      "\nIch bin " + (agent.name || "ein Agent") + " und Teil des BLUN Agent-Teams. Ich kenne meine Rolle und handle entsprechend.";
    await query("INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, 'IDENTITY', $2) ON CONFLICT (agent_id, key) DO NOTHING", [agentId, identityContent]);
    identityRow = { content: identityContent };
  }

  var memBudget = (agent.model && (agent.model.startsWith("local:") || agent.model.includes("gemma") || agent.model.includes("llama"))) ? 500 : 8000;
  var memStr = await loadSmartMemory(agentId, message, memBudget);
  var agentSkills = await query(
    "SELECT s.name, s.code, s.description FROM skills s JOIN agent_skills as2 ON as2.skill_id = s.id WHERE as2.agent_id = $1 AND s.safe = true",
    [agentId]
  );
  var nl = String.fromCharCode(10);
  var skillStr = "";
      if (agentSkills.length) {
        skillStr = nl+nl+"=== DEINE SKILLS (AKTIV NUTZEN!) ==="+nl;
        skillStr += "Du MUSST die folgenden Skills bei jeder Aufgabe aktiv anwenden. Sie enthalten Regeln, Frameworks und Methoden die deine Arbeit leiten."+nl+nl;
        for (var si = 0; si < agentSkills.length; si++) {
          var sk = agentSkills[si];
          var content = (sk.code || sk.description || "").substring(0, 3000);
          skillStr += "### SKILL: " + sk.name + nl + content + nl + nl;
        }
      }
  var history = await query(
    "SELECT role, content FROM agent_conversations WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10",
    [agentId]
  );
  history.reverse();
  var messages = [
    { role: "system", content: (identityRow ? identityRow.content + "\n\n" : "") + (agent.system_prompt || "Du bist ein hilfreicher Agent.") + skillStr + memStr }
  ].concat(history).concat([
    { role: "user", content: message }
  ]);

  var result = await callLLM(agent.model, messages, agentId);

  await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "user", message]);
  await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", result.content]);
  // Auto-memory: save last activity
  try {
    var today = new Date().toISOString().substring(0,10);
    var summary = (result.content || "").substring(0,300).replace(/\n/g,' ');
    await saveAgentMemory(agentId, 'zuletzt_' + today, 'Chat: ' + (typeof message !== 'undefined' && message ? message : (typeof pendingTask !== 'undefined' && pendingTask ? pendingTask.task : '')).substring(0,80) + ' | Antwort: ' + summary);
  } catch(me) { console.error('[auto-memory]', me.message); }

  if (result.tokens > 0) {
    await query("INSERT INTO agent_heartbeats (agent_id, status, model, tokens_used, cost) VALUES ($1, $2, $3, $4, $5)", [agentId, "chat", agent.model, result.tokens, result.cost]);
  }

  try {
    var toolResult = await executeTools(agentId, message, result.content);
    if (toolResult) {
      var fuMessages = messages.concat([{role:"assistant",content:result.content},{role:"user",content:"Tool-Ergebnisse:\n"+toolResult+"\n\nAntworte auf Basis dieser Ergebnisse."}]);
      var fu = await callLLM(agent.model, fuMessages);
      await query("INSERT INTO agent_conversations (agent_id, role, content) VALUES ($1, $2, $3)", [agentId, "assistant", fu.content]);
      return { response: fu.content, tokens: result.tokens, cost: result.cost };
    }
  } catch(te) { console.error("[tools]", te.message); }
  return { response: result.content, tokens: result.tokens, cost: result.cost };
}
module.exports = { runPipeline, delegateTask, startAgent, stopAgent, getActiveAgents, chatWithAgent, callLLM, loadAgentMemory, saveAgentMemory, activeAgents, getRateLimitStatus, dreamCycle, startDreamCycle, stopDreamCycle, sendAgentMessage, getAgentInbox, markMessageRead, replyToMessage, broadcastMessage, getUnreadSummary, saveLayeredMemory, loadLayeredMemory, promoteMemory, filterNoiseFromDecisions, indexFileToGraph, findRelatedFiles, suggestAgentForFile, searchAgentMemory, searchMemoryByTag, scoreTask, updatePerformance, routeTask, splitTask, getLeaderboard, autoScoreTask, selfHealTask, mentorReview, awardXP, visualQACheck, autoVisualQA };

// === DIETER TOOL CALLING ===
var http = require('http');

function callLocalAPI(method, path, body) {
  return new Promise(function(resolve, reject) {
    var port = process.env.BLUN_PORT || 3200;
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: '127.0.0.1', port: port, path: path, method: method,
      headers: { 'Content-Type': 'application/json', 'x-blun-key': process.env.BLUN_API_KEY || 'blun-dev-key' }
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
    req.on('error', reject);
    req.setTimeout(600000); // 10 min timeout for local models
    if (data) req.write(data);
    req.end();
  });
}


async function resolveAgentRef(ref) {
  if (/^d+$/.test(ref)) return ref;
  var agent = await queryOne("SELECT id FROM blun_agents WHERE LOWER(name) = LOWER($1) LIMIT 1", [ref]);
  return agent ? String(agent.id) : null;
}

function sleepMs(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
async function executeTools(agentId, message, aiResponse) {
  // Detect tool commands in AI response
  var cmds = [];
  var lines = aiResponse.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m;
    if ((m = lines[i].match(/\[TOOL:LIST_MODELS\]/i))) cmds.push({ tool: 'list_models' });
    if ((m = lines[i].match(/\[TOOL:DOWNLOAD_MODEL:([^\]]+)\]/i))) cmds.push({ tool: 'download_model', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:START_MODEL:([^\]]+)\]/i))) cmds.push({ tool: 'start_model', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:STOP_MODEL:([^\]]+)\]/i))) cmds.push({ tool: 'stop_model', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:MODEL_STATUS:([^\]]+)\]/i))) cmds.push({ tool: 'model_status', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:LIST_AGENTS\]/i))) cmds.push({ tool: 'list_agents' });
    if ((m = lines[i].match(/\[TOOL:SERVER_STATUS\]/i))) cmds.push({ tool: 'server_status' });
    if ((m = lines[i].match(/\[TOOL:CREATE_AGENT:([^|]+)\|([^|]+)\|([^|\]]+)\|?([^\]]*)\]/i))) cmds.push({ tool: 'create_agent', name: m[1].trim(), role: m[2].trim(), model: m[3].trim(), department: (m[4]||'').trim() });
    if ((m = lines[i].match(/\[TOOL:DELETE_AGENT:(\d+)\]/i))) cmds.push({ tool: 'delete_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:RESET_AGENT:(\d+)\]/i))) cmds.push({ tool: 'reset_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:AGENT_MEMORY:(\d+)\]/i))) cmds.push({ tool: 'agent_memory', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:SET_MEMORY:(\d+)\|([^|]+)\|([^\]]+)\]/i))) cmds.push({ tool: 'set_memory', id: m[1].trim(), key: m[2].trim(), value: m[3].trim() });
    if ((m = lines[i].match(/\[TOOL:CHAT_AGENT:(\d+)\|([^\]]+)\]/i))) cmds.push({ tool: 'chat_agent', id: m[1].trim(), message: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:CREATE_AGENT:([^|]+)\|([^|]+)\|([^|\]]+)\|?([^\]]*)\]/i))) cmds.push({ tool: 'create_agent', name: m[1].trim(), role: m[2].trim(), model: m[3].trim(), department: (m[4]||'').trim() });
    if ((m = lines[i].match(/\[TOOL:DELETE_AGENT:([^\\]]+)\]/i))) cmds.push({ tool: 'delete_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:RESET_AGENT:([^\\]]+)\]/i))) cmds.push({ tool: 'reset_agent', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:AGENT_MEMORY:([^\\]]+)\]/i))) cmds.push({ tool: 'agent_memory', id: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:SET_MEMORY:([^|]+)\|([^|]+)\|([^\]]+)\]/i))) cmds.push({ tool: 'set_memory', id: m[1].trim(), key: m[2].trim(), value: m[3].trim() });
    if ((m = lines[i].match(/\[TOOL:CHAT_AGENT:([^|]+)\|([^\]]+?)(?:\|PRIORITY:\d+)?\]/i))) cmds.push({ tool: 'chat_agent', ref: m[1].trim(), message: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:CREATE_COMPANY:([^\]]+)\]/i))) cmds.push({ tool: 'create_company', name: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:LIST_COMPANIES\]/i))) cmds.push({ tool: 'list_companies' });
    if ((m = lines[i].match(/\[TOOL:LIST_SKILLS\]/i))) cmds.push({ tool: 'list_skills' });
    if ((m = lines[i].match(/\[TOOL:ASSIGN_TASK:([^|]+)\|([^\]]+?)(?:\|PRIORITY:\d+)?\]/i))) cmds.push({ tool: 'assign_task', agent_ref: m[1].trim(), description: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:LIST_TASKS\]/i))) cmds.push({ tool: 'list_tasks' });
    if ((m = lines[i].match(/\[TOOL:BUILD_COMPANY:([^|]+)\|([^\]]+)\]/i))) cmds.push({ tool: 'build_company', name: m[1].trim(), description: m[2].trim() });
    if ((m = lines[i].match(/\[TOOL:GIT_COMMIT:([^\]]+)\]/i))) cmds.push({ tool: "git_commit", msg: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:GIT_PUSH:([^\]]+)\]/i))) cmds.push({ tool: "git_commit", msg: m[1].trim() });
    if ((m = lines[i].match(/\[TOOL:GIT_REMOTE\]/i))) cmds.push({ tool: "git_remote" });
    if ((m = lines[i].match(/\[TOOL:DEPLOY\]/i))) cmds.push({ tool: "deploy" });
    codeTools.parseLine(lines[i], cmds);
  }
  if (cmds.length === 0) return null;

  var results = [];
  for (var j = 0; j < cmds.length; j++) {
    var cmd = cmds[j];
    try {
      if (cmd.tool === 'list_models') {
        var models = await callLocalAPI('GET', '/api/models');
        var list = (models && models.models) ? models.models : (models || []);
        var summary = list.map(function(m) {
          return m.name + ' (' + m.id + ') — ' + (m.sizeGB || m.size_gb || '?') + ' — Status: ' + (m.status || 'available');
        }).join('\n');
        results.push('Verfuegbare Modelle:\n' + summary);
      } else if (cmd.tool === 'download_model') {
        var r = await callLocalAPI('POST', '/api/models/' + cmd.id + '/download');
        results.push('Download ' + cmd.id + ': ' + (r.message || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'start_model') {
        var r = await callLocalAPI('POST', '/api/models/' + cmd.id + '/load');
        results.push('Start ' + cmd.id + ': ' + (r.message || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'stop_model') {
        var r = await callLocalAPI('POST', '/api/models/' + cmd.id + '/unload');
        results.push('Stop ' + cmd.id + ': ' + (r.message || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'model_status') {
        var r = await callLocalAPI('GET', '/api/models/' + cmd.id + '/status');
        results.push('Status ' + cmd.id + ': ' + JSON.stringify(r));
      } else if (cmd.tool === 'list_agents') {
        var r = await callLocalAPI('GET', '/api/organisator/agents');
        var list = (r && r.rows) ? r.rows : (Array.isArray(r) ? r : []);
        var summary = list.map(function(a) { return a.name + ' (' + (a.role||'agent') + ') — ' + (a.status||'unknown'); }).join('\n');
        results.push('Agents:\n' + summary);
      } else if (cmd.tool === 'create_agent') {
        var r = await callLocalAPI('POST', '/api/organisator/agents', {
          name: cmd.name,
          role: cmd.role,
          department: cmd.department || '',
          model: cmd.model,
          status: 'active',
          company_id: agent.company_id || 1,
          system_prompt: (cmd.role && (cmd.role.toLowerCase().indexOf('operator') !== -1 || cmd.role.toLowerCase().indexOf('ceo') !== -1 || cmd.role.toLowerCase().indexOf('organisator') !== -1)) ?
            'Du bist ' + cmd.name + ', Operator/CEO. KERNREGELN: 1) NUR Code-Tasks mit Dateipfad verteilen (dashboard/components/, src/routes/ etc). NIEMALS Analyse/Report/Konzept/Marketing. 2) Ergebnisse pruefen: git diff nach Task-Completion — keine Datei = nicht erfolgreich. 3) Skills aktiv nutzen. 4) Qualitaet vor Quantitaet. 5) VERBOTEN: agent-engine.js, code-tools.js, server.js, .env, package.json. 6) Systematisch arbeiten, kein Panik-Modus. 7) Syntax-Check vor Deploy. TASK-FORMAT: [TOOL:ASSIGN_TASK:id:VERB + WAS + Dateipfad]' :
            'Du bist ' + cmd.name + ', ein ' + cmd.role + '. Du sprichst Deutsch, schreibst echten Code und hilfst proaktiv. Bei jeder Aufgabe MUSST du Dateien aendern (.js/.css/.html). Nutze alle zugewiesenen Skills aktiv.'
        });
        results.push('Agent erstellt: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'delete_agent') {
        var r = await callLocalAPI('DELETE', '/api/organisator/agents/' + cmd.id);
        results.push('Agent ' + cmd.id + ' geloescht: ' + (r.ok ? 'OK' : (r.error || JSON.stringify(r))));
      } else if (cmd.tool === 'reset_agent') {
        var r = await callLocalAPI('PUT', '/api/organisator/agents/' + cmd.id, { status: 'active' });
        results.push('Agent ' + cmd.id + ' resettet: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'agent_memory') {
        var r = await callLocalAPI('GET', '/api/organisator/agents/' + cmd.id + '/memory');
        var mem = r || {};
        var entries = Object.keys(mem).map(function(k) { return k + ': ' + mem[k]; }).join('\n');
        results.push('Memory Agent ' + cmd.id + ':\n' + (entries || 'leer'));
      } else if (cmd.tool === 'set_memory') {
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + cmd.id + '/memory', { key: cmd.key, content: cmd.value });
        results.push('Memory gesetzt: ' + cmd.key + ' fuer Agent ' + cmd.id);
      } else if (cmd.tool === 'chat_agent') {
        var chatId = await resolveAgentRef(cmd.ref);
        if (!chatId) { results.push('Agent "' + cmd.ref + '" nicht gefunden'); continue; }
        // Also create a task so the agent works on it via CLI
        var tdl = cmd.message.toLowerCase();
        var hasFile = /\.(js|css|html|json|ts)/.test(tdl) || tdl.indexOf("src/") !== -1 || tdl.indexOf("dashboard/") !== -1;
        if (hasFile) {
          await callLocalAPI('POST', '/api/organisator/agents/' + chatId + '/task', { task: cmd.message, priority: 'normal' });
          console.log("[operator] CHAT_AGENT -> Task created for " + cmd.ref + ": " + cmd.message.substring(0,80));
        }
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + chatId + '/chat', { message: cmd.message });
        results.push('Task+Chat an ' + cmd.ref + ': ' + (r.response || r.error || JSON.stringify(r)).substring(0,200));
        await sleepMs(2000); // Wait before next agent call
      } else if (cmd.tool === 'create_company') {
        var r = await callLocalAPI('POST', '/api/organisator/companies', { name: cmd.name, description: '' });
        results.push('Firma erstellt: ' + (r.name || r.error || JSON.stringify(r)) + (r.id ? ' (ID: ' + r.id + ')' : ''));
      } else if (cmd.tool === 'list_companies') {
        var r = await callLocalAPI('GET', '/api/organisator/companies');
        var list = Array.isArray(r) ? r : (r.rows || []);
        var summary = list.map(function(c) { return c.name + ' (ID: ' + c.id + ', ' + (c.agent_count || 0) + ' Agents)'; }).join('\n');
        results.push('Firmen:\n' + (summary || 'keine'));
      } else if (cmd.tool === 'list_skills') {
        var r = await callLocalAPI('GET', '/api/skills');
        var skills = Array.isArray(r) ? r : (r.skills || []);
        var summary = skills.map(function(s) { return (s.name || s.id) + ' — ' + (s.description || ''); }).join('\n');
        results.push('Verfuegbare Skills:\n' + (summary || 'keine'));
      } else if (cmd.tool === 'assign_task') {
        var resolvedId = await resolveAgentRef(cmd.agent_ref);
        if (!resolvedId) { results.push('Agent "' + cmd.agent_ref + '" nicht gefunden'); continue; }
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + resolvedId + '/task', { task: cmd.description, priority: 'normal' });
        results.push('Aufgabe zugewiesen an ' + cmd.agent_ref + ' (ID ' + resolvedId + '): ' + cmd.description);
      } else if (cmd.tool === 'list_tasks') {
        var r = await callLocalAPI('GET', '/api/organisator/agents/1/tasks');
        var tasks = Array.isArray(r) ? r : (r.rows || []);
        var summary = tasks.slice(0, 20).map(function(t) { return '#' + t.id + ' [' + t.status + '] ' + (t.description || '').substring(0, 60); }).join('\n');
        results.push('Aufgaben:\n' + (summary || 'keine'));
      } else if (cmd.tool === 'build_company') {
        // Proactive company builder: creates company + suggests agents
        var company = await callLocalAPI('POST', '/api/organisator/companies', { name: cmd.name, description: cmd.description });
        var companyId = company.id;
        results.push('Firma "' + cmd.name + '" erstellt (ID: ' + companyId + '). Beschreibung: ' + cmd.description);
        results.push('Erstelle jetzt passende Agents fuer diese Firma...');
        // The AI will then use CREATE_AGENT tools in the follow-up based on these results
      } else if (cmd.tool === 'git_remote') {
        try {
          var agentRow = await queryOne('SELECT company_id FROM blun_agents WHERE id = $1', [agentId]);
          var conns = await query('SELECT name, config FROM user_connections WHERE type = $1 AND company_id = $2', ['git', agentRow ? agentRow.company_id : null]);
          if (conns.length) {
            results.push('Git Remotes: ' + conns.map(function(c){ var cfg = typeof c.config === 'string' ? JSON.parse(c.config) : c.config; return c.name + ' = ' + (cfg.url || 'no url') + ' (SSH Key: ' + (cfg.ssh_key || 'default') + ')'; }).join(', '));
          } else {
            results.push('Keine Git-Repos in Verbindungen eingetragen.');
          }
        } catch(dbErr) { results.push('DB Error: ' + dbErr.message); }
      } else if (cmd.tool === 'deploy') {
        try {
          // Syntax check all key files before restart
          var cp2 = require('child_process');
          var check = await new Promise(function(res){ cp2.exec('node -c /root/blun/server.js && node -c /root/blun/src/agent-engine.js && node -c /root/blun/src/code-tools.js', {timeout:10000}, function(e,o,er){ res({err:e,out:(o||'')+(er||'')}); }); });
          if (check.err) {
            results.push('DEPLOY_ERR: Syntax check failed: ' + check.out);
          } else {
            var restart = await new Promise(function(res){ cp2.exec('pm2 restart blun', {timeout:15000}, function(e,o,er){ res((o||'')+(er||'')); }); });
            results.push('DEPLOY: pm2 restart done. ' + restart.substring(0,500));
          }
        } catch(e) { results.push('DEPLOY_ERR: ' + e.message); }
            } else if (cmd.tool === "bash" || cmd.tool === "file_read" || cmd.tool === "file_write" || cmd.tool === "list_files" || cmd.tool === "git_commit") {
        await codeTools.handleCmd(cmd, results, agentId);
      } else if (cmd.tool === 'create_agent') {
        var r = await callLocalAPI('POST', '/api/organisator/agents', {
          name: cmd.name,
          role: cmd.role,
          department: cmd.department || '',
          model: cmd.model,
          status: 'active',
          company_id: agent.company_id || 1,
          system_prompt: (cmd.role && (cmd.role.toLowerCase().indexOf('operator') !== -1 || cmd.role.toLowerCase().indexOf('ceo') !== -1 || cmd.role.toLowerCase().indexOf('organisator') !== -1)) ?
            'Du bist ' + cmd.name + ', Operator/CEO. KERNREGELN: 1) NUR Code-Tasks mit Dateipfad verteilen (dashboard/components/, src/routes/ etc). NIEMALS Analyse/Report/Konzept/Marketing. 2) Ergebnisse pruefen: git diff nach Task-Completion — keine Datei = nicht erfolgreich. 3) Skills aktiv nutzen. 4) Qualitaet vor Quantitaet. 5) VERBOTEN: agent-engine.js, code-tools.js, server.js, .env, package.json. 6) Systematisch arbeiten, kein Panik-Modus. 7) Syntax-Check vor Deploy. TASK-FORMAT: [TOOL:ASSIGN_TASK:id:VERB + WAS + Dateipfad]' :
            'Du bist ' + cmd.name + ', ein ' + cmd.role + '. Du sprichst Deutsch, schreibst echten Code und hilfst proaktiv. Bei jeder Aufgabe MUSST du Dateien aendern (.js/.css/.html). Nutze alle zugewiesenen Skills aktiv.'
        });
        results.push('Agent erstellt: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'delete_agent') {
        var r = await callLocalAPI('DELETE', '/api/organisator/agents/' + cmd.id);
        results.push('Agent ' + cmd.id + ' geloescht: ' + (r.ok ? 'OK' : (r.error || JSON.stringify(r))));
      } else if (cmd.tool === 'reset_agent') {
        var r = await callLocalAPI('PUT', '/api/organisator/agents/' + cmd.id, { status: 'active' });
        results.push('Agent ' + cmd.id + ' resettet: ' + (r.name || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'agent_memory') {
        var r = await callLocalAPI('GET', '/api/organisator/agents/' + cmd.id + '/memory');
        var mem = r || {};
        var entries = Object.keys(mem).map(function(k) { return k + ': ' + mem[k]; }).join('\n');
        results.push('Memory Agent ' + cmd.id + ':\n' + (entries || 'leer'));
      } else if (cmd.tool === 'set_memory') {
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + cmd.id + '/memory', { key: cmd.key, content: cmd.value });
        results.push('Memory gesetzt: ' + cmd.key + ' fuer Agent ' + cmd.id);
      } else if (cmd.tool === 'chat_agent') {
        var r = await callLocalAPI('POST', '/api/organisator/agents/' + cmd.id + '/chat', { message: cmd.message });
        results.push('Antwort von Agent ' + cmd.id + ': ' + (r.response || r.error || JSON.stringify(r)));
      } else if (cmd.tool === 'server_status') {
        var r = await callLocalAPI('GET', '/api/monitor/stats');
        results.push('Server: ' + JSON.stringify(r));
      }
    } catch(e) { results.push(cmd.tool + ' Fehler: ' + e.message); }
  }
  return results.join('\n\n');
}

module.exports.executeTools = executeTools;

module.exports.executeTools = executeTools;
