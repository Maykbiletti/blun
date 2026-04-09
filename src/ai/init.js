// BLUN Multi-KI Init — loads API keys from DB, registers providers
var aiProvider = require("./ai-provider");
var createAnthropic = require("./providers/anthropic.provider");
var createOpenAI = require("./providers/openai.provider");
var createGemini = require("./providers/gemini.provider");
var createLocal = require("./providers/local.provider");

var _initialized = false;

async function initMultiKI(dbQuery, decryptKey) {
  if (_initialized) return;
  try {
    var connections = await dbQuery("SELECT provider, api_key_encrypted FROM ai_connections WHERE status = 'active'" );
    connections.forEach(function(conn) {
      var key;
      try {
        key = decryptKey(conn.api_key_encrypted);
        try { var j = JSON.parse(key); if (j.accessToken || j.access_token) key = j.accessToken || j.access_token; } catch(e) {}
      } catch(e) { console.error("[multi-ki] decrypt failed for " + conn.provider); return; }

      if (conn.provider === "anthropic" && key) aiProvider.registerProvider("anthropic", createAnthropic(key));
      if (conn.provider === "openai" && key) aiProvider.registerProvider("openai", createOpenAI(key));
      if (conn.provider === "google" && key) aiProvider.registerProvider("gemini", createGemini(key));
    });

    // Local always available if llama-server running
    aiProvider.registerProvider("local", createLocal("http://127.0.0.1:8080"));
    _initialized = true;
    console.log("[multi-ki] Initialized. Providers:", Object.keys(aiProvider.PROVIDERS).join(", "));
  } catch(e) {
    console.error("[multi-ki] Init failed:", e.message);
  }
}

module.exports = { initMultiKI };
