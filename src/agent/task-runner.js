// BLUN Task Runner — replaces free conversation with structured execution
// Task → CLI → validate output → PASS/FAIL
var cp = require("child_process");
var fs = require("fs");
var path = require("path");

var WORKTREE_BASE = "/root/blun-worktrees/";
var TIMEOUT = 120000; // 2 min per task

async function executeTask(agent, task, queryFn) {
  var agentDir = WORKTREE_BASE + "agent-" + agent.name.toLowerCase();
  if (!fs.existsSync(agentDir)) {
    console.log("[task-runner] No worktree for " + agent.name + ", using main repo");
    agentDir = "/root/blun";
  }

  // Build focused prompt — no conversation, just code
  var prompt = "Du bist " + agent.name + ", " + (agent.role || "Entwickler") + " bei BLUN.\n" +
    "Arbeitsverzeichnis: " + agentDir + "\n\n" +
    "TASK: " + task.task + "\n\n" +
    "REGELN:\n" +
    "1. Schreib den Code DIREKT in die genannte Datei\n" +
    "2. Erstelle fehlende Verzeichnisse mit mkdir -p\n" +
    "3. Teste mit node -c bei .js Dateien\n" +
    "4. Git add + commit wenn fertig\n" +
    "5. KEINE Erklärungen, KEINE Reviews, KEIN Smalltalk — NUR CODE\n" +
    "6. NIEMALS agent-engine.js, server.js, index.html, db.js ändern";

  // Mark task as processing
  await queryFn("UPDATE agent_tasks SET status = 'processing' WHERE id = $1", [task.id]);

  console.log("[task-runner] " + agent.name + " starting task #" + task.id + ": " + task.task.substring(0, 80));

  // Run Claude CLI with --print flag for single-shot execution
  var result = await new Promise(function(resolve) {
    var args = ["--print", "-", "--output-format", "text", "--max-turns", "10", "--model", "claude-sonnet-4-20250514"];
    var child = cp.spawn("claude", args, {
      cwd: agentDir,
      timeout: TIMEOUT,
      env: Object.assign({}, process.env, { DISABLE_INTERACTIVITY: "1", HOME: "/root" })
    });
    var out = "";
    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on("data", function(d) { if (out.length < 200000) out += d.toString(); });
    child.stderr.on("data", function(d) { if (out.length < 200000) out += d.toString(); });
    child.on("close", function(code) { resolve({ output: out, code: code }); });
    child.on("error", function(err) { resolve({ output: err.message, code: -1 }); });
    setTimeout(function() { try { child.kill("SIGTERM"); } catch(e){} }, TIMEOUT);
  });

  // Validate: check for new commits or file changes
  var validation = await validateOutput(agentDir, agent.name);

  if (validation.hasCommit || validation.hasChanges) {
    await queryFn("UPDATE agent_tasks SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2",
      [JSON.stringify({ commits: validation.commits, files: validation.changedFiles, output_length: result.output.length }), task.id]);
    console.log("[task-runner] " + agent.name + " PASS task #" + task.id + " — " + validation.commits + " commits, " + validation.changedFiles + " files");
    return { pass: true, commits: validation.commits, files: validation.changedFiles };
  } else {
    // Retry once with error feedback
    await queryFn("UPDATE agent_tasks SET status = 'pending', result = 'RETRY: no code output detected' WHERE id = $1", [task.id]);
    console.log("[task-runner] " + agent.name + " FAIL task #" + task.id + " — no commits or file changes");
    return { pass: false, reason: "no code output" };
  }
}

async function validateOutput(agentDir, agentName) {
  return new Promise(function(resolve) {
    cp.exec(
      "cd " + agentDir + " && " +
      "COMMITS=$(git log --oneline --since='5 minutes ago' 2>/dev/null | wc -l) && " +
      "CHANGED=$(git diff --name-only 2>/dev/null | wc -l) && " +
      "STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l) && " +
      "echo \"$COMMITS|$CHANGED|$STAGED\"",
      { timeout: 5000 },
      function(err, stdout) {
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

// Simple task runner loop for one agent — replaces heartbeat
async function runAgentTasks(agent, queryFn, queryOneFn) {
  var task = await queryOneFn(
    "SELECT * FROM agent_tasks WHERE agent_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
    [agent.id]
  );
  if (!task) return { idle: true };
  return await executeTask(agent, task, queryFn);
}

module.exports = { executeTask, validateOutput, runAgentTasks };
