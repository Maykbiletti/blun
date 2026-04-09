// BLUN Multi-KI Init — loads API keys from DB, registers providers
var crypto = require("crypto");
var aiProvider = require("./ai-provider");
var createAnthropic = require("./providers/anthropic.provider");
var createOpenAI = require("./providers/openai.provider");
var createGemini = require("./providers/gemini.provider");
var createLocal = require("./providers/local.provider");

var ENC_KEY = process.env.BLUN_ENCRYPTION_KEY || "blun-dev-encryption-key-32chars!";
var _initialized = false;

function decryptKey(data) {
  var parts = data.split(":");
  var iv = Buffer.from(parts[0], "hex");
  var tag = Buffer.from(parts[1], "hex");
  var encrypted = parts[2];
  var decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "utf8").slice(0, 32), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

async function initMultiKI(dbQuery) {
  if (_initialized) return;
  try {
    var connections = await dbQuery("SELECT provider, api_key_encrypted FROM ai_connections WHERE status = 'active'" );
    connections.forEach(function(conn) {
      var key;
      try {
        key = decryptKey(conn.api_key_encrypted);
        try { var j = JSON.parse(key); if (j.accessToken || j.access_token) key = j.accessToken || j.access_token; } catch(e) {}
      } catch(e) { console.error("[multi-ki] decrypt failed for " + conn.provider + ": " + e.message); return; }
      if (conn.provider === "anthropic" && key) aiProvider.registerProvider("anthropic", createAnthropic(key));
      if (conn.provider === "openai" && key) aiProvider.registerProvider("openai", createOpenAI(key));
      if (conn.provider === "google" && key) aiProvider.registerProvider("gemini", createGemini(key));
    });
    aiProvider.registerProvider("local", createLocal("http://127.0.0.1:8080"));
    _initialized = true;
    console.log("[multi-ki] Initialized. Providers:", Object.keys(aiProvider.PROVIDERS).join(", "));
  } catch(e) {
    console.error("[multi-ki] Init failed:", e.message);
  }
}

module.exports = { initMultiKI };
