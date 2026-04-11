'use strict';

/**
 * BLUN Intelligent Model Router
 * Routes AI requests to the optimal model based on task type, cost budget,
 * latency requirements, quality needs, tool usage, vision, and privacy constraints.
 */

const { MODEL_REGISTRY, CAPABILITIES } = require('./ai-provider');
const { classify, classifyByKeywords, TASK_TYPES } = require('./classifier');
const { estimateTaskCost } = require('./cost-estimator');
const { checkProvider } = require('./provider-health');
const { chooseCandidate, buildRouteKey } = require('./router-learner');

// ── Constraint Defaults ─────────────────────────────────────────

const DEFAULT_CONSTRAINTS = Object.freeze({
  maxCostScore: 10,        // 1=cheapest, 10=most expensive allowed
  maxLatencyScore: 10,     // 1=fastest only, 10=any latency
  minQualityScore: 1,      // 1=any quality, 10=best only
  requireTools: false,     // must support tool_calling
  requireVision: false,    // must support vision
  requireJson: false,      // must support structured JSON output
  requireLongContext: false,// must support long context windows
  localOnly: false,        // only local/on-prem models
  priority: 'balanced',    // speed | quality | cost | balanced
  preferredProvider: null,  // prefer a specific provider (soft constraint)
  excludeProviders: [],    // hard-exclude providers
  excludeModels: [],       // hard-exclude specific models
  privacyLevel: 'standard' // standard | sensitive | restricted
});

// Privacy levels determine which providers are allowed
const PRIVACY_PROVIDER_RULES = {
  standard: null,  // all providers allowed
  sensitive: ['anthropic', 'openai', 'local'],  // only major/local providers
  restricted: ['local']  // only local models
};

// Task-type to required capabilities mapping
const TASK_CAPABILITY_MAP = {
  coding: ['code'],
  writing: ['chat'],
  reasoning: ['reasoning'],
  chat: ['chat'],
  automation: ['code'],
  // Legacy ai-provider task types
  code: ['code'],
  vision: ['vision'],
  translation: ['translation'],
};

// ── Core Router ─────────────────────────────────────────────────

/**
 * Routes a request to the best available model.
 *
 * @param {object} request
 * @param {string} request.prompt - The user prompt / task description
 * @param {string} [request.taskType] - Pre-classified task type (skips classification)
 * @param {string} [request.priority] - speed | quality | cost | balanced
 * @param {boolean} [request.requireTools] - Must support tool_calling
 * @param {boolean} [request.requireVision] - Must support vision
 * @param {boolean} [request.requireJson] - Must support JSON mode
 * @param {boolean} [request.requireLongContext] - Must support long context
 * @param {boolean} [request.localOnly] - Only local models
 * @param {number} [request.maxCostScore] - Max cost score (1-10)
 * @param {number} [request.minQualityScore] - Min quality score (1-10)
 * @param {string} [request.privacyLevel] - standard | sensitive | restricted
 * @param {string} [request.preferredProvider] - Soft preference for provider
 * @param {string[]} [request.excludeProviders] - Providers to exclude
 * @param {string[]} [request.excludeModels] - Models to exclude
 * @param {string} [request.forceModel] - Force a specific model (bypass routing)
 * @param {Function} [request.aiCall] - AI call function for hybrid classification
 * @returns {Promise<RouteResult>}
 */
async function route(request) {
  if (!request || !request.prompt) {
    throw new Error('router.route() requires request.prompt');
  }

  // Force model: skip all routing logic
  if (request.forceModel) {
    return buildForceResult(request.forceModel, request.prompt);
  }

  const constraints = resolveConstraints(request);

  // Step 1: Classify the task
  const classification = await classifyTask(request.prompt, request.taskType, request.aiCall);

  // Step 2: Filter candidates by hard constraints
  const candidates = filterCandidates(classification.type, constraints);

  if (candidates.length === 0) {
    // Relax constraints and try again with just active models
    const relaxed = filterCandidates(null, { ...constraints, minQualityScore: 1, maxCostScore: 10 });
    if (relaxed.length === 0) {
      return {
        model: null,
        provider: null,
        reason: 'no_candidates',
        classification,
        constraints,
        candidates: [],
        alternatives: []
      };
    }
    return buildResult(relaxed, classification, constraints, 'relaxed_constraints');
  }

  // Step 3: Score and rank using router-learner (DB feedback) + static hints
  return buildResult(candidates, classification, constraints, 'routed');
}

