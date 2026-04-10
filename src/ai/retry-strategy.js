// MKI-023: Retry-Strategien
// Retry, anderes Modell, kleinerer Kontext, Tools aus
// Brigitte / Marketing Launch | 2026-04-10

'use strict';

// --- Defaults ---
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 16000;
const DEFAULT_JITTER = true;

// Error codes that are transient (worth retrying)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
  'overloaded_error', 'rate_limit_error', 'server_error'
]);

/**
 * Returns true if an error is worth retrying.
 * @param {Error} err
 * @returns {boolean}
 */
function isRetryable(err) {
  if (!err) return false;
  if (err.status && RETRYABLE_STATUS_CODES.has(err.status)) return true;
  if (err.statusCode && RETRYABLE_STATUS_CODES.has(err.statusCode)) return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  if (err.type && RETRYABLE_ERROR_CODES.has(err.type)) return true;
  if (err.message) {
    const msg = err.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
    if (msg.includes('overloaded') || msg.includes('service unavailable')) return true;
    if (msg.includes('timeout') || msg.includes('timed out')) return true;
    if (msg.includes('connection reset') || msg.includes('econnreset')) return true;
  }
  return false;
}

/**
 * Exponential backoff with optional jitter.
 * @param {number} attempt  0-based attempt index
 * @param {object} opts
 * @returns {number} delay in ms
 */
function calcDelay(attempt, opts = {}) {
  const base = opts.baseDelayMs || DEFAULT_BASE_DELAY_MS;
  const max = opts.maxDelayMs || DEFAULT_MAX_DELAY_MS;
  const jitter = opts.jitter !== undefined ? opts.jitter : DEFAULT_JITTER;
  let delay = Math.min(base * Math.pow(2, attempt), max);
  if (jitter) delay = delay * (0.5 + Math.random() * 0.5);
  return Math.round(delay);
}

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a degraded fallback request:
 *   1. Remove tools (strip tool_calling capability requirement)
 *   2. Reduce maxTokens by half (smaller context output)
 *   3. Remove messages history beyond last user turn
 * @param {object} reqOpts  Original query options
 * @param {number} attempt  0-based attempt number (for progressive degradation)
 * @returns {object} Modified options
 */
function degradeRequest(reqOpts, attempt) {
  const opts = Object.assign({}, reqOpts);

  // Step 1 (attempt >= 1): disable tools
  if (attempt >= 1 && opts.tools) {
    opts.tools = undefined;
    opts._toolsDisabled = true;
  }

  // Step 2 (attempt >= 2): shrink context
  if (attempt >= 2) {
    if (opts.maxTokens && opts.maxTokens > 256) {
      opts.maxTokens = Math.max(256, Math.floor(opts.maxTokens / 2));
    } else if (!opts.maxTokens) {
      // Set a conservative cap when no explicit maxTokens was given
      opts.maxTokens = 1024;
    }
    // Trim message history — keep only last user message
    if (Array.isArray(opts.messages) && opts.messages.length > 1) {
      const lastUser = [...opts.messages].reverse().find(m => m.role === 'user');
      opts.messages = lastUser ? [lastUser] : opts.messages.slice(-1);
      opts._contextTrimmed = true;
    }
    opts._contextReduced = true;
  }

  return opts;
}

/**
 * Select a fallback model from MODEL_REGISTRY that differs from the current one.
 * Prefers cheaper/faster models on later attempts.
 * @param {object} MODEL_REGISTRY
 * @param {string} currentModelId
 * @param {string} [taskType]
 * @param {number} attempt
 * @returns {string|null} model id or null
 */
function selectFallbackModel(MODEL_REGISTRY, currentModelId, taskType, attempt) {
  const all = Object.entries(MODEL_REGISTRY)
    .filter(([id, m]) => m.active !== false && id !== currentModelId)
    .filter(([_, m]) => !taskType || (m.capabilities && m.capabilities.includes(taskType)))
    .map(([id, m]) => ({ id, ...m }));

  if (!all.length) return null;

  // On later attempts prefer cheaper/faster models
  const priority = attempt >= 2 ? 'cost' : 'quality';
  all.sort((a, b) => {
    if (priority === 'cost') return (a.costScore || 5) - (b.costScore || 5);
    return (b.qualityScore || 5) - (a.qualityScore || 5);
  });

  return all[0].id;
}

