// BLUN - AI Organisator | MIT License

const { WebSocketServer } = require("ws");
const Redis = require("ioredis");
const { sub, publish, broadcast } = require("./redis");
const { query, queryOne } = require("./db");

const agentSockets = new Map();
const dashboardSockets = new Set();

function attachWS(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const role = url.searchParams.get("role") || "dashboard";
    const agentId = url.searchParams.get("agentId");

    if (role === "agent" && agentId) {
      handleAgentConnection(ws, agentId);
    } else {
      handleDashboardConnection(ws);
    }
  });

  sub.subscribe("blun:dashboard");
  sub.on("message", (channel, message) => {
    if (channel === "blun:dashboard") {
      for (const ws of dashboardSockets) {
        if (ws.readyState === 1) ws.send(message);
      }
    }
  });

  console.log("[ws] WebSocket server attached");
  return wss;
}

function handleAgentConnection(ws, agentId) {
  console.log("[ws] Agent connected: " + agentId);
  agentSockets.set(agentId, ws);

  query("UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2", ["active", agentId]);
  broadcast("agent.status", { agentId, status: "active" });

  const agentChannel = "blun:agent:" + agentId;
  const agentRedis = new Redis(process.env.BLUN_REDIS_URL || "redis://127.0.0.1:6379");
  agentRedis.subscribe(agentChannel);
  agentRedis.on("message", (_ch, msg) => {
    if (ws.readyState === 1) ws.send(msg);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleAgentMessage(agentId, msg);
    } catch (e) {
      console.error("[ws] Bad message from agent " + agentId + ":", e.message);
    }
  });

  ws.on("close", () => {
    console.log("[ws] Agent disconnected: " + agentId);
    agentSockets.delete(agentId);
    agentRedis.unsubscribe();
    agentRedis.quit();
    query("UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2", ["offline", agentId]);
    broadcast("agent.status", { agentId, status: "offline" });
  });
}

async function handleAgentMessage(agentId, msg) {
  const { type, payload } = msg;

  switch (type) {
    case "agent.message": {
      await query(
        "INSERT INTO conversation_messages (conversation_id, sender_type, sender_id, body, metadata) VALUES ($1, $2, $3, $4, $5)",
        [payload.conversationId, "agent", agentId, payload.body, payload.metadata || {}]
      );
      broadcast("agent.message", { agentId, ...payload });
      break;
    }
    case "agent.tool.start": {
      await query(
        "INSERT INTO tool_executions (id, agent_id, tool_name, input, status) VALUES ($1, $2, $3, $4, $5)",
        [payload.executionId, agentId, payload.toolName, payload.input || {}, "running"]
      );
      broadcast("agent.tool.start", { agentId, ...payload });
      break;
    }
    case "agent.tool.result": {
      await query(
        "UPDATE tool_executions SET output = $1, status = $2, finished_at = NOW() WHERE id = $3",
        [payload.output, payload.status || "done", payload.executionId]
      );
      broadcast("agent.tool.result", { agentId, ...payload });
      break;
    }
    case "agent.status": {
      await query("UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2", [payload.status, agentId]);
      broadcast("agent.status", { agentId, status: payload.status });
      break;
    }
    case "cost.report": {
      await query(
        "INSERT INTO cost_events (agent_id, provider, model, input_tokens, output_tokens, cost_cents) VALUES ($1, $2, $3, $4, $5, $6)",
        [agentId, payload.provider, payload.model, payload.inputTokens, payload.outputTokens, payload.costCents]
      );
      broadcast("cost.report", { agentId, ...payload });
      break;
    }
    default:
      broadcast(type, { agentId, ...payload });
  }
}

function handleDashboardConnection(ws) {
  console.log("[ws] Dashboard client connected");
  dashboardSockets.add(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleDashboardMessage(ws, msg);
    } catch (e) {
      console.error("[ws] Bad dashboard message:", e.message);
    }
  });

  ws.on("close", () => {
    dashboardSockets.delete(ws);
    console.log("[ws] Dashboard client disconnected");
  });

  sendDashboardSync(ws);
}

async function handleDashboardMessage(ws, msg) {
  const { type, payload } = msg;

  switch (type) {
    case "user.message": {
      const { agentId, conversationId, body } = payload;
      await query(
        "INSERT INTO conversation_messages (conversation_id, sender_type, body) VALUES ($1, $2, $3)",
        [conversationId, "user", body]
      );
      publish("blun:agent:" + agentId, "user.message", { conversationId, body });
      const agentWs = agentSockets.get(agentId);
      if (agentWs && agentWs.readyState === 1) {
        agentWs.send(JSON.stringify({ type: "user.message", payload: { conversationId, body } }));
      }
      broadcast("user.message", payload);
      break;
    }
    case "dashboard.sync": {
      sendDashboardSync(ws);
      break;
    }
  }
}

async function sendDashboardSync(ws) {
  try {
    const [companies, agents, recentTasks] = await Promise.all([
      query("SELECT * FROM companies ORDER BY created_at"),
      query("SELECT * FROM agents ORDER BY company_id, name"),
      query("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50"),
    ]);
    ws.send(JSON.stringify({ type: "dashboard.sync", payload: { companies, agents, tasks: recentTasks } }));
  } catch (err) {
    console.error("[ws] Sync error:", err.message);
  }
}

function sendToAgent(agentId, type, payload) {
  const ws = agentSockets.get(agentId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type, payload }));
  }
  publish("blun:agent:" + agentId, type, payload);
}

module.exports = { attachWS, sendToAgent, agentSockets, dashboardSockets };
