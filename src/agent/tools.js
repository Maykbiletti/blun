// BLUN Agent System — Tool Registry with Execution Tracking
const { exec } = require("child_process");
const { readFile, writeFile } = require("fs/promises");
const { query } = require("../db");
const { broadcast } = require("./redis");
const crypto = require("crypto");

const tools = new Map();

function register(name, tool) {
  tools.set(name, { name: name, description: tool.description, parameters: tool.parameters, execute: tool.execute });
  console.log("[tools] Registered: " + name);
}

async function executeTool(agentId, toolName, params) {
  var tool = tools.get(toolName);
  if (!tool) return { success: false, output: "Unknown tool: " + toolName, executionId: null };

  var executionId = crypto.randomUUID();

  await query(
    "INSERT INTO tool_executions (id, agent_id, tool_name, input, status) VALUES ($1, $2, $3, $4, $5)",
    [executionId, agentId, toolName, JSON.stringify(params), "running"]
  );
  broadcast("agent.tool.start", { agentId: agentId, executionId: executionId, toolName: toolName });

  try {
    var output = await tool.execute(params);
    var outputStr = typeof output === "string" ? output : JSON.stringify(output);

    await query(
      "UPDATE tool_executions SET output = $1, status = $2, finished_at = NOW() WHERE id = $3",
      [outputStr.slice(0, 65536), "done", executionId]
    );
    broadcast("agent.tool.result", { agentId: agentId, executionId: executionId, toolName: toolName, status: "done" });
    return { success: true, output: outputStr, executionId: executionId };
  } catch (err) {
    await query(
      "UPDATE tool_executions SET output = $1, status = $2, finished_at = NOW() WHERE id = $3",
      [err.message, "error", executionId]
    );
    broadcast("agent.tool.result", { agentId: agentId, executionId: executionId, toolName: toolName, status: "error" });
    return { success: false, output: err.message, executionId: executionId };
  }
}

function listTools() {
  return Array.from(tools.values()).map(function(t) {
    return { name: t.name, description: t.description, parameters: t.parameters };
  });
}

// === Built-in Tools ===

register("bash", {
  description: "Execute a bash command on the server",
  parameters: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeout: { type: "number" } }, required: ["command"] },
  execute: function(p) {
    return new Promise(function(resolve, reject) {
      exec(p.command, { cwd: p.cwd, timeout: p.timeout || 30000, maxBuffer: 1024 * 1024 }, function(err, stdout, stderr) {
        if (err) reject(new Error("Exit " + err.code + ": " + (stderr || err.message)));
        else resolve(stdout + (stderr ? "\n[stderr] " + stderr : ""));
      });
    });
  }
});

register("postgres_query", {
  description: "Run a SQL query against the BLUN database",
  parameters: { type: "object", properties: { sql: { type: "string" }, params: { type: "array" } }, required: ["sql"] },
  execute: async function(p) {
    var rows = await query(p.sql, p.params || []);
    return JSON.stringify(rows, null, 2);
  }
});

register("http_request", {
  description: "Make an HTTP request",
  parameters: { type: "object", properties: { url: { type: "string" }, method: { type: "string" }, headers: { type: "object" }, body: { type: "string" } }, required: ["url"] },
  execute: async function(p) {
    var fetch = require("node-fetch");
    var opts = { method: p.method || "GET", headers: p.headers || {} };
    if (p.body && (opts.method === "POST" || opts.method === "PUT")) opts.body = p.body;
    var res = await fetch(p.url, opts);
    var text = await res.text();
    return res.status + " " + res.statusText + "\n" + text.slice(0, 32768);
  }
});

register("file_read", {
  description: "Read a file from the filesystem",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  execute: async function(p) { return await readFile(p.path, "utf-8"); }
});

register("file_write", {
  description: "Write content to a file",
  parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  execute: async function(p) {
    await writeFile(p.path, p.content, "utf-8");
    return "Written " + p.content.length + " bytes to " + p.path;
  }
});

module.exports = { register, executeTool, listTools, tools };
