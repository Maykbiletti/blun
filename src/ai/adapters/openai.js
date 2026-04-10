
// BLUN OpenAI Adapter - Full Implementation
// Supports: Chat, Tool Calling, JSON Mode, Streaming, Embeddings

const DEFAULT_MODEL = 'gpt-4o';
const BASE_URL = 'https://api.openai.com/v1';

// Models supporting JSON mode (response_format)
const JSON_MODE_MODELS = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-turbo-preview',
  'gpt-4-1106-preview',
  'gpt-4-0125-preview',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-0125',
  'o1',
  'o1-mini',
  'o3',
  'o3-mini',
  'o4-mini'
]);

// Models that do NOT support temperature, top_p etc. (reasoning models)
const REASONING_MODELS = new Set([
  'o1',
  'o1-mini',
  'o1-preview',
  'o3',
  'o3-mini',
  'o4-mini'
]);

// Retry with exponential backoff
async function fetchWithRetry(url, init, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, init);

      if (resp.status === 503 || resp.status === 502) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('OpenAI HTTP ' + resp.status);
        continue;
      }
      if (resp.status === 429) {
        const retryAfter = resp.headers.get('retry-after');
        const delay = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.min(2000 * Math.pow(2, attempt), 32000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('OpenAI rate limit (429)');
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

// Convert generic / Anthropic-style tool schema to OpenAI tool format
function normalizeTools(tools) {
  if (!tools || !tools.length) return undefined;
  return tools.map(t => {
    // Already OpenAI format
    if (t.type === 'function' && t.function) return t;

    // Anthropic format: { name, description, input_schema }
    if (t.name && t.input_schema) {
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description || t.name,
          parameters: t.input_schema
        }
      };
    }

    // Bare { name, description, parameters }
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description || t.name,
        parameters: t.parameters || { type: 'object', properties: {} }
      }
    };
  });
}

// Convert tool_choice value to OpenAI format
function normalizeToolChoice(toolChoice) {
  if (!toolChoice) return undefined;
  if (toolChoice === 'auto') return 'auto';
  if (toolChoice === 'none') return 'none';
  if (toolChoice === 'required') return 'required';
  if (typeof toolChoice === 'string') {
    return { type: 'function', function: { name: toolChoice } };
  }
  // already object
  return toolChoice;
}

// Build messages array from opts
function buildMessages(opts) {
  const { prompt, messages, systemPrompt } = opts;

  if (messages && messages.length) {
    // Inject system prompt if not already in messages
    const hasSystem = messages.some(m => m.role === 'system');
    if (systemPrompt && !hasSystem) {
      return [{ role: 'system', content: systemPrompt }, ...messages];
    }
    return messages;
  }

  const result = [];
  if (systemPrompt) result.push({ role: 'system', content: systemPrompt });
  if (prompt) result.push({ role: 'user', content: prompt });
  return result;
}

// Parse SSE streaming response into full result
async function collectStream(resp) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let textParts = [];
  let toolCallMap = {}; // index -> { id, name, argumentsBuf }
  let finishReason = null;
  let usage = { prompt_tokens: 0, completion_tokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;

      let chunk;
      try { chunk = JSON.parse(raw); } catch { continue; }

      const choice = chunk.choices && chunk.choices[0];
      if (!choice) {
        // usage may be in top-level object on last chunk
        if (chunk.usage) {
          usage.prompt_tokens = chunk.usage.prompt_tokens || 0;
          usage.completion_tokens = chunk.usage.completion_tokens || 0;
        }
        continue;
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta || {};

      if (delta.content) textParts.push(delta.content);

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallMap[idx]) {
            toolCallMap[idx] = { id: '', name: '', argumentsBuf: '' };
          }
          if (tc.id) toolCallMap[idx].id = tc.id;
          if (tc.function) {
            if (tc.function.name) toolCallMap[idx].name += tc.function.name;
            if (tc.function.arguments) toolCallMap[idx].argumentsBuf += tc.function.arguments;
          }
        }
      }

      if (chunk.usage) {
        usage.prompt_tokens = chunk.usage.prompt_tokens || usage.prompt_tokens;
        usage.completion_tokens = chunk.usage.completion_tokens || usage.completion_tokens;
      }
    }
  }

  const toolCalls = Object.values(toolCallMap).map(tc => {
    let args = {};
    try { args = JSON.parse(tc.argumentsBuf); } catch {}
    return { id: tc.id, name: tc.name, input: args };
  });

  return {
    text: textParts.join(''),
    toolCalls,
    tokensIn: usage.prompt_tokens,
    tokensOut: usage.completion_tokens,
    stopReason: finishReason,
    raw: { streamed: true, usage }
  };
}

