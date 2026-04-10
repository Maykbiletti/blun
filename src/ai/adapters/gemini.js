
// BLUN Gemini Adapter - Multimodal Google AI Implementation
// Supports: vision, audio, video, text, tools, streaming, function calling

const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Models with vision/multimodal capabilities
const MULTIMODAL_MODELS = new Set([
  'gemini-2.0-flash-exp',
  'gemini-2.0-pro-exp-02-05',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
]);

// Models with video understanding
const VIDEO_MODELS = new Set([
  'gemini-2.0-flash-exp',
  'gemini-2.0-pro-exp-02-05',
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro'
]);

// Retry with exponential backoff
async function fetchWithRetry(url, init, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, init);

      if (resp.status === 529 || resp.status === 503 || resp.status === 502) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('Gemini HTTP ' + resp.status);
        continue;
      }

      if (resp.status === 429) {
        const retryAfter = resp.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 32000);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error('Gemini rate limit (429)');
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

// Convert media to Gemini format
function normalizeContent(content) {
  if (typeof content === 'string') {
    return { text: content };
  }
  if (content.type === 'text') {
    return { text: content.text };
  }
  if (content.type === 'image') {
    // Expects: { type: 'image', mediaType, data }
    if (content.url) {
      // URL-based image
      return {
        inline_data: {
          mime_type: content.mediaType || 'image/jpeg',
          data: content.url
        }
      };
    }
    // Base64 data
    return {
      inline_data: {
        mime_type: content.mediaType || 'image/jpeg',
        data: content.data
      }
    };
  }
  if (content.type === 'video') {
    return {
      file_data: {
        mime_type: content.mediaType || 'video/mp4',
        file_uri: content.url || content.uri
      }
    };
  }
  if (content.type === 'audio') {
    return {
      file_data: {
        mime_type: content.mediaType || 'audio/mpeg',
        file_uri: content.url || content.uri
      }
    };
  }
  return { text: String(content) };
}

// Convert generic tools to Gemini format
function normalizeTools(tools) {
  if (!tools || !tools.length) return undefined;

  const definitions = [];
  for (const tool of tools) {
    let schema;
    if (tool.type === 'function' && tool.function) {
      schema = {
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters || { type: 'object', properties: {} }
      };
    } else if (tool.name) {
      schema = {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || tool.input_schema || { type: 'object', properties: {} }
      };
    }
    if (schema) definitions.push(schema);
  }

  return {
    function_declarations: definitions
  };
}

// Build messages array
function buildMessages(opts) {
  const { prompt, messages } = opts;
  if (messages && messages.length) {
    return messages.filter(m => m.role !== 'system');
  }
  if (prompt) return [{ role: 'user', parts: [normalizeContent(prompt)] }];
  return [];
}

// Parse function calls from Gemini response
function parseFunctionCalls(content) {
  const calls = [];
  if (!content) return calls;

  for (const part of content) {
    if (part.function_call) {
      calls.push({
        id: part.function_call.name,
        name: part.function_call.name,
        input: part.function_call.args || {}
      });
    }
  }
  return calls;
}

// Extract text from response parts
function extractText(content) {
  if (!content) return '';
  const parts = [];
  for (const part of content) {
    if (part.text) parts.push(part.text);
  }
  return parts.join('');
}

// Convert messages to Gemini format
function convertToGeminiMessages(messages) {
  return messages.map(m => {
    if (m.role === 'assistant') {
      return {
        role: 'model',
        parts: Array.isArray(m.content) ? m.content : [normalizeContent(m.content)]
      };
    }
    if (m.role === 'user') {
      return {
        role: 'user',
        parts: Array.isArray(m.content) ? m.content : [normalizeContent(m.content)]
      };
    }
    return m;
  });
}