/**
 * Execute a query function with retry logic.
 *
 * Strategy per attempt:
 *   attempt 0  — original request, original model
 *   attempt 1  — same model, tools disabled
 *   attempt 2  — fallback model, tools disabled, smaller context
 *   attempt N  — cheapest available model, tools disabled, smaller context
 *
 * @param {Function} queryFn        async (opts) => result  — the actual query call
 * @param {object}   reqOpts        original query options passed to queryFn
 * @param {object}   [retryOpts]
 * @param {number}   [retryOpts.maxRetries=3]
 * @param {number}   [retryOpts.baseDelayMs=500]
 * @param {number}   [retryOpts.maxDelayMs=16000]
 * @param {boolean}  [retryOpts.jitter=true]
 * @param {object}   [retryOpts.modelRegistry]   MODEL_REGISTRY from ai-provider
 * @param {Function} [retryOpts.onRetry]         callback(attempt, err, nextOpts)
 * @returns {Promise<object>} query result with _retryMeta attached
 */
async function withRetry(queryFn, reqOpts, retryOpts = {}) {
  const maxRetries = retryOpts.maxRetries !== undefined ? retryOpts.maxRetries : DEFAULT_MAX_RETRIES;
  const MODEL_REGISTRY = retryOpts.modelRegistry || {};
  const onRetry = retryOpts.onRetry || null;

  let opts = Object.assign({}, reqOpts);
  let lastErr;
  const attempts = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryFn(opts);
      result._retryMeta = {
        attempts: attempt,
        attemptLog: attempts,
        succeeded: true
      };
      return result;
    } catch (err) {
      lastErr = err;
      attempts.push({
        attempt,
        model: opts.model || opts.forceModel || '(auto)',
        toolsDisabled: !!opts._toolsDisabled,
        contextReduced: !!opts._contextReduced,
        errorCode: err.code || err.type || err.status || null,
        errorMessage: err.message || String(err)
      });

      if (attempt >= maxRetries) break;
      if (!isRetryable(err)) break;

      // Build degraded options for next attempt
      opts = degradeRequest(reqOpts, attempt + 1);

      // Switch to a fallback model on attempt 1+
      if (attempt >= 0 && MODEL_REGISTRY) {
        const currentModel = opts.model || opts.forceModel;
        const taskType = opts.taskType;
        const fallbackId = selectFallbackModel(MODEL_REGISTRY, currentModel, taskType, attempt + 1);
        if (fallbackId) {
          opts.model = fallbackId;
          opts._fallbackModel = fallbackId;
        }
      }

      const delay = calcDelay(attempt, retryOpts);

      if (onRetry) {
        try { onRetry(attempt + 1, err, opts); } catch (_) {}
      }

      await sleep(delay);
    }
  }

  const meta = { attempts: attempts.length, attemptLog: attempts, succeeded: false };
  const finalErr = new Error(
    `All ${attempts.length} attempt(s) failed. Last error: ${lastErr && lastErr.message}`
  );
  finalErr.cause = lastErr;
  finalErr._retryMeta = meta;
  throw finalErr;
}

/**
 * Wrap an ai-provider `query` call with retry+degradation.
 * Convenience wrapper when you already have the query function from ai-provider.
 *
 * @param {object} aiProvider     Module with .query() and .MODEL_REGISTRY
 * @param {object} reqOpts        Options forwarded to aiProvider.query()
 * @param {object} [retryOpts]    Same as withRetry retryOpts
 * @returns {Promise<object>}
 */
function withProviderRetry(aiProvider, reqOpts, retryOpts = {}) {
  return withRetry(
    opts => aiProvider.query(opts),
    reqOpts,
    Object.assign({ modelRegistry: aiProvider.MODEL_REGISTRY }, retryOpts)
  );
}

module.exports = {
  withRetry,
  withProviderRetry,
  isRetryable,
  calcDelay,
  degradeRequest,
  selectFallbackModel,
  // Constants exported for testing / override
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
  RETRYABLE_STATUS_CODES,
  RETRYABLE_ERROR_CODES
};
