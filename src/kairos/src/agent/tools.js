// BLUN - AI Organisator | MIT License

const { exec } = require("child_process");
const { readFile, writeFile } = require("fs/promises");
const { query } = require("../db");
const { v4: uuid } = require("uuid");
const { broadcast } = require("../redis");

const tools = new Map();

function register(name, tool) {
  tools.set(name, { name, ...tool });
  console.log("[tools] Registered: " + name);
}

async function executeTool(agentId, toolName, params) {
  const tool = tools.get(toolName);
  if (!tool) return { success: false, output: "Unknown tool: " + toolName, executionId: null };

  const executionId = uuid();

  await query(
    "INSERT INTO tool_executions (id, agent_id, tool_name, input, status) VALUES ($1, $2, $3, $4, $5)",
    [executionId, agentId, toolName, params, "running"]
  );
  broadcast("agent.tool.start", { agentId, executionId, toolName, input: params });

  try {
    const output = await tool.execute(params);
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);

    await query(
      "UPDATE tool_executions SET output = $1, status = $2, finished_at = NOW() WHERE id = $3",
      [outputStr.slice(0, 65536), "done", executionId]
    );
    broadcast("agent.tool.result", { agentId, executionId, toolName, status: "done" });
    return { success: true, output: outputStr, executionId };
  } catch (err) {
    await query(
      "UPDATE tool_executions SET output = $1, status = $2, finished_at = NOW() WHERE id = $3",
      [err.message, "error", executionId]
    );
    broadcast("agent.tool.result", { agentId, executionId, toolName, status: "error" });
    return { success: false, output: err.message, executionId };
  }
}

function listTools() {
  return Array.from(tools.values()).map(function (t) {
    return { name: t.name, description: t.description, parameters: t.parameters };
  });
}

// Built-in Tools

register("bash", {
  description: "Execute a bash command on the server",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      cwd: { type: "string", description: "Working directory (optional)" },
      timeout: { type: "number", description: "Timeout in ms (default 30000)" },
    },
    required: ["command"],
  },
  execute: function (p) {
    return new Promise(function (resolve, reject) {
      exec(p.command, { cwd: p.cwd, timeout: p.timeout || 30000, maxBuffer: 1024 * 1024 }, function (err, stdout, stderr) {
        if (err) reject(new Error("Exit " + err.code + ": " + (stderr || err.message)));
        else resolve(stdout + (stderr ? "\n[stderr] " + stderr : ""));
      });
    });
  },
});

register("ssh", {
  description: "Execute a command on a remote server via SSH",
  parameters: {
    type: "object",
    properties: {
      host: { type: "string", description: "SSH host (user@host)" },
      command: { type: "string", description: "Command to execute remotely" },
      keyPath: { type: "string", description: "Path to SSH key (optional)" },
    },
    required: ["host", "command"],
  },
  execute: function (p) {
    var sshArgs = p.keyPath ? "-i " + p.keyPath + " -o StrictHostKeyChecking=no" : "-o StrictHostKeyChecking=no";
    var cmd = "ssh " + sshArgs + " " + p.host + " " + JSON.stringify(p.command);
    return new Promise(function (resolve, reject) {
      exec(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 }, function (err, stdout, stderr) {
        if (err) reject(new Error("SSH error: " + (stderr || err.message)));
        else resolve(stdout);
      });
    });
  },
});

register("postgres_query", {
  description: "Run a SQL query against the BLUN database",
  parameters: {
    type: "object",
    properties: {
      sql: { type: "string", description: "SQL query" },
      params: { type: "array", description: "Query parameters (optional)" },
    },
    required: ["sql"],
  },
  execute: async function (p) {
    var rows = await query(p.sql, p.params || []);
    return JSON.stringify(rows, null, 2);
  },
});

register("http_request", {
  description: "Make an HTTP request",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string", description: "GET, POST, PUT, DELETE (default GET)" },
      headers: { type: "object", description: "Request headers" },
      body: { type: "string", description: "Request body (for POST/PUT)" },
    },
    required: ["url"],
  },
  execute: async function (p) {
    var opts = { method: p.method || "GET", headers: p.headers || {} };
    if (p.body && (opts.method === "POST" || opts.method === "PUT")) opts.body = p.body;
    var res = await fetch(p.url, opts);
    var text = await res.text();
    return res.status + " " + res.statusText + "\n" + text.slice(0, 32768);
  },
});

register("file_read", {
  description: "Read a file from the filesystem",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute file path" },
      encoding: { type: "string", description: "Encoding (default utf-8)" },
    },
    required: ["path"],
  },
  execute: async function (p) {
    return await readFile(p.path, p.encoding || "utf-8");
  },
});

register("file_write", {
  description: "Write content to a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute file path" },
      content: { type: "string", description: "File content" },
    },
    required: ["path", "content"],
  },
  execute: async function (p) {
    await writeFile(p.path, p.content, "utf-8");
    return "Written " + p.content.length + " bytes to " + p.path;
  },
});

module.exports = { register, executeTool, listTools, tools };