// ── Classification ──────────────────────────────────────────────

async function classifyTask(prompt, explicitType, aiCall) {
  if (explicitType && Object.values(TASK_TYPES).includes(explicitType)) {
    return { type: explicitType, confidence: 1.0, method: 'explicit' };
  }

  // Map legacy ai-provider types
  const legacyTypes = ['code', 'vision', 'translation'];
  if (explicitType && legacyTypes.includes(explicitType)) {
    return { type: explicitType, confidence: 1.0, method: 'explicit_legacy' };
  }

  try {
    const result = await classify(prompt, { aiCall, aiThreshold: 0.45, timeout: 4000 });
    return result;
  } catch (_err) {
    const kw = classifyByKeywords(prompt);
    return { type: kw.type, confidence: kw.confidence, method: 'keywords_error_fallback' };
  }
}

// ── Candidate Filtering ─────────────────────────────────────────

function filterCandidates(taskType, constraints) {
  const requiredCaps = [];

  // Map task type to required capabilities
  if (taskType && TASK_CAPABILITY_MAP[taskType]) {
    requiredCaps.push(...TASK_CAPABILITY_MAP[taskType]);
  }

  // Add explicit capability requirements
  if (constraints.requireTools) requiredCaps.push('tool_calling');
  if (constraints.requireVision) requiredCaps.push('vision');
  if (constraints.requireJson) requiredCaps.push('json');
  if (constraints.requireLongContext) requiredCaps.push('long_context');

  // Privacy-based provider allowlist
  const allowedProviders = PRIVACY_PROVIDER_RULES[constraints.privacyLevel] || null;

  const entries = Object.entries(MODEL_REGISTRY);
  const filtered = [];

  for (const [id, model] of entries) {
    // Must be active
    if (model.active === false) continue;

    // Local-only constraint
    if (constraints.localOnly && !model.local) continue;

    // Provider exclusion
    if (constraints.excludeProviders.length && constraints.excludeProviders.includes(model.provider)) continue;

    // Model exclusion
    if (constraints.excludeModels.length && constraints.excludeModels.includes(id)) continue;

    // Privacy provider restriction
    if (allowedProviders && !allowedProviders.includes(model.provider)) continue;

    // Cost ceiling
    if (model.costScore > constraints.maxCostScore) continue;

    // Quality floor
    if (model.qualityScore < constraints.minQualityScore) continue;

    // Latency ceiling (lower latencyScore = slower)
    // maxLatencyScore of 5 means we need latencyScore >= (10 - 5) = 5
    // Actually: latencyScore is already "higher = faster", so we just pass

    // Required capabilities
    const caps = model.capabilities || [];
    const hasAllCaps = requiredCaps.every(c => caps.includes(c));
    if (!hasAllCaps) continue;

    filtered.push({ id, ...model });
  }

  return filtered;
}

// ── Scoring & Ranking ───────────────────────────────────────────

async function buildResult(candidates, classification, constraints, reason) {
  const context = {
    taskType: classification.type,
    priority: constraints.priority,
    localOnly: constraints.localOnly
  };

  // Try learner-based ranking first
  let ranked = null;
  try {
    ranked = await chooseCandidate(candidates, context, { explorationRate: 0.08 });
  } catch (_err) {
    // DB not available — fall through to static ranking
  }

  if (ranked && ranked.candidate) {
    const chosen = ranked.candidate;
    return {
      model: chosen.id || chosen.modelId,
      modelId: chosen.modelId || chosen.id,
      provider: chosen.provider,
      reason,
      classification,
      constraints,
      score: ranked.score,
      learning: ranked.learning,
      costEstimate: safeEstimate(classification.type),
      alternatives: (ranked.alternatives || []).slice(0, 3).map(alt => ({
        model: alt.candidate.id || alt.candidate.modelId,
        provider: alt.candidate.provider,
        score: alt.score
      }))
    };
  }

  // Static ranking fallback
  const sorted = staticRank(candidates, constraints);
  const best = sorted[0];

  return {
    model: best.id || best.modelId,
    modelId: best.modelId || best.id,
    provider: best.provider,
    reason: reason + '_static',
    classification,
    constraints,
    score: null,
    learning: null,
    costEstimate: safeEstimate(classification.type),
    alternatives: sorted.slice(1, 4).map(m => ({
      model: m.id || m.modelId,
      provider: m.provider,
      score: null
    }))
  };
}

