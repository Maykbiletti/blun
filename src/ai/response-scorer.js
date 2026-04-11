'use strict';

/**
 * MKI-053: Response Scoring System
 * Scores AI responses on four dimensions:
 *   - completeness: did the response address the full request?
 *   - correctness:  are facts/code/logic accurate?
 *   - format:       does output match requested structure?
 *   - hallucination: risk of fabricated information
 *
 * Each dimension yields 0..1. Combined into a weighted total 0..1.
 */

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = Object.freeze({
  completeness:  0.30,
  correctness:   0.35,
  format:        0.15,
  hallucination: 0.20,
});

const DIMENSION_NAMES = Object.keys(DEFAULT_WEIGHTS);

// ── Helpers ─────────────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(s) {
  return String(s || '').trim();
}

function wordCount(text) {
  const t = normalizeText(text);
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function sentenceCount(text) {
  const t = normalizeText(text);
  if (!t) return 0;
  const m = t.match(/[.!?]+/g);
  return m ? m.length : (t.length > 0 ? 1 : 0);
}

// ── Completeness Scorer ─────────────────────────────────────────────
// Heuristics: response length relative to prompt, keyword coverage,
// presence of structural markers (lists, code blocks, headings).

const STRUCTURAL_PATTERNS = [
  /^[-*]\s/m,          // bullet lists
  /^\d+\.\s/m,         // numbered lists
  /```[\s\S]*?```/,    // code blocks
  /^#{1,6}\s/m,        // headings
  /\|.*\|.*\|/,        // tables
];

function scoreCompleteness(response, prompt) {
  const rText = normalizeText(response);
  const pText = normalizeText(prompt);
  if (!rText) return 0;
  if (!pText) return 0.5;

  const rWords = wordCount(rText);
  const pWords = wordCount(pText);

  // Length ratio: responses should generally be longer than prompts.
  // Diminishing returns above 3x.
  const lengthRatio = pWords > 0 ? rWords / pWords : 1;
  const lengthScore = clamp(lengthRatio / 3, 0.1, 1);

  // Keyword coverage: how many prompt keywords appear in response
  const promptKeywords = extractKeywords(pText);
  let covered = 0;
  for (const kw of promptKeywords) {
    if (rText.toLowerCase().includes(kw)) covered++;
  }
  const coverageScore = promptKeywords.length > 0
    ? covered / promptKeywords.length
    : 0.5;

  // Structural richness: presence of formatting markers
  let structScore = 0;
  for (const pat of STRUCTURAL_PATTERNS) {
    if (pat.test(rText)) structScore += 0.2;
  }
  structScore = clamp(structScore, 0, 1);

  return clamp(
    lengthScore * 0.35 + coverageScore * 0.50 + structScore * 0.15,
    0, 1
  );
}

function extractKeywords(text) {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'after', 'before', 'above', 'below', 'and', 'or', 'but',
    'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
    'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
    'than', 'too', 'very', 'just', 'also', 'how', 'what', 'which', 'who',
    'when', 'where', 'why', 'if', 'then', 'that', 'this', 'these', 'those',
    'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she',
    'him', 'her', 'they', 'them', 'their', 'up', 'out', 'off',
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'und', 'oder', 'aber',
    'nicht', 'ein', 'eine', 'der', 'die', 'das', 'den', 'dem', 'des',
    'mit', 'von', 'zu', 'auf', 'in', 'an', 'fuer', 'ist', 'sind', 'war',
  ]);

  const words = text.toLowerCase().match(/[a-z\u00e4\u00f6\u00fc\u00df]{3,}/g) || [];
  const unique = [...new Set(words)].filter(w => !STOP_WORDS.has(w));
  return unique.slice(0, 50);
}

// ── Correctness Scorer ──────────────────────────────────────────────
// Heuristics without ground-truth: internal consistency signals.

const HEDGE_PHRASES = [
  'i think', 'i believe', 'i\'m not sure', 'it might', 'it could',
  'possibly', 'perhaps', 'maybe', 'not certain', 'hard to say',
  'ich glaube', 'vielleicht', 'moeglicherweise', 'bin nicht sicher',
];

