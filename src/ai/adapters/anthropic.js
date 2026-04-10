
// BLUN Anthropic Adapter - Full Implementation
// Supports: long context, text quality, agents/tools, reasoning (extended thinking)

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

// Models that support extended thinking / reasoning
const REASONING_MODELS = new Set([
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-7-sonnet-20250219'
]);

// Models with large context windows (200k+)
const LONG_CONTEXT_MODELS = new Set([
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022'
]);

// Retry with exponential backoff for rate limits / transient errors
async function fetchWithRetry(url, init, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, init);

      // Retryable HTTP errors
      if (resp.status === 529 || resp.status === 503 || resp.status === 502) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('Anthropic HTTP ' + resp.status);
        continue;
      }
      if (resp.status === 429) {
        const retryAfter = resp.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 32000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('Anthropic rate limit (429)');
        continue;
      }

      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.min(500 * Math.pow(2, attempt), 8000)));
      }
    }
  }
  throw lastErr;
}

// Convert generic tool schema to Anthropic tool format
function normalizeTools(tools) {
  if (!tools || !tools.length) return undefined;
  return tools.map(t => {
    if (t.type === 'function' && t.function) {
      // OpenAI-style function schema -> Anthropic
      return {
        name: t.function.name,
        description: t.function.description || '',
        input_schema: t.function.parameters || { type: 'object', properties: {} }
      };
    }
    if (t.name && t.input_schema) return t; // already Anthropic format
    // bare object with name/description/parameters
    return {
      name: t.name,
      description: t.description || '',
      input_schema: t.parameters || t.input_schema || { type: 'object', properties: {} }
    };
  });
}

// Build messages array from opts
function buildMessages(opts) {
  const { prompt, messages } = opts;
  if (messages && messages.length) {
    // Pass through, but filter out system messages (go to body.system)
    return messages.filter(m => m.role !== 'system');
  }
  if (prompt) return [{ role: 'user', content: prompt }];
  return [];
}

// Add prompt caching headers for long-context sessions (>32k tokens estimated)
function addCacheControl(messages, systemPrompt) {
  // Mark large system prompts for caching
  if (systemPrompt && systemPrompt.length > 4000) {
    return {
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    };
  }
  return { system: systemPrompt || undefined };
}

// Parse streaming SSE response into full result
async function collectStream(resp) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let textParts = [];
  let toolUseBlocks = [];
  let usage = { input_tokens: 0, output_tokens: 0 };
  let stopReason = 'end_turn';
  let currentToolBlock = null;
  let currentToolInput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }

      if (evt.type === 'content_block_start') {
        if (evt.content_block.type === 'tool_use') {
          currentToolBlock = { id: evt.content_block.id, name: evt.content_block.name };
          currentToolInput = '';
        }
      } else if (evt.type === 'content_block_delta') {
        if (evt.delta.type === 'text_delta') {
          textParts.push(evt.delta.text);
        } else if (evt.delta.type === 'input_json_delta') {
          currentToolInput += evt.delta.partial_json;
        } else if (evt.delta.type === 'thinking_delta') {
          // Reasoning content - attach to special field
          // (handled via raw blocks)
        }
      } else if (evt.type === 'content_block_stop') {
        if (currentToolBlock) {
          let parsedInput = {};
          try { parsedInput = JSON.parse(currentToolInput); } catch {}
          toolUseBlocks.push({ ...currentToolBlock, input: parsedInput });
          currentToolBlock = null;
          currentToolInput = '';
        }
      } else if (evt.type === 'message_delta') {
        if (evt.delta.stop_reason) stopReason = evt.delta.stop_reason;
        if (evt.usage) {
          usage.output_tokens = evt.usage.output_tokens || usage.output_tokens;
        }
      } else if (evt.type === 'message_start') {
        if (evt.message.usage) {
          usage.input_tokens = evt.message.usage.input_tokens || 0;
        }
      }
    }
  }

  return {
    text: textParts.join(''),
    toolCalls: toolUseBlocks,
    tokensIn: usage.input_tokens,
    tokensOut: usage.output_tokens,
    stopReason,
    raw: { streamed: true, usage }
  };
}

