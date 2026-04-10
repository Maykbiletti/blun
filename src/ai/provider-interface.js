
// BLUN Unified Provider Interface
// Normalized internal interface for all AI providers
// Methods: chat, stream, embed, tools

const fs = require('fs');
const path = require('path');

// Load adapters dynamically
const anthropicAdapter = require('./adapters/anthropic');
const openaiAdapter = require('./adapters/openai');
const groqAdapter = require('./adapters/groq');
const mistralAdapter = require('./adapters/mistral');
const deepseekAdapter = require('./adapters/deepseek');
const xaiAdapter = require('./adapters/xai');
const togetherAdapter = require('./adapters/together');
const openrouterAdapter = require('./adapters/openrouter');

// Provider registry
const providerRegistry = {
  anthropic: null,
  openai: null,
  groq: null,
  mistral: null,
  deepseek: null,
  xai: null,
  together: null,
  openrouter: null
};

// Initialize providers
function initializeProviders(config = {}) {
  providerRegistry.anthropic = anthropicAdapter({
    apiKey: config.anthropicKey || process.env.ANTHROPIC_API_KEY
  });

  providerRegistry.openai = openaiAdapter({
    apiKey: config.openaiKey || process.env.OPENAI_API_KEY
  });

  providerRegistry.groq = groqAdapter({
    apiKey: config.groqKey || process.env.GROQ_API_KEY
  });

  providerRegistry.mistral = mistralAdapter({
    apiKey: config.mistralKey || process.env.MISTRAL_API_KEY
  });

  providerRegistry.deepseek = deepseekAdapter({
    apiKey: config.deepseekKey || process.env.DEEPSEEK_API_KEY
  });

  providerRegistry.xai = xaiAdapter({
    apiKey: config.xaiKey || process.env.XAI_API_KEY
  });

  providerRegistry.together = togetherAdapter({
    apiKey: config.togetherKey || process.env.TOGETHER_API_KEY
  });

  providerRegistry.openrouter = openrouterAdapter({
    apiKey: config.openrouterKey || process.env.OPENROUTER_API_KEY
  });
}

// Get provider by name
function getProvider(providerName) {
  if (!providerRegistry[providerName]) {
    throw new Error(`Provider not found: ${providerName}. Available: ${Object.keys(providerRegistry).join(', ')}`);
  }
  return providerRegistry[providerName];
}

// Normalize result format across all providers
function normalizeResult(providerName, result) {
  return {
    text: result.text || '',
    tokens: {
      input: result.tokensIn || result.input_tokens || 0,
      output: result.tokensOut || result.output_tokens || 0,
      cache_read: result.cacheRead || 0,
      cache_write: result.cacheWrite || 0
    },
    finish_reason: result.stopReason || result.finish_reason || 'unknown',
    tool_calls: result.toolCalls || [],
    thinking: result.thinking || null,
    json: result.json || null,
    raw: result.raw || {}
  };
}

// Chat: Simple text-in, text-out
async function chat(opts) {
  const {
    provider = 'anthropic',
    model,
    system,
    user,
    messages,
    temperature = 0.7,
    max_tokens,
    response_format
  } = opts;

  if (!user && !messages) {
    throw new Error('chat: requires user prompt or messages array');
  }

  const providerAdapter = getProvider(provider);
  if (!providerAdapter) {
    throw new Error(`Provider not initialized: ${provider}`);
  }

  const msgs = messages || [{ role: 'user', content: user }];

  try {
    const result = await providerAdapter.query({
      model,
      systemPrompt: system,
      messages: msgs,
      temperature,
      maxTokens: max_tokens,
      jsonMode: response_format === 'json_object'
    });

    return normalizeResult(provider, result);
  } catch (err) {
    throw new Error(`${provider} chat failed: ${err.message}`);
  }
}

// Stream: Streaming text response
async function stream(opts, onChunk) {
  const {
    provider = 'anthropic',
    model,
    system,
    user,
    messages,
    temperature = 0.7,
    max_tokens
  } = opts;

  if (!user && !messages) {
    throw new Error('stream: requires user prompt or messages array');
  }

  if (typeof onChunk !== 'function') {
    throw new Error('stream: onChunk callback required');
  }

  const providerAdapter = getProvider(provider);
  if (!providerAdapter) {
    throw new Error(`Provider not initialized: ${provider}`);
  }

  const msgs = messages || [{ role: 'user', content: user }];

  try {
    const result = await providerAdapter.query({
      model,
      systemPrompt: system,
      messages: msgs,
      temperature,
      maxTokens: max_tokens,
      stream: true
    });

    // Call onChunk for streaming updates
    if (result.text) {
      onChunk({ type: 'text', content: result.text });
    }

    if (result.toolCalls && result.toolCalls.length) {
      onChunk({ type: 'tool_calls', calls: result.toolCalls });
    }

    return normalizeResult(provider, result);
  } catch (err) {
    throw new Error(`${provider} stream failed: ${err.message}`);
  }
}