const CONTRADICTION_PAIRS = [
  [/\bis\b/i, /\bis not\b/i],
  [/\balways\b/i, /\bnever\b/i],
  [/\btrue\b/i, /\bfalse\b/i],
  [/\byes\b/i, /\bno\b/i],
];

function scoreCorrectness(response, _prompt, options) {
  const rText = normalizeText(response);
  if (!rText) return 0;

  const rLower = rText.toLowerCase();

  // Hedge density — more hedging = less confidence in correctness
  let hedgeCount = 0;
  for (const phrase of HEDGE_PHRASES) {
    const idx = rLower.indexOf(phrase);
    if (idx !== -1) hedgeCount++;
  }
  const sentences = sentenceCount(rText);
  const hedgeDensity = sentences > 0 ? hedgeCount / sentences : 0;
  const hedgeScore = clamp(1 - hedgeDensity * 2, 0, 1);

  // Contradiction detection (simple same-paragraph check)
  let contradictions = 0;
  const paragraphs = rText.split(/\n\s*\n/);
  for (const para of paragraphs) {
    for (const [a, b] of CONTRADICTION_PAIRS) {
      if (a.test(para) && b.test(para)) contradictions++;
    }
  }
  const contradictionScore = clamp(1 - contradictions * 0.25, 0, 1);

  // Code syntax validity (if code blocks present)
  const codeBlocks = rText.match(/```[\s\S]*?```/g) || [];
  let codeScore = 1;
  if (codeBlocks.length > 0) {
    let validBlocks = 0;
    for (const block of codeBlocks) {
      const code = block.replace(/```\w*\n?/g, '').replace(/```/g, '').trim();
      if (code.length > 0 && !hasObviousSyntaxErrors(code)) validBlocks++;
    }
    codeScore = validBlocks / codeBlocks.length;
  }

  // Reference quality: links, citations, specific values
  const hasSpecifics = /\b\d{3,}\b/.test(rText) || /https?:\/\//.test(rText) ||
    /\b(v\d+\.\d+|version \d+)/i.test(rText);
  const specificityBonus = hasSpecifics ? 0.05 : 0;

  // Ground truth comparison if provided
  let groundTruthScore = null;
  if (options && options.groundTruth) {
    groundTruthScore = compareGroundTruth(rText, normalizeText(options.groundTruth));
  }

  let base = hedgeScore * 0.30 + contradictionScore * 0.30 + codeScore * 0.40 + specificityBonus;
  if (groundTruthScore !== null) {
    base = base * 0.4 + groundTruthScore * 0.6;
  }

  return clamp(base, 0, 1);
}

function hasObviousSyntaxErrors(code) {
  // Quick bracket-balance check
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  const closers = new Set(Object.values(pairs));
  for (const ch of code) {
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (closers.has(ch)) {
      if (stack.length === 0 || stack.pop() !== ch) return true;
    }
  }
  // Allow minor imbalance in snippets (trailing opens for partial code)
  return stack.length > 3;
}

function compareGroundTruth(response, truth) {
  const rKeywords = extractKeywords(response);
  const tKeywords = extractKeywords(truth);
  if (tKeywords.length === 0) return 0.5;
  let matches = 0;
  for (const kw of tKeywords) {
    if (rKeywords.includes(kw)) matches++;
  }
  return matches / tKeywords.length;
}

// ── Format Scorer ───────────────────────────────────────────────────
// Checks whether response conforms to expected output format.