function staticRank(candidates, constraints) {
  const priority = constraints.priority;
  const preferred = constraints.preferredProvider;

  return [...candidates].sort((a, b) => {
    // Preferred provider gets a small boost
    const prefA = preferred && a.provider === preferred ? 0.5 : 0;
    const prefB = preferred && b.provider === preferred ? 0.5 : 0;

    if (priority === 'speed') {
      return (b.latencyScore + prefB) - (a.latencyScore + prefA);
    }
    if (priority === 'cost') {
      // Lower cost is better — invert
      return (a.costScore - prefA) - (b.costScore - prefB);
    }
    if (priority === 'quality') {
      return (b.qualityScore + prefB) - (a.qualityScore + prefA);
    }

    // Balanced: weighted composite
    const scoreA = (a.qualityScore * 0.45) + ((10 - a.costScore) * 0.30) + (a.latencyScore * 0.25) + prefA;
    const scoreB = (b.qualityScore * 0.45) + ((10 - b.costScore) * 0.30) + (b.latencyScore * 0.25) + prefB;
    return scoreB - scoreA;
  });
}

// ── Force Model ─────────────────────────────────────────────────

function buildForceResult(modelId, prompt) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) {
    return {
      model: modelId,
      modelId,
      provider: null,
      reason: 'forced_unknown',
      classification: { type: 'unknown', confidence: 0, method: 'skipped' },
      constraints: {},
      score: null,
      learning: null,
      costEstimate: null,
      alternatives: []
    };
  }

  return {
    model: modelId,
    modelId: model.modelId || modelId,
    provider: model.provider,
    reason: 'forced',
    classification: { type: 'unknown', confidence: 0, method: 'skipped' },
    constraints: {},
    score: null,
    learning: null,
    costEstimate: null,
    alternatives: []
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function resolveConstraints(request) {
  const c = { ...DEFAULT_CONSTRAINTS };

  if (request.priority) c.priority = request.priority;
  if (request.requireTools != null) c.requireTools = !!request.requireTools;
  if (request.requireVision != null) c.requireVision = !!request.requireVision;
  if (request.requireJson != null) c.requireJson = !!request.requireJson;
  if (request.requireLongContext != null) c.requireLongContext = !!request.requireLongContext;
  if (request.localOnly != null) c.localOnly = !!request.localOnly;
  if (request.maxCostScore != null) c.maxCostScore = clamp(request.maxCostScore, 1, 10);
  if (request.minQualityScore != null) c.minQualityScore = clamp(request.minQualityScore, 1, 10);
  if (request.privacyLevel && PRIVACY_PROVIDER_RULES.hasOwnProperty(request.privacyLevel)) {
    c.privacyLevel = request.privacyLevel;
  }
  if (request.preferredProvider) c.preferredProvider = request.preferredProvider;
  if (Array.isArray(request.excludeProviders)) c.excludeProviders = request.excludeProviders;
  if (Array.isArray(request.excludeModels)) c.excludeModels = request.excludeModels;

  // Auto-detect vision/tools from prompt
  if (!c.requireVision) {
    c.requireVision = detectVisionNeed(request.prompt);
  }
  if (!c.requireTools) {
    c.requireTools = detectToolNeed(request.prompt);
  }

  return c;
}

function detectVisionNeed(prompt) {
  if (!prompt) return false;
  return /\b(image|photo|screenshot|picture|bild|foto|visual|diagram|chart|graph|ocr|scan)\b/i.test(prompt);
}

function detectToolNeed(prompt) {
  if (!prompt) return false;
  return /\b(tool|function.call|execute|run.command|file.system|search|browse|code.execution)\b/i.test(prompt);
}

function safeEstimate(taskType) {
  try {
    return estimateTaskCost(taskType || 'chat');
  } catch (_err) {
    return null;
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  route,
  filterCandidates,
  staticRank,
  resolveConstraints,
  detectVisionNeed,
  detectToolNeed,
  DEFAULT_CONSTRAINTS,
  PRIVACY_PROVIDER_RULES,
  TASK_CAPABILITY_MAP
};
