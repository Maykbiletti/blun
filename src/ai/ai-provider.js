
// BLUN Multi-KI Provider Abstraction Layer
// Unified interface for all AI providers

const fs = require('fs');
const path = require('path');

// --- Prompt Composer ---
const PROMPT_DIR = path.join(__dirname, 'prompt_layers');

function loadPromptFile(relPath) {
  const p = path.join(PROMPT_DIR, relPath);
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; }
}

function composeSystemPrompt(role, memory, outputContract) {
  const parts = [
    loadPromptFile('global_core.md'),
    loadPromptFile('blun_identity.md'),
    loadPromptFile(`roles/${role}.md`),
    loadPromptFile('tool_rules.md'),
    memory || '',
    loadPromptFile(`output_contracts/${outputContract || 'default'}.md`)
  ];
  return parts.filter(Boolean).join('\n\n---\n\n');
}

// --- Provider Registry ---
const PROVIDERS = {};
const MODEL_REGISTRY = {};

function registerProvider(name, adapter) {
  PROVIDERS[name] = adapter;
}

function registerModel(id, meta) {
  MODEL_REGISTRY[id] = meta;
}

// --- Capability Map ---
const CAPABILITIES = ['chat', 'code', 'reasoning', 'vision', 'tool_calling', 'long_context', 'json', 'translation', 'fast', 'cheap'];

// --- Task Classification ---
function classifyTask(prompt) {
  const lower = (prompt || '').toLowerCase();
  if (/\b(code|function|class|bug|fix|implement|refactor|debug)\b/.test(lower)) return 'code';
  if (/\b(plan|strategy|priorit|roadmap|decision)\b/.test(lower)) return 'reasoning';
  if (/\b(translat|übersets)\b/.test(lower)) return 'translation';
  if (/\b(image|photo|screenshot|bild)\b/.test(lower)) return 'vision';
  return 'chat';
}

// --- Smart Routing ---
function selectModel(taskType, opts) {
  opts = opts || {};
  const priority = opts.priority || 'balanced'; // speed | quality | cost | balanced
  const requireLocal = opts.localOnly || false;
  
  const candidates = Object.entries(MODEL_REGISTRY)
    .filter(([_, m]) => m.active !== false)
    .filter(([_, m]) => !requireLocal || m.local)
    .filter(([_, m]) => m.capabilities && m.capabilities.includes(taskType))
    .map(([id, m]) => ({ id, ...m }));
  
  if (!candidates.length) {
    // Fallback: any active model
    const any = Object.entries(MODEL_REGISTRY).filter(([_, m]) => m.active !== false);
    return any.length ? { id: any[0][0], ...any[0][1] } : null;
  }
  
  // Sort by priority
  candidates.sort((a, b) => {
    if (priority === 'speed') return (a.latencyScore || 5) - (b.latencyScore || 5);
    if (priority === 'cost') return (a.costScore || 5) - (b.costScore || 5);
    if (priority === 'quality') return (b.qualityScore || 5) - (a.qualityScore || 5);
    // balanced: quality first, then cost
    return (b.qualityScore || 5) - (a.qualityScore || 5) || (a.costScore || 5) - (b.costScore || 5);
  });
  
  return candidates[0];
}

// --- Unified Query ---
async function query(opts) {
  const { prompt, systemPrompt, messages, role, taskType, priority, localOnly, memory, outputContract, model: forceModel } = opts;
  
  // Classify task if not provided
  const task = taskType || classifyTask(prompt);
  
  // Select model
  const selected = forceModel
    ? (MODEL_REGISTRY[forceModel] ? { id: forceModel, ...MODEL_REGISTRY[forceModel] } : null)
    : selectModel(task, { priority, localOnly });
  
  if (!selected) throw new Error('No model available for task: ' + task);
  
  const provider = PROVIDERS[selected.provider];
  if (!provider) throw new Error('Provider not registered: ' + selected.provider);
  
  // Compose system prompt if role given
  const sysPrompt = systemPrompt || (role ? composeSystemPrompt(role, memory, outputContract) : '');
  
  const startTime = Date.now();
  let result;
  
  try {
    result = await provider.query({
      model: selected.modelId || selected.id,
      systemPrompt: sysPrompt,
      prompt,
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      tools: opts.tools,
      jsonMode: opts.jsonMode
    });
  } catch (err) {
    // Fallback: try next model
    if (!forceModel) {
      const fallback = selectModel(task, { priority: 'cost', localOnly });
      if (fallback && fallback.id !== selected.id) {
        const fbProvider = PROVIDERS[fallback.provider];
        if (fbProvider) {
          result = await fbProvider.query({
            model: fallback.modelId || fallback.id,
            systemPrompt: sysPrompt,
            prompt,
            messages,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens
          });
          result._fallback = true;
          result._fallbackModel = fallback.id;
        }
      }
      if (!result) throw err;
    } else {
      throw err;
    }
  }
  
  result._model = selected.id;
  result._provider = selected.provider;
  result._taskType = task;
  result._latencyMs = Date.now() - startTime;
  
  return result;
}

// --- Default Models (pre-registered) ---
registerModel('claude-sonnet-4-6', {
  provider: 'anthropic', modelId: 'claude-sonnet-4-6',
  capabilities: ['chat', 'code', 'reasoning', 'vision', 'tool_calling', 'long_context', 'json', 'translation'],
  qualityScore: 9, costScore: 5, latencyScore: 6, local: false, active: true
});
registerModel('claude-haiku-4-5', {
  provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',
  capabilities: ['chat', 'code', 'reasoning', 'json', 'translation', 'fast', 'cheap'],
  qualityScore: 7, costScore: 2, latencyScore: 9, local: false, active: true
});
registerModel('gpt-4.1', {
  provider: 'openai', modelId: 'gpt-4.1',
  capabilities: ['chat', 'code', 'reasoning', 'vision', 'tool_calling', 'json', 'translation'],
  qualityScore: 9, costScore: 6, latencyScore: 7, local: false, active: true
});
registerModel('gpt-4.1-mini', {
  provider: 'openai', modelId: 'gpt-4.1-mini',
  capabilities: ['chat', 'code', 'reasoning', 'json', 'translation', 'fast', 'cheap'],
  qualityScore: 7, costScore: 2, latencyScore: 9, local: false, active: true
});
registerModel('gemini-2.5-pro', {
  provider: 'gemini', modelId: 'gemini-2.5-pro-preview-05-06',
  capabilities: ['chat', 'code', 'reasoning', 'vision', 'tool_calling', 'long_context', 'json'],
  qualityScore: 9, costScore: 4, latencyScore: 6, local: false, active: true
});
registerModel('local-default', {
  provider: 'local', modelId: 'default',
  capabilities: ['chat', 'code', 'cheap', 'fast'],
  qualityScore: 5, costScore: 1, latencyScore: 7, local: true, active: false
});

module.exports = {
  query,
  composeSystemPrompt,
  classifyTask,
  selectModel,
  registerProvider,
  registerModel,
  MODEL_REGISTRY,
  PROVIDERS,
  CAPABILITIES
};
