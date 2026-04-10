var fs = require("fs");
// BLUN — AI Provider Connections API (OAuth + API Key)
var express = require("express");
var router = express.Router();
var crypto = require("crypto");
var fetch = require("node-fetch");
var { pool } = require("../db");

var ENC_KEY = process.env.BLUN_ENCRYPTION_KEY || "blun-dev-encryption-key-32chars!";
var ALGORITHM = "aes-256-gcm";

function encrypt(text) {
  var iv = crypto.randomBytes(16);
  var cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENC_KEY, "utf8").slice(0, 32), iv);
  var encrypted = cipher.update(text, "utf8", "hex") + cipher.final("hex");
  var tag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + tag + ":" + encrypted;
}

function decrypt(data) {
  var parts = data.split(":");
  var iv = Buffer.from(parts[0], "hex");
  var tag = Buffer.from(parts[1], "hex");
  var encrypted = parts[2];
  var decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENC_KEY, "utf8").slice(0, 32), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}


// === Sensitive config helpers ===
var SENSITIVE_KEYS = ["token", "password", "oauth_token"];
function encryptConfigSecrets(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  var out = {};
  for (var k in cfg) {
    if (SENSITIVE_KEYS.indexOf(k) !== -1 && cfg[k] && String(cfg[k]).indexOf("enc:") !== 0) {
      try { out[k] = "enc:" + encrypt(String(cfg[k])); } catch(e) { out[k] = cfg[k]; }
    } else { out[k] = cfg[k]; }
  }
  return out;
}
function maskConfigSecrets(cfg) {
  if (!cfg) return cfg;
  if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch(e) { return cfg; } }
  var out = {};
  for (var k in cfg) {
    if (SENSITIVE_KEYS.indexOf(k) !== -1 && cfg[k]) out[k] = "***";
    else out[k] = cfg[k];
  }
  return out;
}
function decryptConfigSecrets(cfg) {
  if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch(e) { return cfg; } }
  if (!cfg) return cfg;
  var out = {};
  for (var k in cfg) {
    if (SENSITIVE_KEYS.indexOf(k) !== -1 && typeof cfg[k] === "string" && cfg[k].indexOf("enc:") === 0) {
      try { out[k] = decrypt(cfg[k].slice(4)); } catch(e) { out[k] = ""; }
    } else { out[k] = cfg[k]; }
  }
  return out;
}

var PROVIDERS = {
  anthropic: { name: "Claude / Anthropic", color: "#d97706" },
  openai: { name: "ChatGPT / OpenAI", color: "#10b981" },
  google: { name: "Google AI / Gemini", color: "#8b5cf6" },
  mistral: { name: "Mistral", color: "#f97316" },
  deepseek: { name: "DeepSeek", color: "#3b82f6" },
  local: { name: "Local Models", color: "#6b7280" }
};

// Device auth verification URIs per provider
var DEVICE_AUTH_URIS = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://accounts.google.com/o/oauth2/device/code"
};

// In-memory store for pending device auth sessions (mock)
var deviceAuthSessions = {};

// GET /api/connections — list all connections for user
router.get("/", async function(req, res) {
  try {
    var rows = await pool.query(
      "SELECT id, provider, status, default_model, auth_type, last_used, tokens_used, created_at FROM ai_connections WHERE user_id = $1 ORDER BY created_at",
      [req.user.id]
    );
    var connections = {};
    for (var p in PROVIDERS) {
      connections[p] = { provider: p, name: PROVIDERS[p].name, color: PROVIDERS[p].color, status: "disconnected", tokens_used: 0, last_used: null, default_model: null, auth_type: null };
    }
    rows.rows.forEach(function(r) {
      if (connections[r.provider]) {
        connections[r.provider].status = r.status;
        connections[r.provider].tokens_used = parseInt(r.tokens_used) || 0;
        connections[r.provider].last_used = r.last_used;
        connections[r.provider].default_model = r.default_model;
        connections[r.provider].auth_type = r.auth_type;
        connections[r.provider].id = r.id;
      }
    });
    res.json({ connections: Object.values(connections) });
  } catch (err) {
    console.error("[connections] list error:", err.message);
    res.status(500).json({ error: "Failed to load connections" });
  }
});

