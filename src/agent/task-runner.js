// BLUN Task Runner v2 — multi-provider: routes by agent.model
// claude-* → claude CLI, gemini-* → gemini CLI, gpt-*/o3/o4 → codex CLI
var cp = require("child_process");
var fs = require("fs");
var crypto = require("crypto");

var WORKTREE_BASE = "/root/blun-worktrees/";
var TIMEOUT = 180000; // 3 min per task
var ENC_KEY = process.env.BLUN_ENCRYPTION_KEY || "blun-dev-encryption-key-32chars!";

// Cached API keys (loaded once from DB)
var _keyCache = { google: null, loaded: false };

function decryptKey(encrypted) {
  var parts = encrypted.split(":");
  var iv = Buffer.from(parts[0], "hex");
  var tag = Buffer.from(parts[1], "hex");
  var enc = parts[2];
  var d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "utf8").slice(0, 32), iv);
  d.setAuthTag(tag);
  return d.update(enc, "hex", "utf8") + d.final("utf8");
}

async function loadKeys(queryFn) {
  if (_keyCache.loaded) return;
  try {
    var rows = await queryFn("SELECT provider, api_key_encrypted FROM ai_connections WHERE status = 'active'");
    var list = rows.rows || rows;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.api_key_encrypted) continue;
      try {
        if (r.provider === "google") _keyCache.google = decryptKey(r.api_key_encrypted);
      } catch (e) {
        console.log("[task-runner] decrypt " + r.provider + " failed: " + e.message);
      }
    }
  } catch (e) {
    console.log("[task-runner] loadKeys error: " + e.message);
  }
  _keyCache.loaded = true;
}

function pickCLI(model) {
  var m = (model || "").toLowerCase();
  if (m.indexOf("claude") === 0) return "claude";
  if (m.indexOf("gemini") === 0) return "gemini";
  if (m.indexOf("gpt") === 0 || m.indexOf("o3") === 0 || m.indexOf("o4") === 0) return "codex";
  return "claude"; // fallback
}

function buildPrompt(agent, task, agentDir) {
  return "Du bist " + agent.name + ", " + (agent.role || "Entwickler") + " bei BLUN.\n" +
    "Arbeitsverzeichnis: " + agentDir + "\n\n" +
    "TASK: " + task.task + "\n\n" +
    "REGELN:\n" +
    "1. Schreib den Code DIREKT in die genannte Datei\n" +
    "2. Erstelle fehlende Verzeichnisse mit mkdir -p\n" +
    "3. Teste mit node -c bei .js Dateien\n" +
    "4. Git add + commit wenn fertig\n" +
    "5. KEINE Erklaerungen, KEINE Reviews, KEIN Smalltalk — NUR CODE\n" +
    "6. NIEMALS agent-engine.js, server.js, index.html, db.js aendern";
}

function runCLI(cliName, model, prompt, agentDir) {
  return new Promise(function (resolve) {
    var args, env, stdinPrompt = null;
    var baseEnv = Object.assign({}, process.env, { HOME: "/root" });

    if (cliName === "claude") {
      args = ["--print", "-", "--output-format", "text", "--max-turns", "10"];
      if (model && model.indexOf("claude") === 0) args.push("--model", model);
      env = Object.assign(baseEnv, { DISABLE_INTERACTIVITY: "1" });
      stdinPrompt = prompt;
    } else if (cliName === "gemini") {
      args = ["-p", prompt, "-y"];
      if (model) args.push("-m", model);
      env = Object.assign(baseEnv, _keyCache.google ? { GEMINI_API_KEY: _keyCache.google } : {});
    } else if (cliName === "codex") {
      args = ["exec", "--skip-git-repo-check", "-"];
      if (model) args.push("-c", "model=\"" + model + "\"");
      env = baseEnv;
      stdinPrompt = prompt;
    } else {
      return resolve({ output: "unknown CLI: " + cliName, code: -1 });
    }

    var child = cp.spawn(cliName, args, { cwd: agentDir, timeout: TIMEOUT, env: env });
    var out = "";
    if (stdinPrompt) {
      try { child.stdin.write(stdinPrompt); child.stdin.end(); } catch (e) {}
    }
    child.stdout.on("data", function (d) { if (out.length < 200000) out += d.toString(); });
    child.stderr.on("data", function (d) { if (out.length < 200000) out += d.toString(); });
    child.on("close", function (code) { resolve({ output: out, code: code }); });
    child.on("error", function (err) { resolve({ output: err.message, code: -1 }); });
    setTimeout(function () { try { child.kill("SIGTERM"); } catch (e) {} }, TIMEOUT);
  });
}

