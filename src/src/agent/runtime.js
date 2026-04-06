// BLUN - AI Organisator | MIT License

const { spawn } = require("child_process");
const { query, queryOne } = require("../db");
const { broadcast } = require("../redis");
const { v4: uuid } = require("uuid");
const { mkdirSync } = require("fs");
const path = require("path");

const processes = new Map();

const BLUN_BASE = process.env.BLUN_BASE_DIR || path.resolve(__dirname, "../..");

const ADAPTERS = {
  codex_local: {
    command: "codex",
    buildArgs: (agent) => {
      const args = ["--skip-git-repo-check"];
      if (agent.config && agent.config.extraArgs) args.push(...agent.config.extraArgs);
      return args;
    },
  },
  gemini_cli: {
    command: "gemini",
    buildArgs: (agent) => {
      const args = [];
      if (agent.model) args.push("--model", agent.model);
      return args;
    },
  },
  claude_api: {
    command: "node",
    buildArgs: (agent) => [path.join(BLUN_BASE, "src/agent/adapters/claude-adapter.js"), agent.id],
  },
  openai_api: {
    command: "node",
    buildArgs: (agent) => [path.join(BLUN_BASE, "src/agent/adapters/openai-adapter.js"), agent.id],
  },
};

async function startAgent(agentId) {
  if (processes.has(agentId)) {
    return { success: false, message: "Agent already running" };
  }

  const agent = await queryOne("SELECT * FROM agents WHERE id = $1", [agentId]);
  if (!agent) return { success: false, message: "Agent not found" };

  const adapter = ADAPTERS[agent.adapter_type];
  if (!adapter) return { success: false, message: "Unknown adapter: " + agent.adapter_type };

  const workspacesDir = process.env.BLUN_WORKSPACES_DIR || path.join(BLUN_BASE, "workspaces");
  const workspace = (agent.config && agent.config.workspace) || path.join(workspacesDir, agentId);
  try { mkdirSync(workspace, { recursive: true }); } catch (e) {}

  const heartbeatId = uuid();
  await query("INSERT INTO heartbeats (id, agent_id, status) VALUES ($1, $2, $3)", [heartbeatId, agentId, "starting"]);

  try {
    const child = spawn(adapter.command, adapter.buildArgs(agent), {
      cwd: workspace,
      env: {
        ...process.env,
        BLUN_AGENT_ID: agentId,
        BLUN_WS_URL: "ws://127.0.0.1:" + (process.env.BLUN_PORT || 3200) + "?role=agent&agentId=" + agentId,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > 10240) stdout = stdout.slice(-10240);
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > 10240) stderr = stderr.slice(-10240);
    });

    child.on("exit", async (code, signal) => {
      console.log("[runtime] Agent " + agent.name + " (" + agentId + ") exited: code=" + code + " signal=" + signal);
      const prevEntry = processes.get(agentId);
      const restartCount = prevEntry ? prevEntry.restarts : 0;
      processes.delete(agentId);

      await query(
        "UPDATE heartbeats SET status = $1, finished_at = NOW(), stdout = $2, error = $3 WHERE id = $4",
        [code === 0 ? "completed" : "error", stdout.slice(-4096), stderr.slice(-4096), heartbeatId]
      );
      await query("UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2",
        [code === 0 ? "idle" : "error", agentId]);

      broadcast("agent.status", { agentId, status: code === 0 ? "idle" : "error" });

      if (code !== 0 && restartCount < 3 && (!agent.config || agent.config.autoRestart !== false)) {
        console.log("[runtime] Auto-restarting agent " + agent.name + " (attempt " + (restartCount + 1) + "/3)");
        setTimeout(function () {
          startAgent(agentId).then(function (r) {
            if (r.success) {
              var p = processes.get(agentId);
              if (p) p.restarts = restartCount + 1;
            }
          });
        }, 5000);
      }
    });

    processes.set(agentId, { process: child, config: agent, restarts: 0 });
    await query("UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2", ["active", agentId]);
    broadcast("agent.status", { agentId, status: "active" });

    return { success: true, message: "Agent " + agent.name + " started" };
  } catch (err) {
    await query("UPDATE heartbeats SET status = $1, error = $2, finished_at = NOW() WHERE id = $3",
      ["error", err.message, heartbeatId]);
    return { success: false, message: err.message };
  }
}

async function stopAgent(agentId) {
  const entry = processes.get(agentId);
  if (!entry) return { success: false, message: "Agent not running" };

  entry.restarts = 999;
  entry.process.kill("SIGTERM");

  setTimeout(function () {
    if (processes.has(agentId)) entry.process.kill("SIGKILL");
  }, 10000);

  await query("UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2", ["idle", agentId]);
  broadcast("agent.status", { agentId, status: "idle" });

  return { success: true, message: "Agent stop signal sent" };
}

async function restartAgent(agentId) {
  await stopAgent(agentId);
  return new Promise(function (resolve) {
    setTimeout(async function () { resolve(await startAgent(agentId)); }, 2000);
  });
}

function getProcessStatus() {
  const status = {};
  for (const [id, entry] of processes) {
    status[id] = {
      name: entry.config.name,
      pid: entry.process.pid,
      restarts: entry.restarts,
      running: !entry.process.killed,
    };
  }
  return status;
}

module.exports = { startAgent, stopAgent, restartAgent, getProcessStatus, processes };
