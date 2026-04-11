'use strict';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_CURRENCY = 'USD';
const BASE_MINUTES = 20;

const MODEL_PRICING = {
  'gpt-4.1-mini': { inputPerM: 0.4, outputPerM: 1.6 },
  'gpt-4.1': { inputPerM: 2.0, outputPerM: 8.0 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10.0 },
  'gpt-5.4': { inputPerM: 4.0, outputPerM: 16.0 },
  'gpt-5.3-codex': { inputPerM: 3.0, outputPerM: 12.0 },
  'o4-mini': { inputPerM: 1.1, outputPerM: 4.4 },
  'o3': { inputPerM: 6.0, outputPerM: 24.0 },
  'claude-haiku-4-5': { inputPerM: 0.8, outputPerM: 4.0 },
  'claude-sonnet-4-6': { inputPerM: 3.0, outputPerM: 15.0 },
  'claude-opus-4-6': { inputPerM: 15.0, outputPerM: 75.0 },
  'mistral-medium-latest': { inputPerM: 2.7, outputPerM: 8.1 },
  'mistral-large-latest': { inputPerM: 3.5, outputPerM: 10.5 },
  'codestral-latest': { inputPerM: 1.0, outputPerM: 3.0 }
};

const MODEL_ALIASES = {
  'gpt4.1mini': 'gpt-4.1-mini',
  'gpt-4.1mini': 'gpt-4.1-mini',
  'gpt41mini': 'gpt-4.1-mini',
  'gpt4.1': 'gpt-4.1',
  'gpt41': 'gpt-4.1',
  'gpt4omini': 'gpt-4o-mini',
  'gpt-4omini': 'gpt-4o-mini',
  'gpt4o': 'gpt-4o',
  'gpt54': 'gpt-5.4',
  'gpt53codex': 'gpt-5.3-codex',
  'o4mini': 'o4-mini',
  'claudehaiku45': 'claude-haiku-4-5',
  'claudesonnet46': 'claude-sonnet-4-6',
  'claudeopus46': 'claude-opus-4-6',
  'mistralmediumlatest': 'mistral-medium-latest',
  'mistrallargelatest': 'mistral-large-latest',
  'codestrallatest': 'codestral-latest'
};

const COMPLEXITY_FACTORS = {
  low: 0.75,
  medium: 1.0,
  high: 1.45,
  very_high: 1.95
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeIdentifier(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectModel(taskText) {
  const text = normalizeText(taskText);
  const lowered = text.toLowerCase();

  const directMatch = Object.keys(MODEL_PRICING).find((model) => lowered.includes(model));
  if (directMatch) return directMatch;

  const roughTokens = lowered.split(/\s+/).map(normalizeIdentifier);
  for (const token of roughTokens) {
    if (MODEL_ALIASES[token]) return MODEL_ALIASES[token];
  }

  return DEFAULT_MODEL;
}

function detectComplexity(taskText) {
  const text = normalizeText(taskText).toLowerCase();

  if (/\b(very high|sehr hoch|extrem|critical|komplex|hardest|research-heavy)\b/.test(text)) {
    return 'very_high';
  }
  if (/\b(high|hoch|advanced|multi-step|distributed|migration|architecture|refactor)\b/.test(text)) {
    return 'high';
  }
  if (/\b(low|niedrig|simple|minor|small|quick|bugfix)\b/.test(text)) {
    return 'low';
  }

  const complexityScore =
    scoreKeywords(text, ['api', 'integration', 'database', 'schema', 'pipeline'], 0.15) +
    scoreKeywords(text, ['auth', 'security', 'encryption', 'finetune', 'benchmark'], 0.2) +
    scoreKeywords(text, ['deploy', 'k8s', 'infra', 'ci', 'load test'], 0.2);

  if (complexityScore >= 0.55) return 'high';
  if (complexityScore <= 0.15) return 'low';

  return 'medium';
}

function scoreKeywords(text, words, weight) {
  let hits = 0;
  for (const word of words) {
    if (text.includes(word)) hits += 1;
  }
  return hits * weight;
}

function detectDurationMinutes(taskText) {
  const text = normalizeText(taskText).toLowerCase();

  const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(min|mins|minute|minutes|minuten)\b/);
  if (minuteMatch) {
    return clampNumber(parseFlexibleFloat(minuteMatch[1]), 5, 600);
  }

  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours|stunden)\b/);
  if (hourMatch) {
    return clampNumber(parseFlexibleFloat(hourMatch[1]) * 60, 5, 600);
  }

  if (/\b(ganzer tag|all day|full day)\b/.test(text)) return 8 * 60;

  return BASE_MINUTES;
}

function parseFlexibleFloat(value) {
  return Number.parseFloat(String(value).replace(',', '.'));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function estimateTokens(taskText, complexity, durationMinutes) {
  const text = normalizeText(taskText);
  const inputTokensFromText = Math.ceil(text.length / 3.5);

  const complexityFactor = COMPLEXITY_FACTORS[complexity] || COMPLEXITY_FACTORS.medium;
  const durationFactor = 0.55 + durationMinutes / BASE_MINUTES;

  const planningTokens = Math.round(320 * complexityFactor);
  const toolTokens = Math.round(180 * complexityFactor * Math.max(1, durationMinutes / 30));
  const outputTokens = Math.round((inputTokensFromText * 1.25 + 520) * complexityFactor);

  const total = Math.round((inputTokensFromText + planningTokens + toolTokens + outputTokens) * durationFactor);
  return Math.max(300, total);
}

function estimateCostFromTokens(tokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];

  const inputTokens = Math.round(tokens * 0.55);
  const outputTokens = Math.max(1, tokens - inputTokens);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerM;

  return inputCost + outputCost;
}

function roundCurrency(amount) {
  return Math.round(amount * 10000) / 10000;
}

function estimateTaskCost(taskText) {
  const normalizedTask = normalizeText(taskText);

  const model = detectModel(normalizedTask);
  const complexity = detectComplexity(normalizedTask);
  const durationMinutes = detectDurationMinutes(normalizedTask);

  const estimatedTokens = estimateTokens(normalizedTask, complexity, durationMinutes);
  const rawCost = estimateCostFromTokens(estimatedTokens, model);

  return {
    estimatedTokens,
    estimatedCost: roundCurrency(rawCost),
    currency: DEFAULT_CURRENCY
  };
}

module.exports = {
  estimateTaskCost
};