// POST /api/connections/:provider — save API key connection
router.post("/:provider", async function(req, res) {
  var provider = req.params.provider;
  if (!PROVIDERS[provider] || provider === "local") return res.status(400).json({ error: "Invalid provider" });
  var apiKey = req.body.api_key;
  var defaultModel = req.body.default_model || null;
  var authType = req.body.auth_type || "api_key";
  if (!apiKey || apiKey.trim().length < 5) return res.status(400).json({ error: "API key is required" });

  try {
    var encrypted = encrypt(apiKey.trim());
    var existing = await pool.query("SELECT id FROM ai_connections WHERE user_id = $1 AND provider = $2", [req.user.id, provider]);
    if (existing.rows.length > 0) {
      await pool.query(
        "UPDATE ai_connections SET api_key_encrypted = $1, default_model = $2, auth_type = $3, status = 'active', last_used = NOW() WHERE user_id = $4 AND provider = $5",
        [encrypted, defaultModel, authType, req.user.id, provider]
      );
    } else {
      await pool.query(
        "INSERT INTO ai_connections (id, user_id, provider, api_key_encrypted, default_model, auth_type, status, last_used) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', NOW())",
        [req.user.id, provider, encrypted, defaultModel, authType]
      );
    }
    res.json({ ok: true, status: "active" });
  } catch (err) {
    console.error("[connections] save error:", err.message);
    res.status(500).json({ error: "Failed to save connection" });
  }
});

// DELETE /api/connections/:provider — disconnect
router.delete("/:provider", async function(req, res) {
  try {
    await pool.query("DELETE FROM ai_connections WHERE user_id = $1 AND provider = $2", [req.user.id, req.params.provider]);
    // Clean up any pending device auth
    var sessionKey = req.user.id + ":" + req.params.provider;
    delete deviceAuthSessions[sessionKey];
    res.json({ ok: true });
  } catch (err) {
    console.error("[connections] delete error:", err.message);
    res.status(500).json({ error: "Failed to disconnect" });
  }
});


// ===== REAL CLI DEVICE AUTH =====
var child_process = require('child_process');
var activeSessions = {};

