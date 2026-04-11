const { query, queryOne } = require('../db');

const DEFAULT_WEIGHTS = Object.freeze({
  success: 0.45,
  quality: 0.30,
  cost: 0.12,
  feedback: 0.08,
  latency: 0.05
});

const DEFAULT_OPTIONS = Object.freeze({
  lookbackDays: 30,
  minSamples: 5,
  explorationRate: 0.1,
  normalizeCostUsd: 0.05,
  normalizeLatencyMs: 15000,
  fallbackScore: 0.5
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value) {
  return value === true;
}

function normalizeQuality(qualityScore) {
  if (qualityScore === null || qualityScore === undefined) return null;
  return clamp(toNumber(qualityScore, 0) / 10, 0, 1);
}

function normalizeFeedback(feedbackScore) {
  if (feedbackScore === null || feedbackScore === undefined) return null;
  return clamp((toNumber(feedbackScore, 0) + 1) / 2, 0, 1);
}

function normalizeCost(costUsd, normalizeCostUsd) {
  if (costUsd === null || costUsd === undefined) return null;
  const v = toNumber(costUsd, 0);
  if (v <= 0) return 1;
  return clamp(1 - (v / normalizeCostUsd), 0, 1);
}

function normalizeLatency(latencyMs, normalizeLatencyMs) {
  if (latencyMs === null || latencyMs === undefined) return null;
  const v = toNumber(latencyMs, 0);
  if (v <= 0) return 1;
  return clamp(1 - (v / normalizeLatencyMs), 0, 1);
}

function compactRouteKey(parts) {
  return parts.filter(Boolean).join('|');
}

function buildRouteKey(input) {
  if (input.routeKey) return String(input.routeKey);
  return compactRouteKey([
    input.taskType || input.task_type || 'unknown',
    input.priority || 'balanced',
    bool(input.localOnly || input.local_only) ? 'local' : 'any',
    input.provider || 'na',
    input.model || input.modelId || 'na'
  ]);
}

function composeFromRuntime(result, context) {
  const provider = result.provider || result._provider || context.provider || null;
  const model = result.model || result.modelId || result._model || context.model || null;

  return {
    routeKey: buildRouteKey({
      routeKey: result.routeKey || context.routeKey,
      taskType: context.taskType,
      priority: context.priority,
      localOnly: context.localOnly,
      provider,
      model
    }),
    taskType: context.taskType || null,
    provider,
    model,
    priority: context.priority || 'balanced',
    localOnly: bool(context.localOnly),
    success: bool(result.success),
    qualityScore: result.qualityScore,
    feedbackScore: result.feedbackScore,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs || result._latencyMs,
    meta: result.meta || null
  };
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_routing_feedback (
      id BIGSERIAL PRIMARY KEY,
      route_key TEXT NOT NULL,
      task_type TEXT,
      provider TEXT,
      model TEXT,
      priority TEXT,
      local_only BOOLEAN DEFAULT FALSE,
      success BOOLEAN NOT NULL,
      quality_score NUMERIC(5,2),
      feedback_score NUMERIC(5,2),
      cost_usd NUMERIC(12,6),
      latency_ms INTEGER,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function addFeedback(record) {
  const payload = {
    routeKey: buildRouteKey(record),
    taskType: record.taskType || record.task_type || null,
    provider: record.provider || null,
    model: record.model || record.modelId || null,
    priority: record.priority || 'balanced',
    localOnly: bool(record.localOnly || record.local_only),
    success: bool(record.success),
    qualityScore: record.qualityScore,
    feedbackScore: record.feedbackScore,
    costUsd: record.costUsd,
    latencyMs: record.latencyMs,
    meta: record.meta || null
  };

  return queryOne(
    `INSERT INTO ai_routing_feedback
      (route_key, task_type, provider, model, priority, local_only, success, quality_score, feedback_score, cost_usd, latency_ms, meta)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      payload.routeKey,
      payload.taskType,
      payload.provider,
      payload.model,
      payload.priority,
      payload.localOnly,
      payload.success,
      payload.qualityScore,
      payload.feedbackScore,
      payload.costUsd,
      payload.latencyMs,
      payload.meta
    ]
  );
}

async function addRuntimeFeedback(result, context) {
  return addFeedback(composeFromRuntime(result || {}, context || {}));
}

async function getRouteStats(routeKey, opts) {
  const options = Object.assign({}, DEFAULT_OPTIONS, opts || {});
  return queryOne(
    `SELECT
      COUNT(*)::int AS samples,
      AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) AS success_rate,
      AVG(quality_score) AS avg_quality_score,
      AVG(feedback_score) AS avg_feedback_score,
      AVG(cost_usd) AS avg_cost_usd,
      AVG(latency_ms) AS avg_latency_ms,
      MAX(created_at) AS last_seen
     FROM ai_routing_feedback
     WHERE route_key = $1
       AND created_at >= NOW() - ($2::text || ' days')::interval`,
    [routeKey, String(options.lookbackDays)]
  );
}

function computeRouteScore(stats, opts) {
  const options = Object.assign({}, DEFAULT_OPTIONS, opts || {});
  const weights = Object.assign({}, DEFAULT_WEIGHTS, (opts && opts.weights) || {});

  const samples = toNumber(stats && stats.samples, 0);
  if (samples <= 0) {
    return {
      score: options.fallbackScore,
      confidence: 0,
      samples: 0,
      breakdown: {
        success: options.fallbackScore,
        quality: options.fallbackScore,
        cost: options.fallbackScore,
        feedback: options.fallbackScore,
        latency: options.fallbackScore
      }
    };
  }

  const success = clamp(toNumber(stats.success_rate, 0), 0, 1);
  const quality = normalizeQuality(stats.avg_quality_score);
  const feedback = normalizeFeedback(stats.avg_feedback_score);
  const cost = normalizeCost(stats.avg_cost_usd, options.normalizeCostUsd);
  const latency = normalizeLatency(stats.avg_latency_ms, options.normalizeLatencyMs);

  const breakdown = {
    success,
    quality: quality === null ? success : quality,
    cost: cost === null ? success : cost,
    feedback: feedback === null ? success : feedback,
    latency: latency === null ? success : latency
  };

  const weighted = (
    breakdown.success * weights.success +
    breakdown.quality * weights.quality +
    breakdown.cost * weights.cost +
    breakdown.feedback * weights.feedback +
    breakdown.latency * weights.latency
  );

  const confidence = clamp(samples / Math.max(options.minSamples, 1), 0, 1);
  const score = clamp((weighted * confidence) + (options.fallbackScore * (1 - confidence)), 0, 1);

  return {
    score,
    confidence,
    samples,
    breakdown
  };
}

async function scoreRoute(routeKey, opts) {
  const stats = await getRouteStats(routeKey, opts);
  return computeRouteScore(stats || {}, opts);
}

function candidateToRouteKey(candidate, context) {
  return buildRouteKey({
    routeKey: candidate.routeKey,
    taskType: context.taskType,
    priority: context.priority,
    localOnly: context.localOnly,
    provider: candidate.provider,
    model: candidate.model || candidate.modelId || candidate.id
  });
}

async function rankCandidates(candidates, context, opts) {
  const options = Object.assign({}, DEFAULT_OPTIONS, opts || {});
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const scored = [];
  for (const candidate of candidates) {
    const routeKey = candidateToRouteKey(candidate, context || {});
    const learning = await scoreRoute(routeKey, options);

    const qualityHint = clamp(toNumber(candidate.qualityScore, 5) / 10, 0, 1);
    const costHint = clamp(1 - (toNumber(candidate.costScore, 5) / 10), 0, 1);
    const latencyHint = clamp(1 - (toNumber(candidate.latencyScore, 5) / 10), 0, 1);

    const staticHint = (qualityHint * 0.6) + (costHint * 0.25) + (latencyHint * 0.15);
    const finalScore = clamp((learning.score * 0.75) + (staticHint * 0.25), 0, 1);

    scored.push({
      candidate,
      routeKey,
      finalScore,
      learning,
      staticHint
    });
  }

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const shouldExplore = Math.random() < options.explorationRate;
  if (shouldExplore && scored.length > 1) {
    const probeIdx = 1 + Math.floor(Math.random() * (scored.length - 1));
    const picked = scored.splice(probeIdx, 1)[0];
    scored.unshift(picked);
  }

  return scored;
}

async function chooseCandidate(candidates, context, opts) {
  const ranked = await rankCandidates(candidates, context, opts);
  if (!ranked.length) return null;

  const best = ranked[0];
  return {
    candidate: best.candidate,
    routeKey: best.routeKey,
    score: best.finalScore,
    learning: best.learning,
    alternatives: ranked.slice(1).map((r) => ({
      candidate: r.candidate,
      routeKey: r.routeKey,
      score: r.finalScore,
      learning: r.learning
    }))
  };
}

module.exports = {
  DEFAULT_WEIGHTS,
  DEFAULT_OPTIONS,
  ensureTable,
  buildRouteKey,
  addFeedback,
  addRuntimeFeedback,
  getRouteStats,
  computeRouteScore,
  scoreRoute,
  rankCandidates,
  chooseCandidate
};