async function executeTask(agent, task, queryFn) {
  await loadKeys(queryFn);

  var agentDir = WORKTREE_BASE + "agent-" + agent.name.toLowerCase();
  if (!fs.existsSync(agentDir)) {
    console.log("[task-runner] No worktree for " + agent.name + ", using main repo");
    agentDir = "/root/blun";
  }

  var cliName = pickCLI(agent.model);
  var prompt = buildPrompt(agent, task, agentDir);

  await queryFn("UPDATE agent_tasks SET status = 'processing' WHERE id = $1", [task.id]);
  console.log("[task-runner] " + agent.name + " [" + cliName + "/" + (agent.model || "default") + "] task #" + task.id + ": " + task.task.substring(0, 80));

  if (cliName === "gemini" && !_keyCache.google) {
    await queryFn("UPDATE agent_tasks SET status = 'pending', result = 'FAIL: no google api key' WHERE id = $1", [task.id]);
    console.log("[task-runner] " + agent.name + " FAIL #" + task.id + " — no google api key");
    return { pass: false, reason: "no google api key" };
  }

  var result = await runCLI(cliName, agent.model, prompt, agentDir);

  var validation = await validateOutput(agentDir);

  if (validation.hasCommit || validation.hasChanges) {
    await queryFn("UPDATE agent_tasks SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2",
      [JSON.stringify({ cli: cliName, model: agent.model, commits: validation.commits, files: validation.changedFiles, output_length: result.output.length }), task.id]);
    console.log("[task-runner] " + agent.name + " PASS #" + task.id + " — " + validation.commits + " commits, " + validation.changedFiles + " files");
    return { pass: true, cli: cliName, commits: validation.commits, files: validation.changedFiles };
  } else {
    await queryFn("UPDATE agent_tasks SET status = 'pending', result = $1 WHERE id = $2",
      [JSON.stringify({ cli: cliName, model: agent.model, reason: "no code output", code: result.code, sample: (result.output || "").substring(0, 300) }), task.id]);
    console.log("[task-runner] " + agent.name + " FAIL #" + task.id + " — no code output (cli=" + cliName + ", code=" + result.code + ")");
    return { pass: false, cli: cliName, reason: "no code output" };
  }
}

async function validateOutput(agentDir) {
  return new Promise(function (resolve) {
    cp.exec(
      "cd " + agentDir + " && " +
      "COMMITS=$(git log --oneline --since='5 minutes ago' 2>/dev/null | wc -l) && " +
      "CHANGED=$(git diff --name-only 2>/dev/null | wc -l) && " +
      "STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l) && " +
      "echo \"$COMMITS|$CHANGED|$STAGED\"",
      { timeout: 5000 },
      function (err, stdout) {
        var parts = (stdout || "0|0|0").trim().split("|");
        var commits = parseInt(parts[0]) || 0;
        var changed = parseInt(parts[1]) || 0;
        var staged = parseInt(parts[2]) || 0;
        resolve({
          hasCommit: commits > 0,
          hasChanges: changed > 0 || staged > 0,
          commits: commits,
          changedFiles: changed + staged
        });
      }
    );
  });
}

async function runAgentTasks(agent, queryFn, queryOneFn) {
  var task = await queryOneFn(
    "SELECT * FROM agent_tasks WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
    [agent.id]
  );
  if (!task) return { idle: true };
  return await executeTask(agent, task, queryFn);
}

module.exports = { executeTask, validateOutput, runAgentTasks, pickCLI };