// Main adapter factory
module.exports = function createOpenAIAdapter(config) {
  config = config || {};
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = config.baseUrl || BASE_URL;

  if (!apiKey) {
    console.warn('[openai-adapter] No API key — set OPENAI_API_KEY or pass config.apiKey');
  }

  function getHeaders() {
    const h = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    };
    if (config.organization) h['OpenAI-Organization'] = config.organization;
    if (config.project) h['OpenAI-Project'] = config.project;
    return h;
  }

  return {
    name: 'openai',
    config,

    models: {
      default: DEFAULT_MODEL,
      fast: 'gpt-4o-mini',
      quality: 'gpt-4o',
      reasoning: 'o3',
      longContext: 'gpt-4o'
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
        topP,
        stopSequences,
        toolChoice,
        frequencyPenalty,
        presencePenalty,
        seed,
        user
      } = opts;

      const resolvedModel = model || DEFAULT_MODEL;
      const isReasoning = REASONING_MODELS.has(resolvedModel);

      const msgs = buildMessages({ prompt, messages, systemPrompt });
      if (!msgs.length) throw new Error('openai-adapter: no messages or prompt provided');

      const body = {
        model: resolvedModel,
        messages: msgs
      };

      // max_tokens
      if (maxTokens != null) {
        // Reasoning models use max_completion_tokens
        if (isReasoning) {
          body.max_completion_tokens = maxTokens;
        } else {
          body.max_tokens = maxTokens;
        }
      }

      // Sampling params (not for reasoning models)
      if (!isReasoning) {
        if (temperature != null) body.temperature = temperature;
        if (topP != null) body.top_p = topP;
        if (frequencyPenalty != null) body.frequency_penalty = frequencyPenalty;
        if (presencePenalty != null) body.presence_penalty = presencePenalty;
      }

      if (stopSequences && stopSequences.length) body.stop = stopSequences;
      if (seed != null) body.seed = seed;
      if (user) body.user = user;

      // Tool calling
      const normalizedTools = normalizeTools(tools);
      if (normalizedTools && normalizedTools.length) {
        body.tools = normalizedTools;
        const tc = normalizeToolChoice(toolChoice);
        if (tc != null) body.tool_choice = tc;
      }

      // JSON mode
      if (jsonMode) {
        const supportsJsonMode = JSON_MODE_MODELS.has(resolvedModel);
        if (supportsJsonMode) {
          body.response_format = { type: 'json_object' };
          // Ensure system prompt instructs JSON output (OpenAI requirement)
          const hasJsonInstruction = msgs.some(
            m => m.role === 'system' && typeof m.content === 'string' && m.content.toLowerCase().includes('json')
          );
          if (!hasJsonInstruction) {
            const sysIdx = msgs.findIndex(m => m.role === 'system');
            if (sysIdx >= 0 && typeof msgs[sysIdx].content === 'string') {
              msgs[sysIdx] = {
                ...msgs[sysIdx],
                content: msgs[sysIdx].content + '\n\nRespond ONLY with valid JSON.'
              };
            } else {
              msgs.unshift({ role: 'system', content: 'Respond ONLY with valid JSON.' });
            }
          }
        }
      }

      if (stream) body.stream = true;
      // Request usage in stream
      if (stream) body.stream_options = { include_usage: true };

      const resp = await fetchWithRetry(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: getHeaders(),
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
        throw new Error('OpenAI ' + resp.status + ': ' + errMsg.substring(0, 500));
      }

      if (stream) return collectStream(resp);

      const data = await resp.json();
      const choice = data.choices && data.choices[0];
      if (!choice) throw new Error('openai-adapter: no choice in response');

      const msg = choice.message || {};
      const text = msg.content || '';

      // Normalize tool_calls
      const toolCalls = (msg.tool_calls || []).map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}
        return {
          id: tc.id,
          name: tc.function.name,
          input: args
        };
      });

      // JSON mode: parse
      let parsedJson = null;
      if (jsonMode && text) {
        try {
          const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
          parsedJson = JSON.parse(cleaned);
        } catch {}
      }

      return {
        text,
        toolCalls,
        json: parsedJson,
        tokensIn: data.usage ? data.usage.prompt_tokens : 0,
        tokensOut: data.usage ? data.usage.completion_tokens : 0,
        stopReason: choice.finish_reason,
        raw: data
      };
    },

    // Agent loop: call model repeatedly, executing tools, until done
    async agentLoop(opts, toolExecutor) {
      if (typeof toolExecutor !== 'function') {
        throw new Error('openai-adapter agentLoop: toolExecutor must be a function');
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
        jsonMode,
        onRound
      } = opts;

      const msgs = buildMessages({ prompt, messages: initialMessages, systemPrompt });

      const rounds = [];
      let round = 0;

      while (round < maxRounds) {
        round++;
        const result = await this.query({
          model,
          messages: msgs,
          temperature,
          maxTokens,
          tools,
          topP,
          jsonMode
        });

        rounds.push({ round, result });
        if (onRound) onRound(round, result);

        const done =
          !result.toolCalls ||
          !result.toolCalls.length ||
          result.stopReason === 'stop';

        if (done) {
          return {
            text: result.text,
            json: result.json,
            rounds,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut
          };
        }

        // Append assistant message
        const assistantMsg = {
          role: 'assistant',
          content: result.text || null,
          tool_calls: result.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) }
          }))
        };
        msgs.push(assistantMsg);

        // Execute tools and append results
        for (const call of result.toolCalls) {
          let output;
          try {
            output = await toolExecutor(call.name, call.input, call.id);
          } catch (err) {
            output = { error: err.message };
          }
          msgs.push({
            role: 'tool',
            tool_call_id: call.id,
            content: typeof output === 'string' ? output : JSON.stringify(output)
          });
        }

        if (result.stopReason !== 'tool_calls') break;
      }

      const last = rounds[rounds.length - 1];
      return {
        text: last.result.text,
        json: last.result.json,
        rounds,
        tokensIn: rounds.reduce((s, r) => s + (r.result.tokensIn || 0), 0),
        tokensOut: rounds.reduce((s, r) => s + (r.result.tokensOut || 0), 0)
      };
    },

    // Embeddings
    async embed(opts) {
      const {
        input,
        model: embModel,
        dimensions,
        encodingFormat,
        user
      } = opts;

      if (!input) throw new Error('openai-adapter embed: input is required');

      const body = {
        model: embModel || 'text-embedding-3-small',
        input
      };
      if (dimensions != null) body.dimensions = dimensions;
      if (encodingFormat) body.encoding_format = encodingFormat;
      if (user) body.user = user;

      const resp = await fetchWithRetry(baseUrl + '/embeddings', {
        method: 'POST',
        headers: getHeaders(),
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
        throw new Error('OpenAI embeddings ' + resp.status + ': ' + errMsg.substring(0, 500));
      }

      const data = await resp.json();
      const items = data.data || [];

      // Single input -> single vector; array input -> array of vectors
      if (typeof input === 'string' || (Array.isArray(input) && input.length === 1)) {
        return {
          embedding: items[0] ? items[0].embedding : [],
          tokensIn: data.usage ? data.usage.prompt_tokens : 0,
          raw: data
        };
      }

      return {
        embeddings: items.map(item => item.embedding),
        tokensIn: data.usage ? data.usage.prompt_tokens : 0,
        raw: data
      };
    },

    // List available models
    async listModels() {
      const resp = await fetchWithRetry(baseUrl + '/models', {
        method: 'GET',
        headers: getHeaders()
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('OpenAI listModels ' + resp.status + ': ' + errText.substring(0, 300));
      }

      const data = await resp.json();
      return (data.data || []).map(m => m.id).sort();
    }
  };
};
