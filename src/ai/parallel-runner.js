/**
 * BLUN Parallel Inference Runner
 * Sends a task to multiple AI models simultaneously and returns all results.
 * Uses Promise.all with per-model timeout and graceful error handling.
 */

'use strict';

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Wraps a promise with a timeout.
 * @param {Promise} promise
 * @param {number} ms - timeout in milliseconds
 * @param {string} label - label for timeout error message
 * @returns {Promise}
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run inference on multiple models in parallel.
 *
 * @param {Object} opts
 * @param {string} opts.prompt - The user prompt to send
 * @param {Array<{id: string, call: (prompt: string) => Promise<string>}>} opts.models
 *   Array of model descriptors. Each must have:
 *     - id: string identifier (e.g. "gpt-4o", "claude-opus-4-6")
 *     - call: async function(prompt) => response string
 * @param {number} [opts.timeoutMs=30000] - Per-model timeout in ms
 * @param {Object} [opts.context] - Optional context/metadata forwarded to each model call
 *
 * @returns {Promise<Array<{modelId: string, status: 'ok'|'error'|'timeout', result?: string, error?: string, durationMs: number}>>}
 */
async function runParallel({ prompt, models, timeoutMs = DEFAULT_TIMEOUT_MS, context = {} }) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt must be a non-empty string');
  if (!Array.isArray(models) || models.length === 0) throw new Error('models must be a non-empty array');

  const tasks = models.map(({ id, call }) => {
    const start = Date.now();

    const inference = (async () => {
      const result = await call(prompt, context);
      return { modelId: id, status: 'ok', result, durationMs: Date.now() - start };
    })();

    return withTimeout(inference, timeoutMs, id).catch((err) => {
      const isTimeout = err.message && err.message.startsWith('Timeout after');
      return {
        modelId: id,
        status: isTimeout ? 'timeout' : 'error',
        error: err.message || String(err),
        durationMs: Date.now() - start,
      };
    });
  });

  return Promise.all(tasks);
}

/**
 * Run parallel inference and return only successful results, sorted by duration (fastest first).
 *
 * @param {Object} opts - same as runParallel
 * @returns {Promise<Array<{modelId: string, result: string, durationMs: number}>>}
 */
async function runParallelFastest(opts) {
  const results = await runParallel(opts);
  return results
    .filter((r) => r.status === 'ok')
    .sort((a, b) => a.durationMs - b.durationMs);
}

/**
 * Run parallel inference and return the first successful result (race).
 *
 * @param {Object} opts - same as runParallel
 * @returns {Promise<{modelId: string, result: string, durationMs: number} | null>}
 */
async function runParallelRace(opts) {
  const fastest = await runParallelFastest(opts);
  return fastest.length > 0 ? fastest[0] : null;
}

module.exports = { runParallel, runParallelFastest, runParallelRace, withTimeout };
