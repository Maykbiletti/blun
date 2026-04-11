'use strict';

/**
 * MAI-004: Task Classification System
 * Keyword Matching + AI Classifier -> coding/writing/reasoning/chat/automation
 *
 * Two-stage classification:
 * 1. Fast keyword matching (synchronous, no API call)
 * 2. AI-based classification (async, uses provider if available)
 */

// ── Task Categories ──────────────────────────────────────────────

const TASK_TYPES = {
  CODING: 'coding',
  WRITING: 'writing',
  REASONING: 'reasoning',
  CHAT: 'chat',
  AUTOMATION: 'automation',
};

// ── Keyword Profiles ─────────────────────────────────────────────
// Each category has primary keywords (strong signal) and secondary (weak signal).
// Scores: primary = 3, secondary = 1. Highest total wins.

const KEYWORD_PROFILES = {
  [TASK_TYPES.CODING]: {
    primary: [
      'code', 'implement', 'function', 'bug', 'fix', 'refactor', 'api',
      'endpoint', 'component', 'module', 'class', 'interface', 'typescript',
      'javascript', 'python', 'html', 'css', 'sql', 'query', 'migration',
      'deploy', 'build', 'compile', 'lint', 'test', 'debug', 'regex',
      'algorithm', 'data structure', 'variable', 'const', 'import',
      'export', 'npm', 'package', 'dependency', 'git', 'merge', 'branch',
      'commit', 'pull request', 'pr', 'dockerfile', 'ci', 'cd', 'pipeline',
      'webpack', 'vite', 'react', 'vue', 'angular', 'node', 'express',
      'database', 'schema', 'index', 'route', 'middleware', 'server',
      'backend', 'frontend', 'fullstack', 'crud', 'rest', 'graphql',
      'programmier', 'entwickl', 'fehler', 'beheb', 'erstell',
    ],
    secondary: [
      'file', 'directory', 'path', 'config', 'setup', 'install',
      'error', 'stack trace', 'log', 'output', 'return', 'parameter',
      'datei', 'ordner', 'konfigur',
    ],
  },

  [TASK_TYPES.WRITING]: {
    primary: [
      'write', 'draft', 'article', 'blog', 'essay', 'copy', 'content',
      'email', 'letter', 'proposal', 'report', 'documentation', 'readme',
      'changelog', 'release notes', 'description', 'summary', 'abstract',
      'headline', 'title', 'paragraph', 'proofread', 'edit text',
      'rewrite', 'rephrase', 'translate', 'tone', 'voice', 'style',
      'marketing', 'landing page', 'seo', 'meta description', 'caption',
      'social media', 'tweet', 'post', 'newsletter', 'press release',
      'schreib', 'text', 'artikel', 'entwurf', 'formulier', 'uebersetz',
      'zusammenfass', 'beschreib', 'dokument',
    ],
    secondary: [
      'word', 'sentence', 'grammar', 'spelling', 'format', 'template',
      'wort', 'satz', 'grammatik',
    ],
  },

  [TASK_TYPES.REASONING]: {
    primary: [
      'analyze', 'reason', 'explain', 'why', 'compare', 'evaluate',
      'assess', 'review', 'audit', 'investigate', 'diagnose', 'root cause',
      'trade-off', 'tradeoff', 'pros and cons', 'decision', 'strategy',
      'architecture', 'design pattern', 'best practice', 'approach',
      'calculate', 'math', 'logic', 'proof', 'theorem', 'formula',
      'estimate', 'forecast', 'predict', 'model', 'hypothesis',
      'research', 'benchmark', 'performance', 'optimize', 'complexity',
      'analysier', 'erklaer', 'warum', 'vergleich', 'bewert', 'untersu',
      'diagnos', 'ursache', 'strategi', 'architektur', 'berechn',
    ],
    secondary: [
      'think', 'consider', 'option', 'alternative', 'impact', 'risk',
      'denk', 'option', 'risiko', 'auswirk',
    ],
  },

  [TASK_TYPES.CHAT]: {
    primary: [
      'hello', 'hi', 'hey', 'thanks', 'thank you', 'how are you',
      'what is', 'who is', 'tell me', 'chat', 'talk', 'conversation',
      'question', 'answer', 'help', 'suggest', 'recommend', 'advice',
      'opinion', 'thought', 'idea', 'feedback', 'clarify', 'elaborate',
      'hallo', 'danke', 'wie geht', 'was ist', 'wer ist', 'erzaehl',
      'frage', 'antwort', 'hilf', 'vorschlag', 'empfehl', 'meinung',
    ],
    secondary: [
      'please', 'could you', 'would you', 'can you', 'bitte',
      'koenntest', 'wuerdest', 'kannst',
    ],
  },

  [TASK_TYPES.AUTOMATION]: {
    primary: [
      'automate', 'script', 'cron', 'schedule', 'workflow', 'pipeline',
      'batch', 'bulk', 'repeat', 'recurring', 'trigger', 'webhook',
      'integration', 'sync', 'monitor', 'alert', 'notification', 'bot',
      'scrape', 'crawl', 'extract', 'transform', 'load', 'etl',
      'backup', 'restore', 'migration', 'task runner', 'daemon',
      'process', 'worker', 'queue', 'job', 'spawn', 'orchestrat',
      'automatisier', 'skript', 'zeitplan', 'workflow', 'ueberwach',
      'benachrichtig', 'wiederholend', 'ausloes',
    ],
    secondary: [
      'run', 'execute', 'invoke', 'start', 'stop', 'restart',
      'ausfuehr', 'starten', 'stoppen',
    ],
  },
};

// ── Keyword Classifier ───────────────────────────────────────────

const PRIMARY_WEIGHT = 3;
const SECONDARY_WEIGHT = 1;
const MIN_CONFIDENCE = 0.15;

