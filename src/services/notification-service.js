// BLUN - AI Organisator | MIT License
// Notification Service — event-driven notification hub
// Routes events (task.done, task.failed, agent.status, etc.) to configured channels

const { query, queryOne } = require("../db");
const { broadcast } = require("../redis");
const telegramService = require("./telegram-service");

// In-memory subscriber registry: eventType -> [handler]
const subscribers = new Map();

// Register a handler for an event type
function on(eventType, handler) {
  if (!subscribers.has(eventType)) subscribers.set(eventType, []);
  subscribers.get(eventType).push(handler);
}

// Emit an event to all registered handlers
async function emit(eventType, payload) {
  // Persist to notification log
  try {
    await query(
      "INSERT INTO notifications (event_type, payload, status) VALUES ($1, $2, $3)",
      [eventType, JSON.stringify(payload), "sent"]
    );
  } catch (err) {
    // Table might not exist yet — log but don't block
    if (!err.message.includes("does not exist")) {
      console.error("[notification] DB log error:", err.message);
    }
  }

  // Broadcast to dashboard via Redis
  broadcast("notification", { eventType, ...payload, ts: Date.now() });

  // Run registered handlers
  const handlers = subscribers.get(eventType) || [];
  const allHandlers = [...handlers, ...(subscribers.get("*") || [])];
  for (const handler of allHandlers) {
    try {
      await handler(eventType, payload);
    } catch (err) {
      console.error("[notification] Handler error for " + eventType + ":", err.message);
    }
  }
}

// Convenience: notify about task completion
async function taskDone(agentId, taskId, summary) {
  await emit("task.done", { agentId, taskId, summary });
}

// Convenience: notify about task failure
async function taskFailed(agentId, taskId, error) {
  await emit("task.failed", { agentId, taskId, error });
}

// Convenience: agent status change
async function agentStatusChanged(agentId, oldStatus, newStatus) {
  await emit("agent.status", { agentId, oldStatus, newStatus });
}

// Built-in: route task events to Telegram for configured channels
async function setupDefaultRoutes() {
  // Load notification config from DB (if table exists)
  let routes = [];
  try {
    routes = await query(
      "SELECT * FROM notification_routes WHERE enabled = true"
    );
  } catch (err) {
    // Table doesn't exist yet — use hardcoded defaults
    console.log("[notification] No routes table, using defaults");
  }

  for (const route of routes) {
    on(route.event_type, async (_type, payload) => {
      if (route.channel === "telegram" && route.telegram_channel_id && route.telegram_chat_id) {
        const text = formatNotification(route.event_type, payload);
        await telegramService.sendNotification(route.telegram_channel_id, route.telegram_chat_id, text);
      }
    });
  }

  // Always log all events
  on("*", async (type, payload) => {
    console.log("[notification] " + type + ":", payload.agentId || "", payload.summary || payload.error || "");
  });
}

function formatNotification(eventType, payload) {
  switch (eventType) {
    case "task.done":
      return "Task erledigt!\nAgent: " + (payload.agentId || "?") + "\nTask: " + (payload.taskId || "?") + "\n" + (payload.summary || "");
    case "task.failed":
      return "Task fehlgeschlagen!\nAgent: " + (payload.agentId || "?") + "\nTask: " + (payload.taskId || "?") + "\nFehler: " + (payload.error || "unbekannt");
    case "agent.status":
      return "Agent Status: " + (payload.agentId || "?") + "\n" + (payload.oldStatus || "?") + " -> " + (payload.newStatus || "?");
    default:
      return eventType + "\n" + JSON.stringify(payload, null, 2);
  }
}

module.exports = { on, emit, taskDone, taskFailed, agentStatusChanged, setupDefaultRoutes, formatNotification };
