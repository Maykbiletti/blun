
// Anthropic Claude Provider for BLUN Multi-KI
module.exports = function createAnthropicProvider(apiKey) {
  return {
    name: 'anthropic',
    async query(opts) {
      const { model, systemPrompt, prompt, messages, temperature, maxTokens, tools } = opts;
      
      const msgs = messages || [{ role: 'user', content: prompt }];
      const body = {
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens || 4096,
        messages: msgs
      };
      if (systemPrompt) body.system = systemPrompt;
      if (temperature != null) body.temperature = temperature;
      if (tools && tools.length) body.tools = tools;
      
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error('Anthropic ' + resp.status + ': ' + err.substring(0, 300));
      }
      
      const data = await resp.json();
      const textBlock = data.content && data.content.find(c => c.type === 'text');
      
      return {
        text: textBlock ? textBlock.text : '',
        toolCalls: data.content ? data.content.filter(c => c.type === 'tool_use') : [],
        tokensIn: data.usage ? data.usage.input_tokens : 0,
        tokensOut: data.usage ? data.usage.output_tokens : 0,
        stopReason: data.stop_reason,
        raw: data
      };
    }
  };
};
