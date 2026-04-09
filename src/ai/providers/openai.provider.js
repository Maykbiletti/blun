
// OpenAI Provider for BLUN Multi-KI
module.exports = function createOpenAIProvider(apiKey) {
  return {
    name: 'openai',
    async query(opts) {
      const { model, systemPrompt, prompt, messages, temperature, maxTokens, tools, jsonMode } = opts;
      
      const msgs = [];
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
      if (messages) msgs.push(...messages);
      else if (prompt) msgs.push({ role: 'user', content: prompt });
      
      const body = { model: model || 'gpt-4.1-mini', messages: msgs };
      if (maxTokens) body.max_tokens = maxTokens;
      if (temperature != null) body.temperature = temperature;
      if (tools && tools.length) body.tools = tools.map(t => ({ type: 'function', function: t }));
      if (jsonMode) body.response_format = { type: 'json_object' };
      
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body)
      });
      
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error('OpenAI ' + resp.status + ': ' + err.substring(0, 300));
      }
      
      const data = await resp.json();
      const choice = data.choices && data.choices[0];
      
      return {
        text: choice ? choice.message.content || '' : '',
        toolCalls: choice && choice.message.tool_calls ? choice.message.tool_calls : [],
        tokensIn: data.usage ? data.usage.prompt_tokens : 0,
        tokensOut: data.usage ? data.usage.completion_tokens : 0,
        stopReason: choice ? choice.finish_reason : '',
        raw: data
      };
    }
  };
};
EOF_OPENAI
// Gemini Provider for BLUN Multi-KI
module.exports = function createGeminiProvider(apiKey) {
  return {
    name: 'gemini',
    async query(opts) {
      const { model, systemPrompt, prompt, messages, temperature, maxTokens } = opts;
      const mdl = model || 'gemini-2.5-flash-preview-04-17';
      
      const contents = [];
      if (messages) {
        messages.forEach(m => contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      } else if (prompt) {
        contents.push({ role: 'user', parts: [{ text: prompt }] });
      }
      
      const body = { contents };
      if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
      if (temperature != null || maxTokens) {
        body.generationConfig = {};
        if (temperature != null) body.generationConfig.temperature = temperature;
        if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
      }
      
      const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + mdl + ':generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error('Gemini ' + resp.status + ': ' + err.substring(0, 300));
      }
      
      const data = await resp.json();
      const cand = data.candidates && data.candidates[0];
      const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
      
      return {
        text,
        toolCalls: [],
        tokensIn: data.usageMetadata ? data.usageMetadata.promptTokenCount || 0 : 0,
        tokensOut: data.usageMetadata ? data.usageMetadata.candidatesTokenCount || 0 : 0,
        stopReason: cand ? cand.finishReason : '',
        raw: data
      };
    }
  };
};
EOF_GEMINI
// Local llama.cpp Provider for BLUN Multi-KI
module.exports = function createLocalProvider(baseUrl) {
  baseUrl = baseUrl || 'http://127.0.0.1:8080';
  return {
    name: 'local',
    async query(opts) {
      const { systemPrompt, prompt, messages, temperature, maxTokens } = opts;
      
      const body = {
        prompt: (systemPrompt ? systemPrompt + '\n\n' : '') + (prompt || (messages ? messages.map(m => m.content).join('\n') : '')),
        n_predict: maxTokens || 2048,
        temperature: temperature != null ? temperature : 0.7
      };
      
      const resp = await fetch(baseUrl + '/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error('Local ' + resp.status + ': ' + err.substring(0, 300));
      }
      
      const data = await resp.json();
      
      return {
        text: data.content || '',
        toolCalls: [],
        tokensIn: data.tokens_evaluated || 0,
        tokensOut: data.tokens_predicted || 0,
        stopReason: data.stop ? 'stop' : 'length',
        raw: data
      };
    }
  };
};
