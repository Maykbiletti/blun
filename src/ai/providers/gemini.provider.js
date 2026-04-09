// Gemini Provider for BLUN Multi-KI
module.exports = function createGeminiProvider(apiKey) {
  return {
    name: "gemini",
    async query(opts) {
      var mdl = opts.model || "gemini-2.5-flash-preview-04-17";
      var contents = [];
      if (opts.messages) {
        opts.messages.forEach(function(m) { contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }); });
      } else if (opts.prompt) {
        contents.push({ role: "user", parts: [{ text: opts.prompt }] });
      }
      var body = { contents: contents };
      if (opts.systemPrompt) body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
      if (opts.temperature != null || opts.maxTokens) {
        body.generationConfig = {};
        if (opts.temperature != null) body.generationConfig.temperature = opts.temperature;
        if (opts.maxTokens) body.generationConfig.maxOutputTokens = opts.maxTokens;
      }
      var resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + mdl + ":generateContent?key=" + apiKey, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      if (!resp.ok) { var err = await resp.text(); throw new Error("Gemini " + resp.status + ": " + err.substring(0, 300)); }
      var data = await resp.json();
      var cand = data.candidates && data.candidates[0];
      var text = cand && cand.content && cand.content.parts ? cand.content.parts.map(function(p) { return p.text || ""; }).join("") : "";
      return { text: text, toolCalls: [], tokensIn: data.usageMetadata ? data.usageMetadata.promptTokenCount || 0 : 0, tokensOut: data.usageMetadata ? data.usageMetadata.candidatesTokenCount || 0 : 0, stopReason: cand ? cand.finishReason : "", raw: data };
    }
  };
};