function startCliAuth(provider) {
  return new Promise(function(resolve, reject) {
    var cmd, args;
    if (provider === 'anthropic') { cmd = 'claude'; args = ['auth', 'login']; }
    else if (provider === 'openai') { cmd = 'codex'; args = ['login', '--device-auth']; }
    else return reject(new Error('Provider not supported'));
    var proc = child_process.spawn(cmd, args, {
      env: Object.assign({}, process.env, { HOME: '/root', TERM: 'dumb' }),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    var found = false, output = '';
    var urlRe = new RegExp('https://\\S+');
    function checkOutput(data) {
      output += data.toString();
      var m = output.match(urlRe);
      if (m && !found) { found = true; resolve({ url: m[0], proc: proc }); }
    }
    proc.stdout.on('data', checkOutput);
    proc.stderr.on('data', checkOutput);
    // stdin stays open for code submission
    setTimeout(function() { if (!found) { proc.kill(); reject(new Error('No auth URL')); } }, 180000);
    proc.on('close', function(c) { if (!found) reject(new Error('CLI exit ' + c)); });
  });
}

function checkCliCredentials(provider) {
  try {
    if (provider === 'anthropic') {
      var c = JSON.parse(fs.readFileSync('/root/.claude/.credentials.json', 'utf8'));
      return (c.claudeAiOauth && c.claudeAiOauth.accessToken) ? 'connected' : 'pending';
    } else if (provider === 'openai') {
      var a = JSON.parse(fs.readFileSync('/root/.codex/auth.json', 'utf8'));
      return (a.tokens && a.tokens.access_token) ? 'connected' : 'pending';
    }
  } catch(e) {}
  return 'pending';
}
// POST /api/connections/:provider/device-auth
router.post('/:provider/device-auth', async function(req, res) {
  var provider = req.params.provider;
  if (provider !== 'anthropic' && provider !== 'openai') {
    return res.status(400).json({ error: 'Nur Anthropic und OpenAI unterstuetzt' });
  }
  try {
    var result = await startCliAuth(provider);
    var sessionId = require('crypto').randomBytes(8).toString('hex');
    activeSessions[sessionId] = { provider: provider, proc: result.proc, url: result.url, started: Date.now() };
    setTimeout(function() {
      if (activeSessions[sessionId]) { try { activeSessions[sessionId].proc.kill(); } catch(e) {} delete activeSessions[sessionId]; }
    }, 300000);
    res.json({ session_id: sessionId, user_code: '> Link oeffnen', verification_uri: result.url, auth_url: result.url });
  } catch(e) {
    res.status(500).json({ error: 'Fehler: ' + e.message, fallback: 'api_key' });
  }
});


// POST :provider/device-auth/submit-code
router.post('/:provider/device-auth/submit-code', async function(req, res) {
  var sid = req.body.session_id;
  var authCode = req.body.code;
  var sess = activeSessions[sid];
  if (!sess || !sess.proc) return res.status(404).json({ error: 'Session not found' });
  try {
    sess.proc.stdin.write(authCode + '\n');
    sess.proc.stdin.end();
    sess.codeSubmitted = true;
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});
// GET /api/connections/:provider/device-auth/status
router.get('/:provider/device-auth/status', async function(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');
  var provider = req.params.provider;
  var sessionId = req.query.session_id;
  var status = checkCliCredentials(provider);
  if (status === 'connected') {
    try {
      var tokenData;
      if (provider === 'anthropic') {
        tokenData = JSON.parse(fs.readFileSync('/root/.claude/.credentials.json', 'utf8')).claudeAiOauth;
      } else {
        tokenData = JSON.parse(fs.readFileSync('/root/.codex/auth.json', 'utf8')).tokens;
      }
      var enc = encrypt(JSON.stringify(Object.assign({}, tokenData, { token_type: 'oauth_cli' })));
      var uid = req.user.id;
      var ex = await pool.query('SELECT id FROM ai_connections WHERE user_id=$1 AND provider=$2', [uid, provider]);
      if (ex.rows.length > 0) {
        await pool.query('UPDATE ai_connections SET api_key_encrypted=$1,status=\'active\',auth_type=\'oauth\' WHERE id=$2', [enc, ex.rows[0].id]);
      } else {
        await pool.query('INSERT INTO ai_connections (user_id,provider,api_key_encrypted,status,auth_type,created_at) VALUES ($1,$2,$3,\'active\',\'oauth\',NOW())', [uid, provider, enc]);
      }
      if (sessionId && activeSessions[sessionId]) { try { activeSessions[sessionId].proc.kill(); } catch(e) {} delete activeSessions[sessionId]; }
    } catch(e) { console.error('[oauth-save]', e.message); }
    return res.json({ status: 'complete' });
  }
  res.json({ status: 'pending' });
});

// POST /api/connections/:provider/test — test API key (supports both stored and provided key)
router.post("/:provider/test", async function(req, res) {
  var provider = req.params.provider;
  var apiKey = null;

  // If key provided in body, use that (for testing before saving)
  if (req.body && req.body.api_key) {
    apiKey = req.body.api_key.trim();
  } else {
    // Otherwise use stored key
    var row = await pool.query("SELECT api_key_encrypted FROM ai_connections WHERE user_id = $1 AND provider = $2", [req.user.id, provider]);
    if (row.rows.length === 0) return res.status(404).json({ error: "No connection found" });
    try { apiKey = decrypt(row.rows[0].api_key_encrypted); } catch(e) { return res.status(500).json({ error: "Failed to decrypt key" }); }

    // If it's an OAuth mock token, just return success
    if (apiKey.startsWith("oauth_mock_")) {
      return res.json({ ok: true, model_count: 0, note: "OAuth mock connection" });
    }
  }

  try {
    var ok = false;
    var model_count = 0;

    if (provider === "anthropic") {
      var r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] })
      });
      ok = r.status === 200;
      model_count = 5;
    } else if (provider === "openai") {
      var r2 = await fetch("https://api.openai.com/v1/models", { headers: { "Authorization": "Bearer " + apiKey } });
      ok = r2.status === 200;
      if (ok) { var d = await r2.json(); model_count = d.data ? d.data.length : 0; }
    } else if (provider === "google") {
      var r3 = await fetch("https://generativelanguage.googleapis.com/v1/models?key=" + apiKey);
      ok = r3.status === 200;
      if (ok) { var d3 = await r3.json(); model_count = d3.models ? d3.models.length : 0; }
    } else if (provider === "mistral") {
      var r4 = await fetch("https://api.mistral.ai/v1/models", { headers: { "Authorization": "Bearer " + apiKey } });
      ok = r4.status === 200;
      if (ok) { var d4 = await r4.json(); model_count = d4.data ? d4.data.length : 0; }
    } else if (provider === "deepseek") {
      var r5 = await fetch("https://api.deepseek.com/models", { headers: { "Authorization": "Bearer " + apiKey } });
      ok = r5.status === 200;
      if (ok) { var d5 = await r5.json(); model_count = d5.data ? d5.data.length : 0; }
    }

    if (ok && !req.body.api_key) {
      await pool.query("UPDATE ai_connections SET last_used = NOW() WHERE user_id = $1 AND provider = $2", [req.user.id, provider]);
    }

    res.json({ ok: ok, model_count: model_count });
  } catch (err) {
    console.error("[connections] test error:", err.message);
    res.json({ ok: false, error: err.message });
  }
});

