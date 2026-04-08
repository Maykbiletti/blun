var fs = require("fs");

// --- BACKEND: Add submit-code endpoint, keep stdin open ---
var cf = "/root/blun/src/routes/connections.js";
var code = fs.readFileSync(cf, "utf8");
fs.writeFileSync(cf + ".bak4", code);

code = code.replace(
  "    // stdin stays open — code will be submitted via /submit-code endpoint",
  "    // stdin stays open for code submission"
);

if (code.indexOf("stdin stays open") === -1) {
  code = code.replace(
    "    proc.stdin.end();",
    "    // stdin stays open for code submission"
  );
}

var submitRoute = "\n// POST :provider/device-auth/submit-code\nrouter.post('/:provider/device-auth/submit-code', async function(req, res) {\n  var sid = req.body.session_id;\n  var authCode = req.body.code;\n  var sess = activeSessions[sid];\n  if (!sess || !sess.proc) return res.status(404).json({ error: 'Session not found' });\n  try {\n    sess.proc.stdin.write(authCode + '\\n');\n    sess.proc.stdin.end();\n    sess.codeSubmitted = true;\n    res.json({ ok: true });\n  } catch(e) {\n    res.status(500).json({ error: 'Failed: ' + e.message });\n  }\n});\n";

code = code.replace(
  "// GET /api/connections/:provider/device-auth/status",
  submitRoute + "// GET /api/connections/:provider/device-auth/status"
);

fs.writeFileSync(cf, code);
console.log("BACKEND: " + (code.indexOf("submit-code") !== -1 ? "OK" : "FAIL"));

// --- FRONTEND: Add code input field to connections.html ---
var hf = "/root/blun/dashboard/connections.html";
var html = fs.readFileSync(hf, "utf8");
fs.writeFileSync(hf + ".bak4", html);

// Hide the URL link
html = html.replace(
  'class="device-code-link" id="deviceCodeLink"',
  'class="device-code-link" id="deviceCodeLink" style="display:none"'
);

// Add code input field after device-code-hint div
var codeInputHtml = '<div id="codeInputArea" style="display:none;margin:10px 0">' +
  '<p style="font-size:12px;color:#888;margin-bottom:8px">Code aus dem Browser hier einf\u00FCgen:</p>' +
  '<input id="authCodeInput" placeholder="Authentication Code..." style="width:100%;padding:10px;font-family:monospace;font-size:12px;background:#0a0a0a;border:1px solid #444;border-radius:8px;color:#fff;margin-bottom:8px">' +
  '<button onclick="submitAuthCode()" style="width:100%;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Best\u00E4tigen</button>' +
  '</div>';

html = html.replace(
  '<div class="device-code-status" id="deviceCodeStatus"></div>',
  codeInputArea + '<div class="device-code-status" id="deviceCodeStatus"></div>'
);

// Variable assignment fix
html = html.split(codeInputArea).join(codeInputHtml);
html = html.replace(
  '<div class="device-code-status" id="deviceCodeStatus"></div>',
  codeInputHtml + '<div class="device-code-status" id="deviceCodeStatus"></div>'
);

// Auto-open URL and show code input when device code area is shown
var oldOpen = 'document.getElementById("deviceCode").textContent = data.user_code;';
var newOpen = 'document.getElementById("deviceCode").textContent = data.user_code;\n' +
  '    window.__authSessionId = data.session_id;\n' +
  '    window.__authProvider = prov.backendKey;\n' +
  '    if (data.auth_url || data.verification_uri) { window.open(data.auth_url || data.verification_uri, "_blank"); }\n' +
  '    setTimeout(function(){ document.getElementById("codeInputArea").style.display="block"; }, 500);';
html = html.replace(oldOpen, newOpen);

// Add submitAuthCode function
var submitFn = '\nasync function submitAuthCode() {\n' +
  '  var c = document.getElementById("authCodeInput").value.trim();\n' +
  '  if (!c) return;\n' +
  '  var s = document.getElementById("deviceCodeStatus");\n' +
  '  s.innerHTML = "<span class=\\"spinner spinner-blue\\"></span> Best\u00E4tige...";\n' +
  '  var r = await fetch("/api/connections/" + (window.__authProvider||"anthropic") + "/device-auth/submit-code", {\n' +
  '    method: "POST",\n' +
  '    headers: { "Content-Type": "application/json" },\n' +
  '    credentials: "include",\n' +
  '    body: JSON.stringify({ session_id: window.__authSessionId, code: c })\n' +
  '  }).catch(function() { return null; });\n' +
  '  if (r && r.ok) {\n' +
  '    document.getElementById("codeInputArea").style.display = "none";\n' +
  '    s.innerHTML = "<span class=\\"spinner spinner-blue\\"></span> Warte auf Best\u00E4tigung...";\n' +
  '  }\n' +
  '}\n';

var lastScript = html.lastIndexOf("</script>");
html = html.slice(0, lastScript) + submitFn + html.slice(lastScript);

fs.writeFileSync(hf, html);
console.log("FRONTEND: " + (html.indexOf("submitAuthCode") !== -1 ? "OK" : "FAIL"));
