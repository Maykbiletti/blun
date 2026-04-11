"use strict";

function toNumber(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : (fallback || 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeDivide(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function round(value, decimals) {
  var factor = Math.pow(10, decimals || 2);
  return Math.round(value * factor) / factor;
}

function normalizeStatus(status) {
  if (!status) return "unknown";
  return String(status).trim().toLowerCase();
}

function createEmptyStats() {
  return {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    pending: 0,
    scoreSum: 0,
    scoreCount: 0,
    durationSumMs: 0,
    durationCount: 0,
    retriesSum: 0,
    retriesCount: 0
  };
}

function consumeTask(stats, task) {
  stats.total += 1;

  var status = normalizeStatus(task.status);
  if (status === "completed") stats.completed += 1;
  else if (status === "failed" || status === "error") stats.failed += 1;
  else if (status === "in_progress" || status === "processing") stats.inProgress += 1;
  else if (status === "pending") stats.pending += 1;

  if (task.score !== null && task.score !== undefined) {
    stats.scoreSum += toNumber(task.score, 0);
    stats.scoreCount += 1;
  }

  if (task.durationMs !== null && task.durationMs !== undefined) {
    stats.durationSumMs += Math.max(0, toNumber(task.durationMs, 0));
    stats.durationCount += 1;
  }

  if (task.retries !== null && task.retries !== undefined) {
    stats.retriesSum += Math.max(0, toNumber(task.retries, 0));
    stats.retriesCount += 1;
  }
}

function finalizeStats(stats) {
  var completionRate = safeDivide(stats.completed, stats.total);
  var failureRate = safeDivide(stats.failed, stats.total);
  var avgScore = safeDivide(stats.scoreSum, stats.scoreCount);
  var avgDurationMs = safeDivide(stats.durationSumMs, stats.durationCount);
  var avgRetries = safeDivide(stats.retriesSum, stats.retriesCount);

  var scoreNormalized = clamp(avgScore / 10, 0, 1);
  var speedFactor = clamp(1 - safeDivide(avgDurationMs, 1800000), 0, 1);
  var retryPenalty = clamp(avgRetries / 4, 0, 1);

  var performanceIndex = clamp(
    (completionRate * 0.45) +
    (scoreNormalized * 0.30) +
    (speedFactor * 0.20) -
    (failureRate * 0.20) -
    (retryPenalty * 0.10),
    0,
    1
  );

  return {
    total: stats.total,
    completed: stats.completed,
    failed: stats.failed,
    inProgress: stats.inProgress,
    pending: stats.pending,
    completionRate: round(completionRate, 4),
    failureRate: round(failureRate, 4),
    avgScore: round(avgScore, 2),
    avgDurationMs: Math.round(avgDurationMs),
    avgRetries: round(avgRetries, 2),
    performanceIndex: round(performanceIndex, 4)
  };
}

function computeTrend(currentIndex, previousIndex) {
  if (!Number.isFinite(currentIndex) || !Number.isFinite(previousIndex)) {
    return { direction: "flat", delta: 0 };
  }
  var delta = round(currentIndex - previousIndex, 4);
  if (delta > 0.01) return { direction: "up", delta: delta };
  if (delta < -0.01) return { direction: "down", delta: delta };
  return { direction: "flat", delta: delta };
}

function aggregateAgentPerformance(tasks, options) {
  options = options || {};
  var byAgent = {};

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i] || {};
    var agentId = String(task.agentId || task.agent_id || "unknown");
    if (!byAgent[agentId]) byAgent[agentId] = createEmptyStats();
    consumeTask(byAgent[agentId], task);
  }

  var previousSnapshot = options.previousByAgent || {};
  var result = [];

  var agentIds = Object.keys(byAgent);
  for (var j = 0; j < agentIds.length; j++) {
    var id = agentIds[j];
    var finalized = finalizeStats(byAgent[id]);
    var previous = toNumber(previousSnapshot[id], finalized.performanceIndex);
    var trend = computeTrend(finalized.performanceIndex, previous);

    result.push({
      agentId: id,
      metrics: finalized,
      trend: trend
    });
  }

  result.sort(function(a, b) {
    if (b.metrics.performanceIndex !== a.metrics.performanceIndex) {
      return b.metrics.performanceIndex - a.metrics.performanceIndex;
    }
    return b.metrics.completionRate - a.metrics.completionRate;
  });

  return result;
}

function buildLeaderboardRows(aggregated, limit) {
  var max = Math.max(1, toNumber(limit, 10));
  var rows = [];

  for (var i = 0; i < aggregated.length && rows.length < max; i++) {
    var row = aggregated[i];
    rows.push({
      rank: rows.length + 1,
      agentId: row.agentId,
      performanceIndex: row.metrics.performanceIndex,
      completionRate: row.metrics.completionRate,
      avgScore: row.metrics.avgScore,
      trend: row.trend.direction
    });
  }

  return rows;
}

module.exports = {
  aggregateAgentPerformance: aggregateAgentPerformance,
  buildLeaderboardRows: buildLeaderboardRows,
  computeTrend: computeTrend
};
