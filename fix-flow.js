// Fix the OAuth flow:
// 1. Backend: keep stdin open, add submit-code endpoint
// 2. Frontend: hide URL, add code input field

var fs = require("fs");

// --- BACKEND FIX ---
var cf = "/root/blun/src/routes/connections.js";
var code = fs.readFileSync(cf, "utf8");
fs.writeFileSync(cf + ".bak4", code);

// Fix: don't close stdin immediately, keep process alive for code submission
code = code.replace(
  "    proc.stdin.end();",
  "    // stdin stays open — code will be submitted via /submit-code endpoint"
);

// Add submit-code endpoint before the poll endpoint
var submitEndpoint = [
  "",
  "// POST /api/connections/:provider/device-auth/submit-code",
  "router.post('/:provider/device-auth/submit-code', async function(req, res) {",
  "  var sessionId = req.body.session_id;",
  "  var authCode = req.body.code;",
  "  var session = activeSessions[sessionId];",
  "  if (!session || !session.proc) return res.status(404).json({ error: 'Session not found' });",
  "  try {",
  "    session.proc.stdin.write(authCode + '\\n');",
  "    session.proc.stdin.end();",
  "    session.codeSubmitted = true;",
  "    res.json({ ok: true, message: 'Code submitted, waiting for confirmation' });",
  "  } catch(e) {",
  "    res.status(500).json({ error: 'Failed to submit code: ' + e.message });",
  "  }",
  "});",
  ""
].join("\n");

// Insert before the poll endpoint
code = code.replace(
  "// GET /api/connections/:provider/device-auth/status",
  submitEndpoint + "// GET /api/connections/:provider/device-auth/status"
);

fs.writeFileSync(cf, code);
console.log("BACKEND_FIX: " + (code.indexOf("submit-code") !== -1 ? "OK" : "FAIL"));

// --- FRONTEND FIX ---
var hf = "/root/blun/dashboard/connections.html";
var html = fs.readFileSync(hf, "utf8");
fs.writeFileSync(hf + ".bak4", html);

// 1. Hide the URL link display (user said they don't want to see it)
html = html.replace(
  '<a href="#" target="_blank" class="device-code-link" id="deviceCodeLink"></a>',
  '<a href="#" target="_blank" class="device-code-link" id="deviceCodeLink" style="display:none"></a>'
);

// 2. Update the hint text
html = html.replace(
  '"Kopiere den Code, oeffne den Link und fuege ihn dort ein."',
  '"Klicke auf \\'Link öffnen\\', kopiere den Code aus dem Browser und füge ihn unten ein."'
);

// 3. Add code input field after the hint (before device-code-status)
html = html.replace(
  '<div class="device-code-status" id="deviceCodeStatus"></div>',
  '<div id="codeInputArea" style="display:none;margin:12px 0"><input id="authCodeInput" placeholder="Code aus Browser hier einfügen..." style="width:100%;padding:10px;font-family:monospace;font-size:13px;background:#0a0a0a;border:1px solid #444;border-radius:8px;color:#fff;margin-bottom:8px"><button onclick="submitAuthCode()" style="width:100%;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Bestätigen</button></div><div class="device-code-status" id="deviceCodeStatus"></div>'
);

// 4. Show the code input when link is clicked
html = html.replace(
  'document.getElementById("deviceCodeLink").href = data.verification_uri;',
  'document.getElementById("deviceCodeLink").href = data.verification_uri; document.getElementById("oauthStartBtn").onclick = function(){ window.open(data.verification_uri, "_blank"); document.getElementById("codeInputArea").style.display="block"; };'
);

// Actually, simpler: show codeInputArea when the button is clicked (open link)
// The "> Link öffnen" button click opens URL and shows input
html = html.replace(
  'document.getElementById("deviceCodeArea").style.display = "block";',
  'document.getElementById("deviceCodeArea").style.display = "block"; if(window.__authUrl){ document.getElementById("oauthStartBtn").onclick = function(){ window.open(window.__authUrl, "_blank"); setTimeout(function(){document.getElementById("codeInputArea").style.display="block";}, 1000); }; }'
);

// Store the URL for button use
html = html.replace(
  'document.getElementById("deviceCode").textContent = data.user_code;',
  'document.getElementById("deviceCode").textContent = data.user_code; window.__authSessionId = data.session_id; window.__authProvider = prov.backendKey; window.open(data.verification_uri || data.auth_url, "_blank"); setTimeout(function(){document.getElementById("codeInputArea").style.display="block";}, 1000);'
);

// Add submitAuthCode function before closing script tag
var submitFn = [
  "",
  "async function submitAuthCode() {",
  "  var authCode = document.getElementById('authCodeInput').value.trim();",
  "  if (!authCode) return;",
  "  var statusEl = document.getElementById('deviceCodeStatus');",
  "  statusEl.innerHTML = '<span class=\"spinner spinner-blue\"></span> Bestätige...';",
  "  try {",
  "    var r = await fetch('/api/connections/' + window.__authProvider + '/device-auth/submit-code', {",
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  "      credentials: 'include',",
  "      body: JSON.stringify({ session_id: window.__authSessionId, code: authCode })",
  "    });",
  "    if (r.ok) {",
  "      statusEl.innerHTML = '<span class=\"spinner spinner-blue\"></span> Warte auf Bestätigung...';",
  "      document.getElementById('codeInputArea').style.display = 'none';",
  "    }",
  "  } catch(e) {",
  "    statusEl.textContent = 'Fehler beim Senden';",
  "  }",
  "}",
  ""
].join("\n");

var scriptEnd = html.lastIndexOf("</script>");
html = html.slice(0, scriptEnd) + submitFn + html.slice(scriptEnd);

fs.writeFileSync(hf, html);
console.log("FRONTEND_FIX: " + (html.indexOf("submitAuthCode") !== -1 ? "OK" : "FAIL"));
