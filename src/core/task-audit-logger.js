"use strict";

var TRACKED_STATUSES = ["pending", "processing", "completed", "failed"];
var ALLOWED_TRANSITIONS = {
  pending: ["processing"],
  processing: ["completed", "failed"]
};

function normalizeStatus(status) {
  if (!status || typeof status !== "string") return "";
  return status.trim().toLowerCase();
}

function isTrackedStatus(status) {
  return TRACKED_STATUSES.indexOf(normalizeStatus(status)) !== -1;
}

function isAllowedTransition(fromStatus, toStatus) {
  var from = normalizeStatus(fromStatus);
  var to = normalizeStatus(toStatus);
  var allowedTargets = ALLOWED_TRANSITIONS[from] || [];
  return allowedTargets.indexOf(to) !== -1;
}

function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return new Date(value);
}

async function logTaskStateChange(queryFn, change) {
  if (typeof queryFn !== "function") {
    throw new Error("task-audit-logger: queryFn must be a function");
  }

  if (!change || typeof change !== "object") {
    throw new Error("task-audit-logger: change object is required");
  }

  var taskId = change.taskId;
  var agentId = change.agentId;
  var fromStatus = normalizeStatus(change.fromStatus);
  var toStatus = normalizeStatus(change.toStatus);
  var timestamp = toDate(change.timestamp);
  var meta = change.meta || {};

  if (!taskId) {
    throw new Error("task-audit-logger: taskId is required");
  }

  if (!agentId) {
    throw new Error("task-audit-logger: agentId is required");
  }

  if (!isTrackedStatus(fromStatus) || !isTrackedStatus(toStatus)) {
    return { logged: false, reason: "status_not_tracked" };
  }

  if (!isAllowedTransition(fromStatus, toStatus)) {
    return { logged: false, reason: "transition_not_allowed" };
  }

  if (fromStatus === toStatus) {
    return { logged: false, reason: "no_change" };
  }

  var sql = "INSERT INTO audit_logs " +
    "(task_id, agent_id, from_status, to_status, changed_at, meta) " +
    "VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *";

  var params = [
    taskId,
    agentId,
    fromStatus,
    toStatus,
    timestamp,
    JSON.stringify(meta)
  ];

  var rows = await queryFn(sql, params);
  var row = Array.isArray(rows) ? rows[0] : (rows && rows.rows ? rows.rows[0] : rows);

  return {
    logged: true,
    row: row || null
  };
}

module.exports = {
  TRACKED_STATUSES: TRACKED_STATUSES,
  isTrackedStatus: isTrackedStatus,
  isAllowedTransition: isAllowedTransition,
  logTaskStateChange: logTaskStateChange
};