// Embed: Generate embeddings for text
async function embed(opts) {
  const {
    provider = 'anthropic',
    model = 'text-embedding-3-small',
    input,
    dimensions
  } = opts;

  if (!input) {
    throw new Error('embed: requires input text or array');
  }

  const providerAdapter = getProvider(provider);
  if (!providerAdapter || !providerAdapter.embed) {
    throw new Error(`Provider ${provider} does not support embeddings`);
  }

  try {
    const result = await providerAdapter.embed({
      model,
      input,
      dimensions
    });

    return {
      embeddings: result.embeddings || result.data || [],
      model: result.model || model,
      usage: {
        input_tokens: result.usage?.prompt_tokens || 0
      },
      raw: result.raw || {}
    };
  } catch (err) {
    throw new Error(`${provider} embed failed: ${err.message}`);
  }
}

// Tools: Function calling / tool use
async function tools(opts, toolExecutor) {
  const {
    provider = 'anthropic',
    model,
    system,
    user,
    messages,
    tools: toolDefinitions,
    temperature = 0.7,
    max_tokens,
    tool_choice = 'auto',
    max_rounds = 10
  } = opts;

  if (!toolDefinitions || !toolDefinitions.length) {
    throw new Error('tools: requires tools array');
  }

  if (!user && !messages) {
    throw new Error('tools: requires user prompt or messages array');
  }

  if (typeof toolExecutor !== 'function') {
    throw new Error('tools: toolExecutor callback required');
  }

  const providerAdapter = getProvider(provider);
  if (!providerAdapter) {
    throw new Error(`Provider not initialized: ${provider}`);
  }

  // Use agentLoop if available, else fall back to sequential query + execution
  if (providerAdapter.agentLoop) {
    const msgs = messages || [{ role: 'user', content: user }];

    try {
      const result = await providerAdapter.agentLoop({
        model,
        systemPrompt: system,
        messages: msgs,
        tools: toolDefinitions,
        temperature,
        maxTokens: max_tokens,
        toolChoice: tool_choice,
        maxRounds: max_rounds
      }, toolExecutor);

      return {
        text: result.text,
        thinking: result.thinking || null,
        rounds: result.rounds || [],
        tokens: {
          input: result.tokensIn || 0,
          output: result.tokensOut || 0
        },
        raw: result.raw || {}
      };
    } catch (err) {
      throw new Error(`${provider} tools failed: ${err.message}`);
    }
  }

  // Fallback: single query with tool_calls
  const msgs = messages || [{ role: 'user', content: user }];

  try {
    const result = await providerAdapter.query({
      model,
      systemPrompt: system,
      messages: msgs,
      tools: toolDefinitions,
      temperature,
      maxTokens: max_tokens,
      toolChoice: tool_choice
    });

    const toolCalls = result.toolCalls || [];
    const executionResults = [];

    for (const call of toolCalls) {
      try {
        const output = await toolExecutor(call.name || call.function?.name, call.input || call.arguments, call.id);
        executionResults.push({
          tool_call_id: call.id,
          output: typeof output === 'string' ? output : JSON.stringify(output)
        });
      } catch (err) {
        executionResults.push({
          tool_call_id: call.id,
          error: err.message
        });
      }
    }

    return {
      text: result.text,
      tool_calls: toolCalls,
      execution_results: executionResults,
      tokens: {
        input: result.tokensIn || 0,
        output: result.tokensOut || 0
      },
      raw: result.raw || {}
    };
  } catch (err) {
    throw new Error(`${provider} tools failed: ${err.message}`);
  }
}

// Export normalized interface
module.exports = {
  // Initialization
  initialize: initializeProviders,
  getProvider,

  // Normalized methods
  chat,
  stream,
  embed,
  tools,

  // Re-export provider registry for direct access if needed
  providers: providerRegistry
};
