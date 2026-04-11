const childProcess = require("child_process");

function normalizeMessages(opts) {
  if (Array.isArray(opts.messages) && opts.messages.length) return opts.messages;
  if (opts.prompt) return [{ role: "user", content: String(opts.prompt) }];
  return [];
}

function buildPrompt(opts) {
  const parts = [];
  if (opts.systemPrompt) parts.push("system: " + opts.systemPrompt);

  const messages = normalizeMessages(opts);
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i] || {};
    const role = msg.role || "user";
    const content = msg.content == null ? "" : String(msg.content);
    parts.push(role + ": " + content);
  }

  return parts.join("\n\n").trim();
}

function parseCodexOutput(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  const lines = text.split(/\r?\n/);
  const cleaned = [];
  let started = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === "codex") {
      started = true;
      continue;
    }
    if (started && /^tokens used\b/i.test(line)) break;
    if (started) cleaned.push(line);
  }

  if (cleaned.length) return cleaned.join("\n").trim();
  return text;
}

module.exports = function createCodexAdapter(config) {
  const cfg = config || {};

  return {
    name: "codex",
    config: cfg,

    async query(opts) {
      const queryOpts = opts || {};
      const command = cfg.command || "codex";
      const timeoutMs = Number(cfg.timeoutMs || queryOpts.timeoutMs || 120000);
      const cwd = cfg.cwd || queryOpts.cwd || process.cwd();

      const args = [];
      args.push(cfg.execFlag || "exec");
      args.push(cfg.skipGitRepoCheckFlag || "--skip-git-repo-check");

      if (queryOpts.model) {
        args.push("-c", 'model="' + String(queryOpts.model).replace(/"/g, '\\"') + '"');
      }

      if (Array.isArray(cfg.extraArgs) && cfg.extraArgs.length) args.push(...cfg.extraArgs);
      if (Array.isArray(queryOpts.extraArgs) && queryOpts.extraArgs.length) args.push(...queryOpts.extraArgs);

      args.push("-");

      const prompt = buildPrompt(queryOpts);

      const result = await new Promise(function (resolve, reject) {
        const child = childProcess.spawn(command, args, {
          cwd,
          env: Object.assign({}, process.env, cfg.env || {}, queryOpts.env || {}),
          stdio: ["pipe", "pipe", "pipe"]
        });

        let out = "";
        let err = "";
        let closed = false;

        child.stdout.on("data", function (chunk) { out += chunk.toString(); });
        child.stderr.on("data", function (chunk) { err += chunk.toString(); });

        child.on("error", function (spawnErr) {
          if (closed) return;
          closed = true;
          reject(spawnErr);
        });

        child.on("close", function (code) {
          if (closed) return;
          closed = true;
          if (code === 0) {
            resolve({ out, err });
          } else {
            const detail = (err || out || "").trim();
            reject(new Error("Codex CLI failed (exit " + code + ")" + (detail ? ": " + detail.slice(0, 500) : "")));
          }
        });

        if (prompt) child.stdin.write(prompt);
        child.stdin.end();

        setTimeout(function () {
          if (closed) return;
          closed = true;
          try { child.kill("SIGTERM"); } catch (_) {}
          reject(new Error("Codex CLI timeout after " + timeoutMs + "ms"));
        }, timeoutMs);
      });

      const text = parseCodexOutput(result.out);
      return {
        text,
        toolCalls: [],
        tokensIn: 0,
        tokensOut: 0,
        stopReason: "completed",
        raw: {
          stdout: result.out,
          stderr: result.err,
          command,
          args,
          cwd
        }
      };
    }
  };
};