module.exports = function createGeminiAdapter(config = {}) {
  const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini adapter requires GOOGLE_API_KEY');

  return {
    name: 'gemini',
    supportsMultimodal: true,
    supportsVision: true,
    supportsVideo: true,
    supportsAudio: true,
    supportsStreaming: true,
    supportsTools: true,

    // Single query
    async query(opts = {}) {
      const {
        model = DEFAULT_MODEL,
        systemPrompt,
        prompt,
        messages,
        temperature = 0.7,
        maxTokens = 2048,
        topP,
        topK,
        tools,
        safetySettings
      } = opts;

      const msgs = convertToGeminiMessages(buildMessages({ prompt, messages }));

      const body = {
        contents: msgs,
        generationConfig: {}
      };

      if (systemPrompt) {
        body.system_instruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      if (temperature != null) body.generationConfig.temperature = temperature;
      if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
      if (topP != null) body.generationConfig.topP = topP;
      if (topK != null) body.generationConfig.topK = topK;

      const normalizedTools = normalizeTools(tools);
      if (normalizedTools) {
        body.tools = [normalizedTools];
      }

      if (safetySettings) {
        body.safety_settings = safetySettings;
      }

      const resp = await fetchWithRetry(
        `${BASE_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini ${resp.status}: ${err.substring(0, 300)}`);
      }

      const data = await resp.json();

      // Handle error responses
      if (data.error) {
        throw new Error(`Gemini API error: ${data.error.message}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        return {
          text: '',
          toolCalls: [],
          tokensIn: data.usageMetadata?.promptTokenCount || 0,
          tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
          stopReason: 'no_content',
          raw: data
        };
      }

      const content = candidate.content?.parts || [];
      const text = extractText(content);
      const toolCalls = parseFunctionCalls(content);

      return {
        text,
        toolCalls,
        tokensIn: data.usageMetadata?.promptTokenCount || 0,
        tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
        stopReason: candidate.finishReason || 'unknown',
        raw: data
      };
    },

    // Streaming response
    async stream(opts = {}) {
      const {
        model = DEFAULT_MODEL,
        systemPrompt,
        prompt,
        messages,
        temperature = 0.7,
        maxTokens = 2048,
        topP,
        topK,
        tools,
        onChunk,
        onDone
      } = opts;

      const msgs = convertToGeminiMessages(buildMessages({ prompt, messages }));

      const body = {
        contents: msgs,
        generationConfig: {}
      };

      if (systemPrompt) {
        body.system_instruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      if (temperature != null) body.generationConfig.temperature = temperature;
      if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
      if (topP != null) body.generationConfig.topP = topP;
      if (topK != null) body.generationConfig.topK = topK;

      const normalizedTools = normalizeTools(tools);
      if (normalizedTools) {
        body.tools = [normalizedTools];
      }

      const resp = await fetchWithRetry(
        `${BASE_URL}/${model}:streamGenerateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini stream ${resp.status}: ${err.substring(0, 300)}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullText = '';
      let fullToolCalls = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          let data;
          try {
            data = JSON.parse(line);
          } catch {
            continue;
          }

          const candidate = data.candidates?.[0];
          if (candidate?.content?.parts) {
            const parts = candidate.content.parts;

            for (const part of parts) {
              if (part.text) {
                fullText += part.text;
                if (onChunk) onChunk(part.text);
              }
              if (part.function_call) {
                fullToolCalls.push({
                  id: part.function_call.name,
                  name: part.function_call.name,
                  input: part.function_call.args || {}
                });
              }
            }
          }

          if (data.usageMetadata) {
            totalInputTokens = data.usageMetadata.promptTokenCount || 0;
            totalOutputTokens = data.usageMetadata.candidatesTokenCount || 0;
          }
        }
      }

      const result = {
        text: fullText,
        toolCalls: fullToolCalls,
        tokensIn: totalInputTokens,
        tokensOut: totalOutputTokens,
        stopReason: 'complete'
      };

      if (onDone) onDone(result);
      return result;
    },

    // Agentic loop with tool calling
    async agent(opts = {}) {
      const {
        model,
        systemPrompt,
        initialMessages,
        prompt,
        temperature,
        maxTokens,
        tools,
        toolExecutor,
        maxRounds = 10,
        onRound
      } = opts;

      if (!toolExecutor) {
        throw new Error('Gemini agent requires toolExecutor function');
      }

      const msgs = [];
      if (initialMessages && initialMessages.length) {
        msgs.push(...convertToGeminiMessages(initialMessages.filter(m => m.role !== 'system')));
      } else if (prompt) {
        msgs.push({ role: 'user', parts: [normalizeContent(prompt)] });
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
          tools
        });

        rounds.push({ round, result });
        if (onRound) onRound(round, result);

        // No tool calls or natural stop
        if (!result.toolCalls?.length || result.stopReason === 'stop') {
          return {
            text: result.text,
            rounds,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut
          };
        }

        // Add assistant message
        msgs.push({
          role: 'model',
          parts: [{ text: result.text }]
        });

        // Execute tools
        const toolResults = [];
        for (const call of result.toolCalls) {
          let output;
          try {
            output = await toolExecutor(call.name, call.input, call.id);
          } catch (err) {
            output = { error: err.message };
          }
          toolResults.push({
            text: typeof output === 'string' ? output : JSON.stringify(output)
          });
        }

        // Add tool results as user message
        msgs.push({
          role: 'user',
          parts: toolResults
        });

        if (result.stopReason !== 'function_calls') break;
      }

      const last = rounds[rounds.length - 1];
      return {
        text: last.result.text,
        rounds,
        tokensIn: rounds.reduce((s, r) => s + (r.result.tokensIn || 0), 0),
        tokensOut: rounds.reduce((s, r) => s + (r.result.tokensOut || 0), 0)
      };
    },

    // Vision: analyze images
    async analyzeImage(opts = {}) {
      const {
        model = DEFAULT_MODEL,
        imageData,
        mediaType = 'image/jpeg',
        prompt = 'Analyze this image in detail.',
        systemPrompt,
        maxTokens = 1024
      } = opts;

      if (!MULTIMODAL_MODELS.has(model)) {
        throw new Error(`Model ${model} does not support vision`);
      }

      const content = {
        inline_data: {
          mime_type: mediaType,
          data: imageData
        }
      };

      const body = {
        contents: [
          {
            role: 'user',
            parts: [content, { text: prompt }]
          }
        ],
        generationConfig: { maxOutputTokens: maxTokens }
      };

      if (systemPrompt) {
        body.system_instruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const resp = await fetchWithRetry(
        `${BASE_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini vision ${resp.status}: ${err.substring(0, 300)}`);
      }

      const data = await resp.json();
      const text = extractText(data.candidates?.[0]?.content?.parts);

      return {
        text,
        tokensIn: data.usageMetadata?.promptTokenCount || 0,
        tokensOut: data.usageMetadata?.candidatesTokenCount || 0
      };
    },

    // Video analysis
    async analyzeVideo(opts = {}) {
      const {
        model = DEFAULT_MODEL,
        videoUri,
        prompt = 'Describe the content of this video.',
        systemPrompt,
        maxTokens = 2048
      } = opts;

      if (!VIDEO_MODELS.has(model)) {
        throw new Error(`Model ${model} does not support video`);
      }

      const content = {
        file_data: {
          mime_type: 'video/mp4',
          file_uri: videoUri
        }
      };

      const body = {
        contents: [
          {
            role: 'user',
            parts: [content, { text: prompt }]
          }
        ],
        generationConfig: { maxOutputTokens: maxTokens }
      };

      if (systemPrompt) {
        body.system_instruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const resp = await fetchWithRetry(
        `${BASE_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini video ${resp.status}: ${err.substring(0, 300)}`);
      }

      const data = await resp.json();
      const text = extractText(data.candidates?.[0]?.content?.parts);

      return {
        text,
        tokensIn: data.usageMetadata?.promptTokenCount || 0,
        tokensOut: data.usageMetadata?.candidatesTokenCount || 0
      };
    },

    // Token counting
    async countTokens(opts = {}) {
      const {
        model = DEFAULT_MODEL,
        systemPrompt,
        prompt,
        messages
      } = opts;

      const msgs = convertToGeminiMessages(buildMessages({ prompt, messages }));

      const body = {
        contents: msgs
      };

      if (systemPrompt) {
        body.system_instruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const resp = await fetchWithRetry(
        `${BASE_URL}/${model}:countTokens?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini countTokens ${resp.status}: ${err.substring(0, 300)}`);
      }

      const data = await resp.json();
      return data.totalTokens || 0;
    },

    // Embeddings
    async embed(opts = {}) {
      const {
        model = 'text-embedding-004',
        text
      } = opts;

      if (!text) throw new Error('embed requires text');

      const body = {
        model: `models/${model}`,
        content: {
          parts: [{ text }]
        }
      };

      const resp = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini embed ${resp.status}: ${err.substring(0, 300)}`);
      }

      const data = await resp.json();
      return data.embedding?.values || [];
    }
  };
};
