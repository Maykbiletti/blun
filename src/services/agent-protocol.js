// BLUN - AI Organisator | MIT License
// Agent Protocol — standardized message format for agent-to-platform communication
// Defines message types, validation, and helpers for the BLUN agent wire protocol

// All valid message types agents can send/receive
const MESSAGE_TYPES = {
  // Agent -> Platform
  AGENT_MESSAGE:    "agent.message",
  AGENT_STATUS:     "agent.status",
  TOOL_START:       "agent.tool.start",
  TOOL_RESULT:      "agent.tool.result",
  COST_REPORT:      "cost.report",
  TASK_DONE:        "task.done",
  TASK_FAILED:      "task.failed",
  TASK_PROGRESS:    "task.progress",
  HEARTBEAT:        "agent.heartbeat",

  // Platform -> Agent
  USER_MESSAGE:     "user.message",
  TASK_ASSIGN:      "task.assign",
  TASK_CANCEL:      "task.cancel",
  CONFIG_UPDATE:    "config.update",
  SHUTDOWN:         "agent.shutdown",
};

// Validate an incoming agent message — returns { valid, error? }
function validate(msg) {
  if (!msg || typeof msg !== "object") return { valid: false, error: "Message must be an object" };
  if (!msg.type || typeof msg.type !== "string") return { valid: false, error: "Missing or invalid type" };
  if (!msg.payload || typeof msg.payload !== "object") return { valid: false, error: "Missing or invalid payload" };

  // Type-specific validation
  switch (msg.type) {
    case MESSAGE_TYPES.AGENT_MESSAGE:
      if (!msg.payload.conversationId) return { valid: false, error: "agent.message requires conversationId" };
      if (!msg.payload.body) return { valid: false, error: "agent.message requires body" };
      break;
    case MESSAGE_TYPES.TOOL_START:
      if (!msg.payload.executionId) return { valid: false, error: "tool.start requires executionId" };
      if (!msg.payload.toolName) return { valid: false, error: "tool.start requires toolName" };
      break;
    case MESSAGE_TYPES.TOOL_RESULT:
      if (!msg.payload.executionId) return { valid: false, error: "tool.result requires executionId" };
      break;
    case MESSAGE_TYPES.COST_REPORT:
      if (typeof msg.payload.costCents !== "number") return { valid: false, error: "cost.report requires costCents (number)" };
      break;
    case MESSAGE_TYPES.TASK_DONE:
    case MESSAGE_TYPES.TASK_FAILED:
      if (!msg.payload.taskId) return { valid: false, error: msg.type + " requires taskId" };
      break;
    case MESSAGE_TYPES.TASK_PROGRESS:
      if (!msg.payload.taskId) return { valid: false, error: "task.progress requires taskId" };
      if (typeof msg.payload.percent !== "number") return { valid: false, error: "task.progress requires percent (number)" };
      break;
    case MESSAGE_TYPES.HEARTBEAT:
      break;
    default:
      // Unknown types pass through — extensible protocol
      break;
  }

  return { valid: true };
}

// Build a protocol-conformant message
function createMessage(type, payload) {
  return { type, payload, ts: Date.now() };
}

// Convenience builders
function agentMessage(conversationId, body, metadata) {
  return createMessage(MESSAGE_TYPES.AGENT_MESSAGE, { conversationId, body, metadata });
}

function toolStart(executionId, toolName, input) {
  return createMessage(MESSAGE_TYPES.TOOL_START, { executionId, toolName, input });
}

function toolResult(executionId, output, status) {
  return createMessage(MESSAGE_TYPES.TOOL_RESULT, { executionId, output, status: status || "done" });
}

function taskDone(taskId, summary) {
  return createMessage(MESSAGE_TYPES.TASK_DONE, { taskId, summary });
}

function taskFailed(taskId, error) {
  return createMessage(MESSAGE_TYPES.TASK_FAILED, { taskId, error });
}

function taskProgress(taskId, percent, detail) {
  return createMessage(MESSAGE_TYPES.TASK_PROGRESS, { taskId, percent, detail });
}

function heartbeat(agentId, status) {
  return createMessage(MESSAGE_TYPES.HEARTBEAT, { agentId, status: status || "alive" });
}

function costReport(provider, model, inputTokens, outputTokens, costCents) {
  return createMessage(MESSAGE_TYPES.COST_REPORT, { provider, model, inputTokens, outputTokens, costCents });
}

function userMessage(conversationId, body) {
  return createMessage(MESSAGE_TYPES.USER_MESSAGE, { conversationId, body });
}

function taskAssign(taskId, agentId, instructions) {
  return createMessage(MESSAGE_TYPES.TASK_ASSIGN, { taskId, agentId, instructions });
}

module.exports = {
  MESSAGE_TYPES,
  validate,
  createMessage,
  agentMessage,
  toolStart,
  toolResult,
  taskDone,
  taskFailed,
  taskProgress,
  heartbeat,
  costReport,
  userMessage,
  taskAssign,
};