/**
 * Classifies a task using keyword matching.
 * @param {string} text - Task description
 * @returns {{ type: string, confidence: number, scores: Object, alternatives: Array }}
 */
function classifyByKeywords(text) {
  if (!text || typeof text !== 'string') {
    return { type: TASK_TYPES.CHAT, confidence: 0, scores: {}, alternatives: [] };
  }

  const lower = text.toLowerCase();
  const scores = {};
  let maxScore = 0;

  for (const [type, profile] of Object.entries(KEYWORD_PROFILES)) {
    let score = 0;

    for (const kw of profile.primary) {
      if (lower.includes(kw)) score += PRIMARY_WEIGHT;
    }
    for (const kw of profile.secondary) {
      if (lower.includes(kw)) score += SECONDARY_WEIGHT;
    }

    scores[type] = score;
    if (score > maxScore) maxScore = score;
  }

  if (maxScore === 0) {
    return { type: TASK_TYPES.CHAT, confidence: 0, scores, alternatives: [] };
  }

  // Normalize scores to 0-1 range
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(scores)
    .map(([type, score]) => ({ type, score, confidence: score / totalScore }))
    .sort((a, b) => b.score - a.score);

  const best = sorted[0];
  const alternatives = sorted
    .slice(1)
    .filter(s => s.confidence >= MIN_CONFIDENCE)
    .map(s => ({ type: s.type, confidence: round(s.confidence) }));

  return {
    type: best.type,
    confidence: round(best.confidence),
    scores,
    alternatives,
  };
}

// ── AI Classifier ────────────────────────────────────────────────

const AI_CLASSIFY_PROMPT = `Classify the following task into exactly ONE category.

Categories:
- coding: Programming, development, debugging, deployment, DevOps
- writing: Content creation, documentation, copywriting, translation
- reasoning: Analysis, evaluation, math, logic, architecture decisions
- chat: Casual conversation, simple questions, greetings, general help
- automation: Scripting, scheduling, workflows, monitoring, integrations

Task: "{TASK}"

Respond with ONLY a JSON object: {"type":"<category>","confidence":<0.0-1.0>}`;

/**
 * Classifies a task using an AI provider.
 * Falls back to keyword classification if no provider is available.
 *
 * @param {string} text - Task description
 * @param {object} [options]
 * @param {Function} [options.aiCall] - AI call function: (prompt) => string
 * @param {number} [options.timeout] - Timeout in ms (default 5000)
 * @returns {Promise<{ type: string, confidence: number, method: string }>}
 */
async function classifyByAI(text, options = {}) {
  const { aiCall, timeout = 5000 } = options;

  if (!aiCall || typeof aiCall !== 'function') {
    const kw = classifyByKeywords(text);
    return { type: kw.type, confidence: kw.confidence, method: 'keywords' };
  }

  const prompt = AI_CLASSIFY_PROMPT.replace('{TASK}', sanitize(text));

  try {
    const result = await Promise.race([
      aiCall(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI classify timeout')), timeout)),
    ]);

    const parsed = parseAIResponse(result);
    if (parsed) {
      return { type: parsed.type, confidence: parsed.confidence, method: 'ai' };
    }
  } catch (_err) {
    // AI call failed — fall back silently
  }

  const kw = classifyByKeywords(text);
  return { type: kw.type, confidence: kw.confidence, method: 'keywords_fallback' };
}

// ── Hybrid Classifier (recommended entry point) ──────────────────

/**
 * Two-stage classification: keyword first, AI if ambiguous.
 *
 * @param {string} text - Task description
 * @param {object} [options]
 * @param {Function} [options.aiCall] - AI call function
 * @param {number} [options.aiThreshold] - Below this keyword confidence, ask AI (default 0.5)
 * @param {number} [options.timeout] - AI timeout in ms
 * @returns {Promise<{ type: string, confidence: number, method: string, alternatives: Array }>}
 */
async function classify(text, options = {}) {
  const { aiCall, aiThreshold = 0.5, timeout } = options;

  const kw = classifyByKeywords(text);

  // High-confidence keyword match — no need for AI
  if (kw.confidence >= aiThreshold) {
    return {
      type: kw.type,
      confidence: kw.confidence,
      method: 'keywords',
      alternatives: kw.alternatives,
    };
  }

  // Low confidence or ambiguous — try AI
  if (aiCall) {
    const ai = await classifyByAI(text, { aiCall, timeout });
    return {
      type: ai.type,
      confidence: ai.confidence,
      method: ai.method,
      alternatives: kw.alternatives,
    };
  }

  return {
    type: kw.type,
    confidence: kw.confidence,
    method: 'keywords_low_confidence',
    alternatives: kw.alternatives,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function parseAIResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Extract JSON from response (might have surrounding text)
  const match = raw.match(/\{[^}]*"type"\s*:\s*"[^"]+(?:"[^}]*)?\}/);
  if (!match) return null;

  try {
    const obj = JSON.parse(match[0]);
    const validTypes = new Set(Object.values(TASK_TYPES));

    if (!validTypes.has(obj.type)) return null;

    const confidence = typeof obj.confidence === 'number'
      ? Math.min(1, Math.max(0, obj.confidence))
      : 0.7;

    return { type: obj.type, confidence };
  } catch {
    return null;
  }
}

function sanitize(text) {
  // Prevent prompt injection in AI classification
  return text
    .replace(/["\\\n\r]/g, ' ')
    .slice(0, 500)
    .trim();
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// ── Exports ──────────────────────────────────────────────────────

module.exports = {
  TASK_TYPES,
  KEYWORD_PROFILES,
  classify,
  classifyByKeywords,
  classifyByAI,
};
