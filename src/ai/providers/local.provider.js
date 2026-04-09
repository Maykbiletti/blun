// Local llama.cpp Provider for BLUN Multi-KI
module.exports = function createLocalProvider(baseUrl) {
  baseUrl = baseUrl || "http://127.0.0.1:8080";
  return {
    name: "local",
    async query(opts) {
      var body = {
        prompt: (opts.systemPrompt ? opts.systemPrompt + "\n\n" : "") + (opts.prompt || (opts.messages ? opts.messages.map(function(m) { return m.content; }).join("\n") : "")),
        n_predict: opts.maxTokens || 2048,
        temperature: opts.temperature != null ? opts.temperature : 0.7
      };
      var resp = await fetch(baseUrl + "/completion", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      if (!resp.ok) { var err = await resp.text(); throw new Error("Local " + resp.status + ": " + err.substring(0, 300)); }
      var data = await resp.json();
      return { text: data.content || "", toolCalls: [], tokensIn: data.tokens_evaluated || 0, tokensOut: data.tokens_predicted || 0, stopReason: data.stop ? "stop" : "length", raw: data };
    }
  };
};