// GET /api/connections/:provider/usage — usage stats
router.get("/:provider/usage", async function(req, res) {
  try {
    var row = await pool.query(
      "SELECT tokens_used, last_used, created_at FROM ai_connections WHERE user_id = $1 AND provider = $2",
      [req.user.id, req.params.provider]
    );
    if (row.rows.length === 0) return res.json({ tokens_used: 0, cost_estimate: "$0.00" });
    var tokens = parseInt(row.rows[0].tokens_used) || 0;
    var costs = { anthropic: 0.25, openai: 0.15, google: 0.10, mistral: 0.05, deepseek: 0.02 };
    var costPer1M = costs[req.params.provider] || 0.10;
    var cost = ((tokens / 1000000) * costPer1M).toFixed(4);
    res.json({ tokens_used: tokens, cost_estimate: "$" + cost, last_used: row.rows[0].last_used, connected_since: row.rows[0].created_at });
  } catch (err) {
    res.status(500).json({ error: "Failed to load usage" });
  }
});




// Sync connections to Operator memory after changes
async function syncToOperatorMemory(userId) {
  try {
    // Find operator agent for this user (first agent in user's first company)
    var company = await pool.query("SELECT id FROM companies WHERE owner_id = $1 LIMIT 1", [userId]);
    if (!company.rows.length) return;
    var companyId = company.rows[0].id;
    var operator = await pool.query("SELECT id FROM blun_agents WHERE company_id = $1 ORDER BY id LIMIT 1", [companyId]);
    if (!operator.rows.length) return;
    var operatorId = operator.rows[0].id;

    // Get all connections for this user
    var conns = await pool.query("SELECT type, name, config FROM user_connections WHERE user_id = $1 ORDER BY type, name", [userId]);

    var git = [], ssh = [], ts = [];
    conns.rows.forEach(function(c) {
      var cfg = typeof c.config === 'string' ? JSON.parse(c.config) : (c.config || {});
      if (c.type === 'git') git.push(c.name + ' = ' + (cfg.url || '') + ' (Key: ' + (cfg.ssh_key || 'default') + ')');
      if (c.type === 'ssh') ssh.push(c.name + ' = ' + (cfg.user || 'root') + '@' + (cfg.host || ''));
      if (c.type === 'tailscale') ts.push(c.name + ' = ' + (cfg.tailscale_ip || '') + ' (' + (cfg.role || '') + ')');
    });

    var memContent = 'VERBINDUNGEN (auto-sync):\n';
    if (git.length) memContent += 'Git Repos: ' + git.join(', ') + '\n';
    if (ssh.length) memContent += 'SSH: ' + ssh.join(', ') + '\n';
    if (ts.length) memContent += 'Tailscale: ' + ts.join(', ') + '\n';
    memContent += 'Benutze [TOOL:GIT_REMOTE] und [TOOL:GIT_PUSH:msg] fuer Git-Operationen.';

    await pool.query(
      "INSERT INTO agent_memory (agent_id, key, content) VALUES ($1, $2, $3) ON CONFLICT (agent_id, key) DO UPDATE SET content = $3, updated_at = NOW()",
      [operatorId, 'CONNECTIONS_SYNC', memContent]
    );
  } catch(e) { console.error('[connections] sync to operator memory failed:', e.message); }
}

// === User Connections (SSH, Git, Tailscale) ===