// Main adapter factory
module.exports = function createAnthropicAdapter(config) {
  config = config || {};
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('[anthropic-adapter] No API key — set ANTHROPIC_API_KEY or pass config.apiKey');
  }

  return {
    name: 'anthropic',
    config,

    // Expose model list for routing
    models: {
      default: DEFAULT_MODEL,
      fast: 'claude-haiku-4-5-20251001',
      quality: 'claude-opus-4-6',
      reasoning: 'claude-sonnet-4-6',
      longContext: 'claude-opus-4-6'
    },

    async query(opts) {
      const {
        model,
        systemPrompt,
        prompt,
        messages,
        temperature,
        maxTokens,
        tools,
        jsonMode,
        stream = false,
        // Reasoning / extended thinking
        thinking = false,
        thinkingBudget,
        // Long context
        useCache = false,
        // Text quality
        topP,
        topK,
        stopSequences,
        // Agent loop controls
        toolChoice,
        maxRounds = 10
      } = opts;

      const resolvedModel = model || DEFAULT_MODEL;
      const resolvedMax = maxTokens || (LONG_CONTEXT_MODELS.has(resolvedModel) ? 16384 : 4096);

      // Build messages
      const msgs = buildMessages(opts);
      if (!msgs.length) throw new Error('anthropic-adapter: no messages or prompt provided');

      // System prompt with optional cache control
      const systemObj = (useCache || (systemPrompt && systemPrompt.length > 4000))
        ? addCacheControl(msgs, systemPrompt)
        : { system: systemPrompt || undefined };

      // Body
      const body = {
        model: resolvedModel,
        max_tokens: resolvedMax,
        messages: msgs,
        ...systemObj
      };

      // Temperature (not allowed with extended thinking)
      if (!thinking && temperature != null) body.temperature = temperature;
      if (!thinking && topP != null) body.top_p = topP;
      if (!thinking && topK != null) body.top_k = topK;
      if (stopSequences && stopSequences.length) body.stop_sequences = stopSequences;

      // Extended thinking / reasoning
      if (thinking && REASONING_MODELS.has(resolvedModel)) {
        body.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget || Math.floor(resolvedMax * 0.8)
        };
        // Thinking requires temperature=1
        body.temperature = 1;
      }

      // Tools / function calling
      const normalizedTools = normalizeTools(tools);
      if (normalizedTools) {
        body.tools = normalizedTools;
        if (toolChoice) {
          if (typeof toolChoice === 'string') {
            body.tool_choice = toolChoice === 'auto' ? { type: 'auto' }
              : toolChoice === 'none' ? { type: 'none' }
              : { type: 'tool', name: toolChoice };
          } else {
            body.tool_choice = toolChoice;
          }
        }
      }

      // JSON mode via system instruction
      if (jsonMode && !normalizedTools) {
        const jsonInstruction = '\n\nRespond ONLY with valid JSON, no markdown, no explanation.';
        if (body.system) {
          if (typeof body.system === 'string') body.system += jsonInstruction;
          else if (Array.isArray(body.system)) body.system[0].text += jsonInstruction;
        } else {
          body.system = jsonInstruction.trim();
        }
      }

      if (stream) body.stream = true;

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      };

      // Enable beta features
      if (useCache) headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
      if (thinking) {
        headers['anthropic-beta'] = headers['anthropic-beta']
          ? headers['anthropic-beta'] + ',interleaved-thinking-2025-05-14'
          : 'interleaved-thinking-2025-05-14';
      }

      const resp = await fetchWithRetry(BASE_URL + '/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        let errMsg;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error ? errJson.error.message : errText;
        } catch {
          errMsg = errText;
        }
        throw new Error('Anthropic ' + resp.status + ': ' + errMsg.substring(0, 500));
      }

      if (stream) {
        return collectStream(resp);
      }

      const data = await resp.json();
      const textBlock = data.content && data.content.find(c => c.type === 'text');
      const thinkingBlock = data.content && data.content.find(c => c.type === 'thinking');
      const toolUseBlocks = data.content ? data.content.filter(c => c.type === 'tool_use') : [];

      // JSON mode: attempt to parse
      let parsedJson = null;
      if (jsonMode && textBlock) {
        try {
          const raw = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
          parsedJson = JSON.parse(raw);
        } catch {}
      }

      return {
        text: textBlock ? textBlock.text : '',
        thinking: thinkingBlock ? thinkingBlock.thinking : null,
        toolCalls: toolUseBlocks,
        json: parsedJson,
        tokensIn: data.usage ? data.usage.input_tokens : 0,
        tokensOut: data.usage ? data.usage.output_tokens : 0,
        cacheRead: data.usage ? (data.usage.cache_read_input_tokens || 0) : 0,
        cacheWrite: data.usage ? (data.usage.cache_creation_input_tokens || 0) : 0,
        stopReason: data.stop_reason,
        raw: data
      };
    },

    // Agent loop: repeatedly call the model, executing tools, until done
    async agentLoop(opts, toolExecutor) {
      if (typeof toolExecutor !== 'function') {
        throw new Error('anthropic-adapter agentLoop: toolExecutor must be a function');
      }

      const {
        maxRounds = 10,
        model,
        systemPrompt,
        prompt,
        messages: initialMessages,
        temperature,
        maxTokens,
        tools,
        topP,
        topK,
        thinking,
        thinkingBudget,
        useCache,
        onRound
      } = opts;

      const msgs = [];
      if (initialMessages && initialMessages.length) {
        msgs.push(...initialMessages.filter(m => m.role !== 'system'));
      } else if (prompt) {
        msgs.push({ role: 'user', content: prompt });
      }

      const rounds = [];
      let round = 0;

      while (round < maxRounds) {
        round++;
        const result = await this.query({
          model,
          systemPrompt,
          messages: msgs,
          temperature,
          maxTokens,
          tools,
          topP,
          topK,
          thinking,
          thinkingBudget,
          useCache
        });

        rounds.push({ round, result });
        if (onRound) onRound(round, result);

        // If no tool calls or model stopped naturally, we're done
        if (!result.toolCalls || !result.toolCalls.length || result.stopReason === 'end_turn') {
          return { text: result.text, thinking: result.thinking, rounds, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
        }

        // Append assistant message with all content blocks
        msgs.push({
          role: 'assistant',
          content: result.raw.content || [{ type: 'text', text: result.text }]
        });

        // Execute tools and collect results
        const toolResults = [];
        for (const call of result.toolCalls) {
          let output;
          try {
            output = await toolExecutor(call.name, call.input, call.id);
          } catch (err) {
            output = { error: err.message };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: typeof output === 'string' ? output : JSON.stringify(output)
          });
        }

        msgs.push({ role: 'user', content: toolResults });

        if (result.stopReason !== 'tool_use') break;
      }

      // Return last text result from rounds
      const last = rounds[rounds.length - 1];
      return {
        text: last.result.text,
        thinking: last.result.thinking,
        rounds,
        tokensIn: rounds.reduce((s, r) => s + (r.result.tokensIn || 0), 0),
        tokensOut: rounds.reduce((s, r) => s + (r.result.tokensOut || 0), 0)
      };
    },

    // Convenience: count tokens for a prompt (uses Anthropic count_tokens endpoint)
    async countTokens(opts) {
      const { model, systemPrompt, prompt, messages, tools } = opts;
      const msgs = buildMessages({ prompt, messages });
      const body = { model: model || DEFAULT_MODEL, messages: msgs };
      if (systemPrompt) body.system = systemPrompt;
      const normalizedTools = normalizeTools(tools);
      if (normalizedTools) body.tools = normalizedTools;

      const resp = await fetchWithRetry(BASE_URL + '/messages/count_tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error('Anthropic countTokens ' + resp.status + ': ' + err.substring(0, 300));
      }

      const data = await resp.json();
      return data.input_tokens || 0;
    }
  };
};
