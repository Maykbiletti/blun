
// BLUN Local llama.cpp Adapter - Offline LLM via HTTP
// Connects to llama-server on 127.0.0.1:8090
// Supports: Chat, Streaming, Temperature Control
// Note: Tool calling not supported (pure text generation)

const DEFAULT_MODEL = 'llama2';
const BASE_URL = 'http://127.0.0.1:8090';
const HEALTH_CHECK_TIMEOUT = 5000;

// Check if llama server is running
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const resp = await fetch(BASE_URL + '/v1/models', {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);
    return resp.ok;
  } catch (err) {
    return false;
  }
}

// Retry with exponential backoff (local server)
async function fetchWithRetry(url, init, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, init);

      if (resp.status === 503 || resp.status === 502) {
        const delay = Math.min(500 * Math.pow(2, attempt), 4000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('llama-server HTTP ' + resp.status);
        continue;
      }

      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.min(300 * Math.pow(2, attempt), 2000)));
      }
    }
  }
  throw lastErr;
}

// Build messages array from opts (same as other adapters)
function buildMessages(opts) {
  const { prompt, messages, systemPrompt } = opts;

  if (messages && messages.length) {
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

// Parse streaming response (SSE from llama-server)
async function collectStream(resp) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data:')) continue;

      try {
        const jsonStr = line.substring('data:'.length).trim();
        if (jsonStr === '[DONE]') continue;

        const data = JSON.parse(jsonStr);
        if (data.choices && data.choices[0]) {
          const delta = data.choices[0].delta;
          if (delta && delta.content) {
            fullText += delta.content;
            tokenCount++;
          }
        }
      } catch (err) {
        // Skip malformed lines
      }
    }
  }

  return {
    text: fullText,
    toolCalls: [],
    tokensIn: 0,
    tokensOut: tokenCount,
    stopReason: 'end_turn',
    raw: { streamed: true, local: true }
  };
}

// Parse non-streaming response
function parseResponse(data) {
  if (!data.choices || !data.choices[0]) {
    throw new Error('llama-server: no choices in response');
  }

  const choice = data.choices[0];
  const text = choice.message ? choice.message.content : choice.text || '';

  // llama-server returns usage if available
  const usage = data.usage || {};

  return {
    text,
    toolCalls: [], // llama.cpp doesn't support tool calling
    tokensIn: usage.prompt_tokens || 0,
    tokensOut: usage.completion_tokens || 0,
    stopReason: choice.finish_reason || 'stop',
    raw: { streamed: false, usage }
  };
}

// Main adapter factory
module.exports = function createLocalAdapter(config) {
  config = config || {};
  const baseUrl = config.baseUrl || BASE_URL;
  const model = config.model || DEFAULT_MODEL;

  return {
    name: 'local',
    config,

    models: {
      default: model,
      fast: model,
      quality: model,
      reasoning: model,
      longContext: model
    },

    async query(opts) {
      const {
        model: overrideModel,
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
        topK
      } = opts;

      const resolvedModel = overrideModel || model;
      const msgs = buildMessages({ prompt, messages, systemPrompt });

      if (!msgs.length) {
        throw new Error('local-adapter: no messages or prompt provided');
      }

      // Check server health first (fail fast if unavailable)
      const healthy = await checkServerHealth();
      if (!healthy) {
        throw new Error('llama-server not responding on ' + baseUrl);
      }

      // Build request body (OpenAI-compatible format)
      const body = {
        model: resolvedModel,
        messages: msgs
      };

      // Sampling parameters
      if (temperature != null) body.temperature = Math.max(0, Math.min(2, temperature));
      if (topP != null) body.top_p = topP;
      if (topK != null) body.top_k = topK;
      if (maxTokens != null) body.max_tokens = maxTokens;
      if (stopSequences && stopSequences.length) body.stop = stopSequences;

      if (stream) body.stream = true;

      // Note: tools/jsonMode ignored - llama.cpp doesn't support these
      if (tools && tools.length) {
        console.warn('[local-adapter] Tool calling not supported - falling back to text generation');
      }
      if (jsonMode) {
        console.warn('[local-adapter] JSON mode not natively supported - relying on prompt engineering');
      }

      const resp = await fetchWithRetry(baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        let errMsg;
        try {
          const errText = await resp.text();
          const errJson = JSON.parse(errText);
          errMsg = errJson.error ? errJson.error.message : errText;
        } catch {
          errMsg = await resp.text();
        }
        throw new Error('llama-server ' + resp.status + ': ' + errMsg.substring(0, 300));
      }

      if (stream) {
        return collectStream(resp);
      }

      const data = await resp.json();
      return parseResponse(data);
    }
  };
};
