const fs = require('fs');
const path = require('path');

const SUCCESS_STATUSES = new Set(['completed', 'success']);
const FAILURE_STATUSES = new Set(['failed', 'error', 'timeout', 'cancelled']);

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTaskDurationMs(task) {
  const startedAt =
    parseDate(task.started_at) ||
    parseDate(task.startedAt) ||
    parseDate(task.created_at) ||
    parseDate(task.createdAt);

  const endedAt =
    parseDate(task.completed_at) ||
    parseDate(task.completedAt) ||
    parseDate(task.finished_at) ||
    parseDate(task.finishedAt) ||
    parseDate(task.ended_at) ||
    parseDate(task.endedAt);

  if (!startedAt || !endedAt) return null;

  const duration = endedAt.getTime() - startedAt.getTime();
  return duration >= 0 ? duration : null;
}

function toRate(part, total) {
  if (!total) return 0;
  return Number((part / total).toFixed(4));
}

function normalizeStatus(status) {
  if (!status) return 'unknown';
  return String(status).toLowerCase().trim();
}

function getSuccessFailureRatio(successCount, failureCount) {
  if (failureCount === 0) return successCount > 0 ? null : 0;
  return Number((successCount / failureCount).toFixed(4));
}

function generateAgentTaskReport(tasks, options = {}) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const statusCounts = {};

  let completedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let durationTotalMs = 0;
  let durationSamples = 0;

  for (const task of taskList) {
    const status = normalizeStatus(task && task.status);
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (SUCCESS_STATUSES.has(status)) {
      completedCount += 1;
      successCount += 1;
    } else if (FAILURE_STATUSES.has(status)) {
      failureCount += 1;
    }

    const durationMs = getTaskDurationMs(task || {});
    if (durationMs !== null) {
      durationTotalMs += durationMs;
      durationSamples += 1;
    }
  }

  const totalTasks = taskList.length;
  const avgTaskTimeMs = durationSamples
    ? Number((durationTotalMs / durationSamples).toFixed(2))
    : 0;

  const report = {
    generated_at: new Date().toISOString(),
    report_type: 'agent_performance',
    period: {
      from: options.from || null,
      to: options.to || null
    },
    totals: {
      tasks: totalTasks,
      completed: completedCount,
      success: successCount,
      failure: failureCount,
      duration_samples: durationSamples
    },
    metrics: {
      avg_task_time_ms: avgTaskTimeMs,
      avg_task_time_seconds: Number((avgTaskTimeMs / 1000).toFixed(2)),
      completion_rate: toRate(completedCount, totalTasks),
      success_failure_ratio: getSuccessFailureRatio(successCount, failureCount)
    },
    status_breakdown: statusCounts
  };

  return report;
}

function writeAgentTaskReport(outputFilePath, tasks, options = {}) {
  const report = generateAgentTaskReport(tasks, options);
  const targetPath = path.resolve(outputFilePath);
  const dir = path.dirname(targetPath);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  return report;
}

module.exports = {
  generateAgentTaskReport,
  writeAgentTaskReport,
  getTaskDurationMs
};
