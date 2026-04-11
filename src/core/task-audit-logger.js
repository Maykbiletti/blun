"use strict";

const { query } = require("../db");

const TRACKED_TASK_STATES = new Set(["pending", "processing", "completed", "failed"]);

function normalizeState(state) {
  if (typeof state !== "string") return "";
  return state.trim().toLowerCase();
}

function shouldLogTaskStateChange(fromState, toState) {
  const from = normalizeState(fromState);
  const to = normalizeState(toState);

  if (!from || !to) return false;
  if (from === to) return false;
  if (!TRACKED_TASK_STATES.has(from) || !TRACKED_TASK_STATES.has(to)) return false;

  return true;
}

async function insertAuditLogWithFallbacks(queryFn, payload) {
  const statements = [
    {
      sql: "INSERT INTO audit_logs (task_id, agent_id, from_state, to_state, timestamp) VALUES ($1, $2, $3, $4, $5)",
      params: [payload.taskId, payload.agentId, payload.fromState, payload.toState, payload.timestamp]
    },
    {
      sql: "INSERT INTO audit_logs (task_id, agent_id, from_state, to_state, created_at) VALUES ($1, $2, $3, $4, $5)",
      params: [payload.taskId, payload.agentId, payload.fromState, payload.toState, payload.timestamp]
    },
    {
      sql: "INSERT INTO audit_logs (task_id, agent_id, from_state, to_state, changed_at) VALUES ($1, $2, $3, $4, $5)",
      params: [payload.taskId, payload.agentId, payload.fromState, payload.toState, payload.timestamp]
    },
    {
      sql: "INSERT INTO audit_logs (task_id, agent_id, old_state, new_state, timestamp) VALUES ($1, $2, $3, $4, $5)",
      params: [payload.taskId, payload.agentId, payload.fromState, payload.toState, payload.timestamp]
    },
    {
      sql: "INSERT INTO audit_logs (task_id, agent_id, old_status, new_status, timestamp) VALUES ($1, $2, $3, $4, $5)",
      params: [payload.taskId, payload.agentId, payload.fromState, payload.toState, payload.timestamp]
    }
  ];

  let lastError = null;

  for (let i = 0; i < statements.length; i++) {
    try {
      await queryFn(statements[i].sql, statements[i].params);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

async function logTaskStateChange(input, queryFn = query) {
  if (!input || typeof input !== "object") {
    throw new Error("logTaskStateChange requires an input object");
  }

  const taskId = input.taskId;
  const agentId = input.agentId;
  const fromState = normalizeState(input.fromState);
  const toState = normalizeState(input.toState);
  const timestamp = input.timestamp || new Date().toISOString();

  if (!taskId) {
    throw new Error("taskId is required");
  }

  if (!agentId) {
    throw new Error("agentId is required");
  }

  if (!shouldLogTaskStateChange(fromState, toState)) {
    return { logged: false, reason: "not-a-tracked-transition" };
  }

  await insertAuditLogWithFallbacks(queryFn, {
    taskId,
    agentId,
    fromState,
    toState,
    timestamp
  });

  return {
    logged: true,
    taskId,
    agentId,
    fromState,
    toState,
    timestamp
  };
}

module.exports = {
  TRACKED_TASK_STATES,
  shouldLogTaskStateChange,
  logTaskStateChange
};
