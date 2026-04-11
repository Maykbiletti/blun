var express = require("express");
var db = require("../db");

var SUCCESS_STATUSES = ["completed", "success"];
var FAILURE_STATUSES = ["failed", "error", "timeout", "cancelled", "completed_no_code"];
var OPEN_STATUSES = ["pending", "processing", "in_progress", "retry"];

function toNumber(value, digits) {
  var num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  if (typeof digits === "number") return Number(num.toFixed(digits));
  return num;
}

function toInt(value) {
  var num = parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
}

function clamp(n, min, max) {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function listToInPlaceholders(values, params) {
  if (!Array.isArray(values) || values.length === 0) return "NULL";
  var placeholders = [];
  for (var i = 0; i < values.length; i++) {
    params.push(values[i]);
    placeholders.push("$" + params.length);
  }
  return placeholders.join(", ");
}

function parseLimit(raw, fallback) {
  var n = toInt(raw || fallback);
  if (!n) return fallback;
  return clamp(n, 1, 200);
}

async function fetchAgentMetrics(options) {
  options = options || {};

  var params = [];
  var taskJoinFilters = [];
  var agentFilters = [];

  var successIn = listToInPlaceholders(SUCCESS_STATUSES, params);
  var failureIn = listToInPlaceholders(FAILURE_STATUSES, params);
  var openIn = listToInPlaceholders(OPEN_STATUSES, params);

  if (options.company_id) {
    params.push(options.company_id);
    agentFilters.push("a.company_id = $" + params.length);
  }

  if (options.agent_id) {
    params.push(options.agent_id);
    agentFilters.push("a.id = $" + params.length);
  }

  if (options.from) {
    params.push(options.from);
    taskJoinFilters.push("t.created_at >= $" + params.length);
  }

  if (options.to) {
    params.push(options.to);
    taskJoinFilters.push("t.created_at <= $" + params.length);
  }

  var onlyActive = String(options.only_active || "").toLowerCase();
  if (onlyActive === "1" || onlyActive === "true") {
    agentFilters.push("COALESCE(a.status, '') = 'active'");
  }

  var taskFilterSql = taskJoinFilters.length ? (" AND " + taskJoinFilters.join(" AND ")) : "";
  var agentFilterSql = agentFilters.length ? ("WHERE " + agentFilters.join(" AND ")) : "";

  params.push(parseLimit(options.limit, 100));
  var limitParam = "$" + params.length;

  var sql =
    "SELECT " +
    "a.id AS agent_id, " +
    "a.name AS agent_name, " +
    "a.department, " +
    "a.status AS agent_status, " +
    "COUNT(t.id)::int AS total_tasks, " +
    "COUNT(t.id) FILTER (WHERE lower(COALESCE(t.status, '')) IN (" + successIn + "))::int AS completed_tasks, " +
    "COUNT(t.id) FILTER (WHERE lower(COALESCE(t.status, '')) IN (" + failureIn + "))::int AS error_tasks, " +
    "COUNT(t.id) FILTER (WHERE lower(COALESCE(t.status, '')) IN (" + openIn + "))::int AS open_tasks, " +
    "COUNT(t.id) FILTER (WHERE t.completed_at IS NOT NULL)::int AS finished_tasks, " +
    "MAX(t.created_at) AS latest_task_created_at, " +
    "MAX(t.completed_at) AS latest_task_completed_at, " +
    "COUNT(*) FILTER (WHERE t.completed_at IS NOT NULL AND t.created_at IS NOT NULL AND t.completed_at >= t.created_at)::int AS duration_samples, " +
    "COALESCE(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) FILTER (WHERE t.completed_at IS NOT NULL AND t.created_at IS NOT NULL AND t.completed_at >= t.created_at), 0)::numeric AS avg_duration_seconds, " +
    "COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) FILTER (WHERE t.completed_at IS NOT NULL AND t.created_at IS NOT NULL AND t.completed_at >= t.created_at), 0)::numeric AS p50_duration_seconds, " +
    "COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) FILTER (WHERE t.completed_at IS NOT NULL AND t.created_at IS NOT NULL AND t.completed_at >= t.created_at), 0)::numeric AS p95_duration_seconds " +
    "FROM blun_agents a " +
    "LEFT JOIN agent_tasks t ON t.agent_id = a.id" + taskFilterSql + " " +
    agentFilterSql + " " +
    "GROUP BY a.id, a.name, a.department, a.status " +
    "ORDER BY total_tasks DESC, a.name ASC " +
    "LIMIT " + limitParam;

  var rows = await db.query(sql, params);

  var agents = [];
  var totals = {
    total_agents: 0,
    active_agents: 0,
    total_tasks: 0,
    completed_tasks: 0,
    error_tasks: 0,
    open_tasks: 0,
    finished_tasks: 0,
    errors: 0,
    task_completion_rate: 0,
    error_rate: 0,
    avg_duration: 0,
    avg_duration_seconds: 0,
    avg_duration_milliseconds: 0,
    p50_duration_seconds: 0,
    p95_duration_seconds: 0,
    throughput_tasks_per_hour: 0
  };

  var weightedDurationSum = 0;
  var weightedP50Sum = 0;
  var weightedP95Sum = 0;
  var weightedDurationSamples = 0;

  var nowMs = Date.now();

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var totalTasks = toInt(row.total_tasks);
    var completedTasks = toInt(row.completed_tasks);
    var errorTasks = toInt(row.error_tasks);
    var openTasks = toInt(row.open_tasks);
    var finishedTasks = toInt(row.finished_tasks);
    var durationSamples = toInt(row.duration_samples);

    var avgDurationSeconds = toNumber(row.avg_duration_seconds, 2);
    var p50DurationSeconds = toNumber(row.p50_duration_seconds, 2);
    var p95DurationSeconds = toNumber(row.p95_duration_seconds, 2);

    var completionRate = totalTasks > 0 ? toNumber(completedTasks / totalTasks, 4) : 0;
    var errorRate = totalTasks > 0 ? toNumber(errorTasks / totalTasks, 4) : 0;

    var latestCreatedAt = row.latest_task_created_at ? new Date(row.latest_task_created_at).toISOString() : null;
    var latestCompletedAt = row.latest_task_completed_at ? new Date(row.latest_task_completed_at).toISOString() : null;

    var sinceLatestMinutes = null;
    if (row.latest_task_created_at) {
      var latestMs = new Date(row.latest_task_created_at).getTime();
      if (Number.isFinite(latestMs)) sinceLatestMinutes = toNumber((nowMs - latestMs) / 60000, 1);
    }

    var throughputPerHour = 0;
    if (options.from && options.to) {
      var fromMs = new Date(options.from).getTime();
      var toMs = new Date(options.to).getTime();
      var hours = (toMs - fromMs) / 3600000;
      if (Number.isFinite(hours) && hours > 0) throughputPerHour = toNumber(completedTasks / hours, 3);
    }

    if (durationSamples > 0) {
      weightedDurationSum += avgDurationSeconds * durationSamples;
      weightedP50Sum += p50DurationSeconds * durationSamples;
      weightedP95Sum += p95DurationSeconds * durationSamples;
      weightedDurationSamples += durationSamples;
    }

    totals.total_tasks += totalTasks;
    totals.completed_tasks += completedTasks;
    totals.error_tasks += errorTasks;
    totals.open_tasks += openTasks;
    totals.finished_tasks += finishedTasks;
    totals.errors += errorTasks;
    totals.total_agents += 1;
    if (String(row.agent_status || "") === "active") totals.active_agents += 1;

    agents.push({
      agent_id: toInt(row.agent_id),
      agent_name: row.agent_name,
      department: row.department,
      agent_status: row.agent_status,
      task_completion_rate: completionRate,
      error_rate: errorRate,
      avg_duration: avgDurationSeconds,
      avg_duration_seconds: avgDurationSeconds,
      avg_duration_milliseconds: toNumber(avgDurationSeconds * 1000, 0),
      p50_duration_seconds: p50DurationSeconds,
      p95_duration_seconds: p95DurationSeconds,
      throughput_tasks_per_hour: throughputPerHour,
      errors: errorTasks,
      last_activity: {
        latest_task_created_at: latestCreatedAt,
        latest_task_completed_at: latestCompletedAt,
        minutes_since_latest_task: sinceLatestMinutes
      },
      totals: {
        tasks: totalTasks,
        completed: completedTasks,
        errors: errorTasks,
        open: openTasks,
        finished: finishedTasks
      }
    });
  }

  totals.task_completion_rate =
    totals.total_tasks > 0 ? toNumber(totals.completed_tasks / totals.total_tasks, 4) : 0;
  totals.error_rate = totals.total_tasks > 0 ? toNumber(totals.error_tasks / totals.total_tasks, 4) : 0;

  totals.avg_duration_seconds =
    weightedDurationSamples > 0 ? toNumber(weightedDurationSum / weightedDurationSamples, 2) : 0;
  totals.avg_duration = totals.avg_duration_seconds;
  totals.avg_duration_milliseconds = toNumber(totals.avg_duration_seconds * 1000, 0);
  totals.p50_duration_seconds =
    weightedDurationSamples > 0 ? toNumber(weightedP50Sum / weightedDurationSamples, 2) : 0;
  totals.p95_duration_seconds =
    weightedDurationSamples > 0 ? toNumber(weightedP95Sum / weightedDurationSamples, 2) : 0;

  if (options.from && options.to) {
    var fromMsGlobal = new Date(options.from).getTime();
    var toMsGlobal = new Date(options.to).getTime();
    var globalHours = (toMsGlobal - fromMsGlobal) / 3600000;
    if (Number.isFinite(globalHours) && globalHours > 0) {
      totals.throughput_tasks_per_hour = toNumber(totals.completed_tasks / globalHours, 3);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    metric_keys: [
      "task_completion_rate",
      "error_rate",
      "avg_duration_seconds",
      "p50_duration_seconds",
      "p95_duration_seconds",
      "throughput_tasks_per_hour",
      "errors"
    ],
    filters: {
      company_id: options.company_id || null,
      agent_id: options.agent_id || null,
      from: options.from || null,
      to: options.to || null,
      only_active: onlyActive === "1" || onlyActive === "true",
      limit: parseLimit(options.limit, 100)
    },
    totals: totals,
    agents: agents,
    result_len: agents.length
  };
}

async function getAgentMetricsHandler(req, res) {
  try {
    var payload = await fetchAgentMetrics({
      company_id: req.query.company_id || null,
      agent_id: req.query.agent_id || null,
      from: req.query.from || null,
      to: req.query.to || null,
      only_active: req.query.only_active || null,
      limit: req.query.limit || null
    });

    res.json(payload);
  } catch (err) {
    console.error("[dieter-metrics] GET /metrics/agents failed:", err.message);
    res.status(500).json({ error: "Failed to load agent metrics" });
  }
}

var router = express.Router();
router.get("/metrics/agents", getAgentMetricsHandler);

module.exports = {
  router: router,
  fetchAgentMetrics: fetchAgentMetrics,
  getAgentMetricsHandler: getAgentMetricsHandler
};
