
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
