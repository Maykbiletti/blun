'use strict';

/**
 * MKI-006: Modell-Kategorien
 * Tags für Modell-Klassifizierung: Fast Chat, Deep Reasoning, Coding,
 * Vision, Translation, Local, Premium, Budget
 */

const CATEGORIES = {
  FAST_CHAT: 'Fast Chat',
  DEEP_REASONING: 'Deep Reasoning',
  CODING: 'Coding',
  VISION: 'Vision',
  TRANSLATION: 'Translation',
  LOCAL: 'Local',
  PREMIUM: 'Premium',
  BUDGET: 'Budget',
};

/** Bekannte Modell-Tag-Zuordnungen */
const MODEL_CATEGORY_MAP = {
  // Anthropic
  'claude-opus-4-6': [CATEGORIES.DEEP_REASONING, CATEGORIES.CODING, CATEGORIES.PREMIUM],
  'claude-sonnet-4-6': [CATEGORIES.FAST_CHAT, CATEGORIES.CODING, CATEGORIES.PREMIUM],
  'claude-haiku-4-5': [CATEGORIES.FAST_CHAT, CATEGORIES.BUDGET],

  // OpenAI
  'gpt-4o': [CATEGORIES.FAST_CHAT, CATEGORIES.VISION, CATEGORIES.CODING, CATEGORIES.PREMIUM],
  'gpt-4o-mini': [CATEGORIES.FAST_CHAT, CATEGORIES.VISION, CATEGORIES.BUDGET],
  'o1': [CATEGORIES.DEEP_REASONING, CATEGORIES.PREMIUM],
  'o1-mini': [CATEGORIES.DEEP_REASONING, CATEGORIES.BUDGET],
  'o3': [CATEGORIES.DEEP_REASONING, CATEGORIES.CODING, CATEGORIES.PREMIUM],
  'o3-mini': [CATEGORIES.DEEP_REASONING, CATEGORIES.CODING, CATEGORIES.BUDGET],

  // Google
  'gemini-2.0-flash': [CATEGORIES.FAST_CHAT, CATEGORIES.VISION, CATEGORIES.BUDGET],
  'gemini-2.0-pro': [CATEGORIES.DEEP_REASONING, CATEGORIES.VISION, CATEGORIES.PREMIUM],
  'gemini-1.5-flash': [CATEGORIES.FAST_CHAT, CATEGORIES.VISION, CATEGORIES.BUDGET],
  'gemini-1.5-pro': [CATEGORIES.DEEP_REASONING, CATEGORIES.VISION, CATEGORIES.PREMIUM],

  // Local / llama-server
  'llama-3.3-70b': [CATEGORIES.LOCAL, CATEGORIES.FAST_CHAT, CATEGORIES.CODING],
  'llama-3.1-8b': [CATEGORIES.LOCAL, CATEGORIES.FAST_CHAT, CATEGORIES.BUDGET],
  'mistral-7b': [CATEGORIES.LOCAL, CATEGORIES.FAST_CHAT, CATEGORIES.BUDGET],
  'mistral-nemo': [CATEGORIES.LOCAL, CATEGORIES.FAST_CHAT],
  'deepseek-coder-v2': [CATEGORIES.LOCAL, CATEGORIES.CODING],
  'deepseek-r1': [CATEGORIES.LOCAL, CATEGORIES.DEEP_REASONING],
  'qwen2.5-72b': [CATEGORIES.LOCAL, CATEGORIES.CODING, CATEGORIES.TRANSLATION],
  'qwen2.5-7b': [CATEGORIES.LOCAL, CATEGORIES.FAST_CHAT, CATEGORIES.TRANSLATION, CATEGORIES.BUDGET],
  'phi-4': [CATEGORIES.LOCAL, CATEGORIES.CODING, CATEGORIES.BUDGET],
  'gemma-3-27b': [CATEGORIES.LOCAL, CATEGORIES.FAST_CHAT],

  // Translation-spezialisiert
  'nllb-200': [CATEGORIES.LOCAL, CATEGORIES.TRANSLATION],
  'opus-mt': [CATEGORIES.LOCAL, CATEGORIES.TRANSLATION, CATEGORIES.BUDGET],
};

/**
 * Gibt die Tags für ein Modell zurück.
 * @param {string} modelId
 * @returns {string[]} Array von Kategorie-Tags
 */
function getCategoriesForModel(modelId) {
  if (!modelId || typeof modelId !== 'string') return [];
  const normalized = modelId.toLowerCase().trim();
  if (MODEL_CATEGORY_MAP[normalized]) return [...MODEL_CATEGORY_MAP[normalized]];

  // Heuristiken für unbekannte Modelle
  const tags = new Set();
  if (/local|gguf|ggml|ollama|llamacpp|llama\.cpp/i.test(normalized)) tags.add(CATEGORIES.LOCAL);
  if (/vision|vl|multimodal|clip/i.test(normalized)) tags.add(CATEGORIES.VISION);
  if (/coder|code|coding|starcoder|deepseek-coder/i.test(normalized)) tags.add(CATEGORIES.CODING);
  if (/reason|thinking|r1|o\d/i.test(normalized)) tags.add(CATEGORIES.DEEP_REASONING);
  if (/translate|nllb|opus-mt|mbart/i.test(normalized)) tags.add(CATEGORIES.TRANSLATION);
  if (/mini|small|tiny|nano|8b|7b|3b|1b/i.test(normalized)) tags.add(CATEGORIES.BUDGET);
  if (/opus|ultra|pro|plus|large|70b|405b/i.test(normalized)) tags.add(CATEGORIES.PREMIUM);
  if (tags.size === 0) tags.add(CATEGORIES.FAST_CHAT);

  return [...tags];
}

/**
 * Gibt alle Modelle zurück, die mindestens einen der angegebenen Tags besitzen.
 * @param {string|string[]} tags
 * @returns {string[]} Modell-IDs
 */
function getModelsForCategories(tags) {
  const wanted = new Set(Array.isArray(tags) ? tags : [tags]);
  return Object.entries(MODEL_CATEGORY_MAP)
    .filter(([, cats]) => cats.some(c => wanted.has(c)))
    .map(([id]) => id);
}

/**
 * Filtert eine Liste von Modell-Objekten nach Kategorie.
 * Erwartet Objekte mit mindestens { id: string }.
 * @param {object[]} models
 * @param {string|string[]} tags
 * @returns {object[]}
 */
function filterModelsByCategory(models, tags) {
  if (!Array.isArray(models)) return [];
  const wanted = new Set(Array.isArray(tags) ? tags : [tags]);
  return models.filter(m => {
    const cats = getCategoriesForModel(m.id || m.modelId || m.name || '');
    return cats.some(c => wanted.has(c));
  });
}

/**
 * Reichert ein Modell-Objekt mit seinen Kategorie-Tags an.
 * @param {object} model  Muss { id } oder { modelId } oder { name } haben
 * @returns {object}  Gleiches Objekt + { categories: string[] }
 */
function annotateModelWithCategories(model) {
  const id = model.id || model.modelId || model.name || '';
  return { ...model, categories: getCategoriesForModel(id) };
}

module.exports = {
  CATEGORIES,
  MODEL_CATEGORY_MAP,
  getCategoriesForModel,
  getModelsForCategories,
  filterModelsByCategory,
  annotateModelWithCategories,
};
