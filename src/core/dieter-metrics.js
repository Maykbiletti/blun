const { query } = require("../db");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 2);
  return Math.round((Number(value) || 0) * factor) / factor;
}

function safeDiv(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function buildWhereClause(companyId) {
  if (!companyId) {
    return {
      taskScope: "",
      heartbeatScope: "",
      params: []
    };
  }

  return {
    taskScope: " AND a.company_id = $2 ",
    heartbeatScope: " AND a.company_id = $2 ",
    params: [companyId]
  };
}

function calculateScores(row) {
  const totalTasks = Number(row.total_tasks) || 0;
  const completed = Number(row.completed_tasks) || 0;
  const failed = Number(row.failed_tasks) || 0;
  const noCode = Number(row.no_code_tasks) || 0;

  const successRate = safeDiv(completed, totalTasks);
  const failureRate = safeDiv(failed, totalTasks);
  const noCodeRate = safeDiv(noCode, totalTasks);

  const avgScore = Number(row.avg_score) || 0;
  const completionSeconds = Number(row.avg_completion_seconds) || 0;
  const resultLen = Number(row.avg_result_len) || 0;
  const errorHeartbeats = Number(row.error_heartbeats) || 0;
  const totalHeartbeats = Number(row.total_heartbeats) || 0;

  const qualityIndex = clamp((avgScore / 10) * 100, 0, 100);
  const reliabilityPenalty = failureRate * 45 + noCodeRate * 40 + safeDiv(errorHeartbeats, Math.max(totalHeartbeats, 1)) * 15;
  const reliabilityIndex = clamp(100 - reliabilityPenalty * 100, 0, 100);

  const completionBonus = completionSeconds > 0 ? clamp(100 - (completionSeconds / 3600) * 10, 20, 100) : 35;
  const outputBonus = clamp((resultLen / 1200) * 100, 10, 100);
  const throughputIndex = clamp(successRate * 60 + completionBonus * 0.2 + outputBonus * 0.2, 0, 100);

  const compositeScore = clamp(
    qualityIndex * 0.45 + reliabilityIndex * 0.35 + throughputIndex * 0.2,
    0,
    100
  );

  return {
    success_rate: round(successRate * 100, 2),
    failure_rate: round(failureRate * 100, 2),
    no_code_rate: round(noCodeRate * 100, 2),
    quality_index: round(qualityIndex, 2),
    reliability_index: round(reliabilityIndex, 2),
    throughput_index: round(throughputIndex, 2),
    composite_score: round(compositeScore, 2)
  };
}

async function fetchAgentPerformanceMetrics(options) {
  const opts = options || {};
  const windowHours = Number(opts.windowHours) > 0 ? Number(opts.windowHours) : 168;
  const companyId = opts.companyId || null;
  const minTasks = Number(opts.minTasks) > 0 ? Number(opts.minTasks) : 0;

  const scope = buildWhereClause(companyId);
  const params = [windowHours].concat(scope.params);

  const sql = `
    SELECT
      a.id AS agent_id,
      a.name AS agent_name,
      a.department,
      COUNT(t.id)::int AS total_tasks,
      COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_tasks,
      COUNT(*) FILTER (WHERE t.status IN ('failed', 'error'))::int AS failed_tasks,
      COUNT(*) FILTER (WHERE t.status = 'completed_no_code')::int AS no_code_tasks,
      COALESCE(AVG(t.score) FILTER (WHERE t.score IS NOT NULL), 0)::float AS avg_score,
      COALESCE(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))) FILTER (WHERE t.completed_at IS NOT NULL), 0)::float AS avg_completion_seconds,
      COALESCE(AVG(LENGTH(COALESCE(t.result, ''))), 0)::float AS avg_result_len,
      COALESCE(MAX(t.completed_at), MAX(t.created_at)) AS last_task_at,
      COALESCE(h.total_heartbeats, 0)::int AS total_heartbeats,
      COALESCE(h.error_heartbeats, 0)::int AS error_heartbeats
    FROM blun_agents a
    LEFT JOIN agent_tasks t
      ON t.agent_id = a.id
      AND t.created_at >= NOW() - ($1::int || ' hours')::interval
    LEFT JOIN (
      SELECT
        hb.agent_id,
        COUNT(*)::int AS total_heartbeats,
        COUNT(*) FILTER (WHERE hb.status = 'error')::int AS error_heartbeats
      FROM agent_heartbeats hb
      JOIN blun_agents a ON a.id = hb.agent_id
      WHERE hb.created_at >= NOW() - ($1::int || ' hours')::interval
      ${scope.heartbeatScope}
      GROUP BY hb.agent_id
    ) h ON h.agent_id = a.id
    WHERE a.id != 1
    ${scope.taskScope}
    GROUP BY a.id, a.name, a.department, h.total_heartbeats, h.error_heartbeats
    ORDER BY a.name ASC
  `;

  const rows = await query(sql, params);
  const filteredRows = rows.filter(function (row) {
    return (Number(row.total_tasks) || 0) >= minTasks;
  });

  const metrics = filteredRows.map(function (row) {
    const scores = calculateScores(row);
    return {
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      department: row.department,
      total_tasks: Number(row.total_tasks) || 0,
      completed_tasks: Number(row.completed_tasks) || 0,
      failed_tasks: Number(row.failed_tasks) || 0,
      no_code_tasks: Number(row.no_code_tasks) || 0,
      avg_score: round(row.avg_score, 2),
      avg_completion_seconds: round(row.avg_completion_seconds, 2),
      avg_result_len: round(row.avg_result_len, 2),
      total_heartbeats: Number(row.total_heartbeats) || 0,
      error_heartbeats: Number(row.error_heartbeats) || 0,
      last_task_at: row.last_task_at,
      success_rate: scores.success_rate,
      failure_rate: scores.failure_rate,
      no_code_rate: scores.no_code_rate,
      quality_index: scores.quality_index,
      reliability_index: scores.reliability_index,
      throughput_index: scores.throughput_index,
      composite_score: scores.composite_score
    };
  });

  metrics.sort(function (a, b) {
    if (b.composite_score !== a.composite_score) {
      return b.composite_score - a.composite_score;
    }
    if (b.success_rate !== a.success_rate) {
      return b.success_rate - a.success_rate;
    }
    return b.total_tasks - a.total_tasks;
  });

  for (let i = 0; i < metrics.length; i++) {
    metrics[i].rank = i + 1;
  }

  return metrics;
}

async function buildPerformanceSummary(options) {
  const metrics = await fetchAgentPerformanceMetrics(options);
  const summary = {
    generated_at: new Date().toISOString(),
    agent_count: metrics.length,
    avg_composite_score: 0,
    avg_success_rate: 0,
    top_agent: null,
    weakest_agent: null,
    metrics: metrics
  };

  if (!metrics.length) return summary;

  const totalComposite = metrics.reduce(function (sum, item) {
    return sum + item.composite_score;
  }, 0);

  const totalSuccessRate = metrics.reduce(function (sum, item) {
    return sum + item.success_rate;
  }, 0);

  summary.avg_composite_score = round(totalComposite / metrics.length, 2);
  summary.avg_success_rate = round(totalSuccessRate / metrics.length, 2);
  summary.top_agent = metrics[0];
  summary.weakest_agent = metrics[metrics.length - 1];

  return summary;
}

module.exports = {
  fetchAgentPerformanceMetrics,
  buildPerformanceSummary
};