const FORMAT_SPECS = {
  json: {
    test: (text) => {
      try { JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim()); return true; }
      catch { return false; }
    },
    extract: (text) => {
      const m = text.match(/```json\n?([\s\S]*?)```/) || text.match(/^\s*[\[{]/m);
      return m ? 0.8 : 0;
    },
  },
  markdown: {
    test: (text) => /^#{1,6}\s/m.test(text) || /^[-*]\s/m.test(text) || /\*\*.*\*\*/.test(text),
    extract: () => 0.5,
  },
  code: {
    test: (text) => /```/.test(text),
    extract: () => 0.3,
  },
  list: {
    test: (text) => /^[-*]\s/m.test(text) || /^\d+\.\s/m.test(text),
    extract: () => 0.4,
  },
  table: {
    test: (text) => /\|.*\|.*\|/.test(text) && /[-:]+\|[-:]+/.test(text),
    extract: () => 0.3,
  },
};

function scoreFormat(response, _prompt, options) {
  const rText = normalizeText(response);
  if (!rText) return 0;

  const expectedFormat = (options && options.expectedFormat) || null;

  if (expectedFormat && FORMAT_SPECS[expectedFormat]) {
    const spec = FORMAT_SPECS[expectedFormat];
    if (spec.test(rText)) return 1.0;
    return spec.extract(rText);
  }

  // No explicit format expected — score general formatting quality
  let score = 0.5; // baseline for plain text

  // Paragraph structure
  const paragraphs = rText.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length > 1) score += 0.1;

  // Consistent formatting
  for (const pat of STRUCTURAL_PATTERNS) {
    if (pat.test(rText)) { score += 0.08; }
  }

  // Readability: reasonable sentence length
  const avgWordsPerSentence = wordCount(rText) / Math.max(sentenceCount(rText), 1);
  if (avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25) score += 0.1;

  return clamp(score, 0, 1);
}

// ── Hallucination Risk Scorer ───────────────────────────────────────
// Returns RISK score (0 = low risk, 1 = high risk).
// Inverted in final scoring (high risk = low score).

const HALLUCINATION_SIGNALS = [
  // Fabricated references
  { pattern: /(?:doi|isbn|arxiv)[:\s]+[\d.\/\-a-z]+/i, weight: 0.15, name: 'citation' },
  // Specific dates that may be fabricated
  { pattern: /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i, weight: 0.05, name: 'specific_date' },
  // Invented URLs
  { pattern: /https?:\/\/[^\s)]+/g, weight: 0.10, name: 'url' },
  // Fake quotes
  { pattern: /"[^"]{20,}"\s*[-–—]\s*[A-Z][a-z]+/g, weight: 0.12, name: 'quote_attribution' },
  // Overly precise statistics without source
  { pattern: /\b\d{2,3}(\.\d+)?%/g, weight: 0.08, name: 'precise_stat' },
  // Name-dropping (person + said/stated/wrote)
  { pattern: /[A-Z][a-z]+\s+(?:said|stated|wrote|argued|claimed|noted)\b/g, weight: 0.08, name: 'attribution' },
];

const GROUNDING_SIGNALS = [
  // References to provided context
  { pattern: /\b(?:you mentioned|in your|as stated|from the|according to the prompt|based on|given that)\b/i, weight: 0.15 },
  // Epistemic honesty
  { pattern: /\b(?:i don't know|i'm not sure|unclear|cannot determine|no information)\b/i, weight: 0.10 },
  // Code that references actual structures
  { pattern: /(?:function|class|const|let|var|import|require)\s+\w+/g, weight: 0.05 },
];

function scoreHallucinationRisk(response, prompt) {
  const rText = normalizeText(response);
  if (!rText) return 0;

  let riskScore = 0;
  let groundingScore = 0;

  // Accumulate risk signals
  for (const signal of HALLUCINATION_SIGNALS) {
    const matches = rText.match(signal.pattern);
    if (matches) {
      // Scale by count but cap contribution
      const count = Math.min(matches.length, 5);
      riskScore += signal.weight * (1 + (count - 1) * 0.3);
    }
  }

  // Accumulate grounding signals
  for (const signal of GROUNDING_SIGNALS) {
    if (signal.pattern.test(rText)) {
      groundingScore += signal.weight;
    }
  }

  // Context overlap: if response uses many words from prompt, it's more grounded
  if (prompt) {
    const pText = normalizeText(prompt);
    const pKeywords = extractKeywords(pText);
    const rLower = rText.toLowerCase();
    let overlap = 0;
    for (const kw of pKeywords) {
      if (rLower.includes(kw)) overlap++;
    }
    const overlapRatio = pKeywords.length > 0 ? overlap / pKeywords.length : 0;
    groundingScore += overlapRatio * 0.20;
  }

  // Response length penalty: very long responses have higher hallucination risk
  const words = wordCount(rText);
  if (words > 500) riskScore += 0.05;
  if (words > 1500) riskScore += 0.05;

  // Net risk
  const netRisk = clamp(riskScore - groundingScore, 0, 1);

  // Return inverted: 1 = no hallucination risk (good), 0 = high risk (bad)
  return clamp(1 - netRisk, 0, 1);
}

// ── Main Scoring Function ───────────────────────────────────────────

/**
 * Score an AI response across all dimensions.
 *
 * @param {string} response  - The AI-generated response text
 * @param {string} prompt    - The original prompt/request
 * @param {Object} [options] - Scoring options
 * @param {Object} [options.weights]         - Custom dimension weights (sum to 1)
 * @param {string} [options.expectedFormat]  - Expected format: json|markdown|code|list|table
 * @param {string} [options.groundTruth]     - Reference answer for correctness comparison
 * @param {boolean} [options.detailed]       - Return per-dimension breakdown
 * @returns {{ score: number, dimensions?: Object, grade: string }}
 */
function scoreResponse(response, prompt, options) {
  const opts = options || {};
  const weights = Object.assign({}, DEFAULT_WEIGHTS, opts.weights || {});

  // Normalize weights to sum to 1
  const wSum = DIMENSION_NAMES.reduce((s, d) => s + (weights[d] || 0), 0);
  if (wSum > 0 && Math.abs(wSum - 1) > 0.001) {
    for (const d of DIMENSION_NAMES) {
      weights[d] = (weights[d] || 0) / wSum;
    }
  }

  const dimensions = {
    completeness:  scoreCompleteness(response, prompt),
    correctness:   scoreCorrectness(response, prompt, opts),
    format:        scoreFormat(response, prompt, opts),
    hallucination: scoreHallucinationRisk(response, prompt),
  };

  const score = clamp(
    DIMENSION_NAMES.reduce((total, dim) => total + dimensions[dim] * weights[dim], 0),
    0, 1
  );

  const result = {
    score: Math.round(score * 1000) / 1000,
    grade: toGrade(score),
  };

  if (opts.detailed) {
    result.dimensions = {};
    for (const dim of DIMENSION_NAMES) {
      result.dimensions[dim] = Math.round(dimensions[dim] * 1000) / 1000;
    }
    result.weights = Object.assign({}, weights);
  }

  return result;
}

function toGrade(score) {
  if (score >= 0.9)  return 'A';
  if (score >= 0.8)  return 'B';
  if (score >= 0.65) return 'C';
  if (score >= 0.5)  return 'D';
  return 'F';
}

// ── Batch Scoring ───────────────────────────────────────────────────

/**
 * Score multiple responses and rank them.
 *
 * @param {Array<{ response: string, id?: string }>} responses
 * @param {string} prompt
 * @param {Object} [options] - Same as scoreResponse options
 * @returns {Array<{ id: string, score: number, grade: string, rank: number }>}
 */
function scoreAndRank(responses, prompt, options) {
  if (!Array.isArray(responses) || responses.length === 0) return [];

  const scored = responses.map((item, idx) => {
    const result = scoreResponse(item.response || item, prompt, options);
    return {
      id: item.id || String(idx),
      score: result.score,
      grade: result.grade,
      dimensions: result.dimensions || undefined,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((item, idx) => Object.assign(item, { rank: idx + 1 }));
}

// ── Quick Verdict ───────────────────────────────────────────────────

/**
 * Quick pass/fail check with configurable threshold.
 *
 * @param {string} response
 * @param {string} prompt
 * @param {Object} [options]
 * @param {number} [options.threshold=0.6] - Minimum score to pass
 * @returns {{ pass: boolean, score: number, grade: string }}
 */
function quickVerdict(response, prompt, options) {
  const threshold = (options && options.threshold) || 0.6;
  const result = scoreResponse(response, prompt, options);
  return {
    pass: result.score >= threshold,
    score: result.score,
    grade: result.grade,
  };
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  scoreResponse,
  scoreAndRank,
  quickVerdict,
  scoreCompleteness,
  scoreCorrectness,
  scoreFormat,
  scoreHallucinationRisk,
  extractKeywords,
  DEFAULT_WEIGHTS,
  DIMENSION_NAMES,
  FORMAT_SPECS,
};
