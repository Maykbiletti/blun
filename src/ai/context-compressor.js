// BLUN Context Compressor — MKI-033
// Summarizes conversation history and creates memory snapshots
// to keep token usage manageable across long agent sessions

'use strict';

const SUMMARY_THRESHOLD = 20;     // messages before compression kicks in
const KEEP_RECENT = 6;            // always keep last N messages verbatim
const MAX_SNAPSHOT_AGE_MS = 3600 * 1000; // snapshots expire after 1h

// --- Heuristic token estimator (avoids external deps) ---
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  // ~4 chars per token on average for English/German code mix
  return Math.ceil(text.length / 4);
}

function messageText(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map(b => (b.type === 'text' ? b.text : b.type === 'tool_result' ? JSON.stringify(b.content) : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

// --- Rule-based summarizer (no extra API call required) ---
function summarizeMessages(messages) {
  const lines = [];
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'A' : 'U';
    const text = messageText(msg).trim().replace(/\s+/g, ' ');
    if (!text) continue;
    // Keep first 120 chars of each turn for the summary
    const snippet = text.length > 120 ? text.slice(0, 117) + '…' : text;
    lines.push(`[${role}] ${snippet}`);
  }
  return lines.join('\n');
}

// --- Memory Snapshot ---
class MemorySnapshot {
  constructor(summary, meta = {}) {
    this.summary   = summary;
    this.createdAt = Date.now();
    this.meta      = meta;           // e.g. { taskId, agentName }
  }

  isExpired() {
    return Date.now() - this.createdAt > MAX_SNAPSHOT_AGE_MS;
  }

  toSystemBlock() {
    return `<memory_snapshot>\n${this.summary}\n</memory_snapshot>`;
  }
}

// --- Context Compressor ---
class ContextCompressor {
  /**
   * @param {object} opts
   * @param {number} [opts.threshold]   - message count that triggers compression
   * @param {number} [opts.keepRecent]  - how many recent messages to keep verbatim
   * @param {object} [opts.meta]        - arbitrary metadata stored in snapshots
   */
  constructor(opts = {}) {
    this.threshold   = opts.threshold   || SUMMARY_THRESHOLD;
    this.keepRecent  = opts.keepRecent  || KEEP_RECENT;
    this.meta        = opts.meta        || {};
    this.snapshots   = [];              // ordered list of MemorySnapshot
  }

  // ---------- Public API ----------

  /**
   * Compress messages if necessary.
   * Returns the (possibly shortened) messages array plus a flag indicating
   * whether compression occurred.
   *
   * @param {Array}  messages      - full conversation history
   * @param {string} [systemPrompt] - existing system prompt (will be augmented)
   * @returns {{ messages: Array, systemPrompt: string, compressed: boolean }}
   */
  compress(messages, systemPrompt = '') {
    if (!Array.isArray(messages) || messages.length < this.threshold) {
      return { messages, systemPrompt, compressed: false };
    }

    const cutoff  = messages.length - this.keepRecent;
    const toSummarize = messages.slice(0, cutoff);
    const recent  = messages.slice(cutoff);

    const summary = summarizeMessages(toSummarize);
    const snapshot = new MemorySnapshot(summary, {
      ...this.meta,
      originalCount: toSummarize.length,
      compressedAt: new Date().toISOString()
    });
    this.snapshots.push(snapshot);

    const augmentedSystem = this._buildSystem(systemPrompt);

    return {
      messages: recent,
      systemPrompt: augmentedSystem,
      compressed: true,
      snapshot
    };
  }

  /**
   * Force-create a named snapshot from the current messages without
   * compressing the array (useful for checkpointing mid-task).
   *
   * @param {Array}  messages
   * @param {string} [label]
   * @returns {MemorySnapshot}
   */
  snapshot(messages, label = '') {
    const summary = (label ? `# ${label}\n` : '') + summarizeMessages(messages);
    const snap = new MemorySnapshot(summary, { ...this.meta, label });
    this.snapshots.push(snap);
    return snap;
  }

  /**
   * Return a combined system-prompt injection containing all active snapshots.
   * Expired snapshots are pruned automatically.
   */
  getMemoryBlock() {
    this._pruneExpired();
    if (!this.snapshots.length) return '';
    return this.snapshots.map(s => s.toSystemBlock()).join('\n\n');
  }

  /**
   * Total estimated token count across all snapshots.
   */
  snapshotTokens() {
    return this.snapshots.reduce((acc, s) => acc + estimateTokens(s.summary), 0);
  }

  /**
   * Clear all stored snapshots.
   */
  reset() {
    this.snapshots = [];
  }

  // ---------- Internals ----------

  _pruneExpired() {
    this.snapshots = this.snapshots.filter(s => !s.isExpired());
  }

  _buildSystem(existing) {
    const block = this.getMemoryBlock();
    if (!block) return existing;
    const sep = existing ? '\n\n' : '';
    return existing + sep + block;
  }
}

// ---------- Convenience factory ----------

/**
 * Create a ContextCompressor with sane defaults for a given agent session.
 *
 * @param {object} [opts]
 * @param {string} [opts.agentName]
 * @param {string} [opts.taskId]
 * @param {number} [opts.threshold]
 * @param {number} [opts.keepRecent]
 * @returns {ContextCompressor}
 */
function createCompressor(opts = {}) {
  const { agentName, taskId, ...rest } = opts;
  return new ContextCompressor({
    ...rest,
    meta: { agentName, taskId }
  });
}

// ---------- Exports ----------

module.exports = {
  ContextCompressor,
  MemorySnapshot,
  createCompressor,
  estimateTokens,
  summarizeMessages
};