// GET /api/connections/infra — list SSH/Git/Tailscale connections for user
router.get("/infra", async function(req, res) {
  try {
    var userId = req.user ? req.user.id : null;
    var rows = await pool.query(
      "SELECT uc.*, c.name as company_name FROM user_connections uc LEFT JOIN companies c ON c.id = uc.company_id WHERE uc.user_id = $1 ORDER BY uc.type, uc.name",
      [userId]
    );
    var masked = rows.rows.map(function(r){
      var cfg = typeof r.config === "string" ? (function(){try{return JSON.parse(r.config);}catch(e){return {};}})() : (r.config || {});
      r.config = maskConfigSecrets(cfg);
      return r;
    });
    res.json(masked);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/connections/infra — add new connection
router.post("/infra", async function(req, res) {
  try {
    var userId = req.user ? req.user.id : null;
    var { type, name, config, company_id } = req.body;
    if (!type || !name) return res.status(400).json({ error: "type and name required" });
    var r = await pool.query(
      "INSERT INTO user_connections (user_id, type, name, config, company_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [userId, type, name, JSON.stringify(encryptConfigSecrets(config || {})), company_id || null]
    );
    await syncToOperatorMemory(userId);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/connections/infra/:id — update connection
router.put("/infra/:id", async function(req, res) {
  try {
    var userId = req.user ? req.user.id : null;
    var { name, config, company_id } = req.body;
    var r = await pool.query(
      "UPDATE user_connections SET name = COALESCE($1, name), config = COALESCE($2::jsonb, config), company_id = COALESCE($3, company_id) WHERE id = $4 AND user_id = $5 RETURNING *",
      [name, config ? JSON.stringify(encryptConfigSecrets(config)) : null, company_id, req.params.id, userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/connections/infra/:id — delete connection
router.delete("/infra/:id", async function(req, res) {
  try {
    var userId = req.user ? req.user.id : null;
    await pool.query("DELETE FROM user_connections WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
    await syncToOperatorMemory(userId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// === GitHub OAuth + Token endpoints ===
var GH_CLIENT_ID = process.env.BLUN_GITHUB_CLIENT_ID || "";
var GH_CLIENT_SECRET = process.env.BLUN_GITHUB_CLIENT_SECRET || "";
var GH_REDIRECT = process.env.BLUN_GITHUB_REDIRECT || "https://blun.ai/api/connections/github/oauth/callback";
var GH_OAUTH_STATES = {};

router.get("/github/status", function(req, res) {
  res.json({ configured: !!(GH_CLIENT_ID && GH_CLIENT_SECRET), redirect_uri: GH_REDIRECT });
});

router.post("/github/test", async function(req, res) {
  var token = req.body && req.body.token;
  if (!token) return res.status(400).json({ ok: false, error: "token required" });
  try {
    var r = await fetch("https://api.github.com/user", { headers: { Authorization: "token " + token, "User-Agent": "blun" } });
    if (!r.ok) return res.json({ ok: false, error: "GitHub: " + r.status });
    var u = await r.json();
    res.json({ ok: true, login: u.login, name: u.name });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

router.get("/github/oauth/start", function(req, res) {
  if (!GH_CLIENT_ID || !GH_CLIENT_SECRET) {
    return res.status(503).send("GitHub OAuth ist nicht konfiguriert. Setze BLUN_GITHUB_CLIENT_ID und BLUN_GITHUB_CLIENT_SECRET.");
  }
  var uid = req.user ? req.user.id : null;
  if (!uid) return res.status(401).send("login required");
  var state = crypto.randomBytes(16).toString("hex");
  GH_OAUTH_STATES[state] = { user_id: uid, ts: Date.now() };
  for (var k in GH_OAUTH_STATES) { if (Date.now() - GH_OAUTH_STATES[k].ts > 600000) delete GH_OAUTH_STATES[k]; }
  var url = "https://github.com/login/oauth/authorize?client_id=" + encodeURIComponent(GH_CLIENT_ID) +
            "&redirect_uri=" + encodeURIComponent(GH_REDIRECT) +
            "&scope=" + encodeURIComponent("repo read:user") +
            "&state=" + state;
  res.redirect(url);
});

router.get("/github/oauth/callback", async function(req, res) {
  try {
    var code = req.query.code;
    var state = req.query.state;
    if (!code || !state || !GH_OAUTH_STATES[state]) return res.status(400).send("invalid state");
    var sess = GH_OAUTH_STATES[state];
    delete GH_OAUTH_STATES[state];
    var tr = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "blun" },
      body: JSON.stringify({ client_id: GH_CLIENT_ID, client_secret: GH_CLIENT_SECRET, code: code, redirect_uri: GH_REDIRECT })
    });
    var td = await tr.json();
    if (!td.access_token) return res.status(400).send("GitHub error: " + JSON.stringify(td));
    var ur = await fetch("https://api.github.com/user", { headers: { Authorization: "token " + td.access_token, "User-Agent": "blun" } });
    var u = await ur.json();
    var cfg = encryptConfigSecrets({ oauth: true, login: u.login, scope: td.scope || "", token: td.access_token });
    await pool.query(
      "INSERT INTO user_connections (user_id, type, name, config) VALUES ($1, 'git', $2, $3)",
      [sess.user_id, "GitHub: " + (u.login || "oauth"), JSON.stringify(cfg)]
    );
    res.send("<html><body style='font-family:sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px;text-align:center'><h2>GitHub verbunden</h2><p>Du kannst dieses Fenster schliessen.</p><script>setTimeout(function(){window.close();},1500);if(window.opener){window.opener.postMessage({type:'github-oauth-done'},'*');}</script></body></html>");
  } catch(e) {
    res.status(500).send("OAuth error: " + e.message);
  }
});



// === Plan Usage Summary ===
router.get("/usage/summary", async function(req, res) {
  try {
    var uid = req.user && req.user.id;
    if (!uid) return res.status(401).json({ error: "auth required" });
    var q = "WITH cos AS (SELECT id FROM companies WHERE owner_id = $1) " +
      "SELECT " +
      " CASE " +
      "  WHEN model ILIKE 'claude%' THEN 'anthropic' " +
      "  WHEN model ILIKE 'gpt%' OR model ILIKE 'o1%' OR model ILIKE 'o3%' OR model ILIKE 'o4%' THEN 'openai' " +
      "  WHEN model ILIKE 'gemini%' THEN 'google' " +
      "  WHEN model ILIKE 'mistral%' THEN 'mistral' " +
      "  WHEN model ILIKE 'deepseek%' THEN 'deepseek' " +
      "  ELSE 'other' " +
      " END AS provider, " +
      " SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN COALESCE(tokens_in,0)+COALESCE(tokens_out,0) ELSE 0 END)::bigint AS today_tokens, " +
      " SUM(CASE WHEN created_at >= date_trunc('week', now()) THEN COALESCE(tokens_in,0)+COALESCE(tokens_out,0) ELSE 0 END)::bigint AS week_tokens, " +
      " SUM(COALESCE(tokens_in,0)+COALESCE(tokens_out,0))::bigint AS total_tokens, " +
      " COALESCE(SUM(CASE WHEN created_at >= date_trunc('week', now()) THEN cost_usd ELSE 0 END),0)::float AS week_cost " +
      "FROM cost_events WHERE company_id IN (SELECT id FROM cos) GROUP BY 1";
    var rows = { rows: [] };
    try { rows = await pool.query(q, [uid]); } catch(e) { rows = { rows: [] }; }
    // Provider-Budgets (soft limits, Woche) - konfigurierbar spaeter
    var BUDGETS = { anthropic: 10000000, openai: 10000000, google: 5000000, mistral: 2000000, deepseek: 2000000 };
    var out = {};
    ["anthropic","openai","google","mistral","deepseek"].forEach(function(p){
      out[p] = { today_tokens: 0, week_tokens: 0, total_tokens: 0, week_cost: 0, week_budget: BUDGETS[p] };
    });
    rows.rows.forEach(function(r){
      if (!out[r.provider]) return;
      out[r.provider].today_tokens = Number(r.today_tokens)||0;
      out[r.provider].week_tokens = Number(r.week_tokens)||0;
      out[r.provider].total_tokens = Number(r.total_tokens)||0;
      out[r.provider].week_cost = Number(r.week_cost)||0;
    });
    // Week reset: naechster Montag 00:00 UTC
    var now = new Date();
    var day = now.getUTCDay() || 7;
    var reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day), 0, 0, 0));
    res.json({ providers: out, week_reset: reset.toISOString() });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
