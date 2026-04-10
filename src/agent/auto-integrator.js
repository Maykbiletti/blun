// BLUN Auto-Integrator — automatically wires new agent files into the running system
// Detects file type, finds insertion point, adds reference (script tag, css link, route require)
// Idempotent: skips if already integrated

const fs = require("fs");
const path = require("path");

// Main entry: integrate a single file
// Returns { type, action, integrated } or { type, skipped, reason }
function integrateFile(filePath, baseDir) {
  baseDir = baseDir || "/root/blun";
  const rel = filePath.replace(/^\/+/, "");
  const ext = path.extname(rel);
  const basename = path.basename(rel, ext);

  // Component JS → script tag in index.html
  if (rel.startsWith("dashboard/components/") && ext === ".js") {
    return integrateComponent(rel, baseDir);
  }
  // CSS → link tag in index.html
  if (rel.startsWith("dashboard/css/") && ext === ".css") {
    return integrateCss(rel, baseDir);
  }
  // Route → require + app.use in server.js
  if (rel.startsWith("src/routes/") && ext === ".js" && !rel.includes(".test.") && !rel.includes(".bak")) {
    return integrateRoute(rel, baseDir);
  }
  // Middleware → require + app.use in server.js
  if (rel.startsWith("src/middleware/") && ext === ".js" && !rel.includes(".test.")) {
    return integrateMiddleware(rel, baseDir);
  }
  return { type: "unknown", skipped: true, reason: "no integration rule" };
}

// Add <script src="components/X.js"></script> to index.html
function integrateComponent(rel, baseDir) {
  const indexPath = path.join(baseDir, "dashboard/index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  const componentName = path.basename(rel);
  const tag = `<script src="components/${componentName}"></script>`;

  if (html.includes(`components/${componentName}`)) {
    return { type: "component", skipped: true, reason: "already integrated" };
  }

  // Find last existing component script tag and insert after it
  const re = /(\s*)<script src="components\/[^"]+\.js"><\/script>\n/g;
  let lastMatch = null;
  let m;
  while ((m = re.exec(html)) !== null) lastMatch = m;

  if (!lastMatch) {
    return { type: "component", skipped: true, reason: "no anchor found" };
  }

  const insertPos = lastMatch.index + lastMatch[0].length;
  const indent = lastMatch[1].replace(/\n/g, "");
  const newHtml = html.slice(0, insertPos) + indent + tag + "\n" + html.slice(insertPos);

  fs.writeFileSync(indexPath, newHtml);
  return { type: "component", action: "added script tag", file: componentName };
}

// Add <link rel="stylesheet" href="css/X.css"> to index.html
function integrateCss(rel, baseDir) {
  const indexPath = path.join(baseDir, "dashboard/index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  const cssName = path.basename(rel);
  const tag = `<link rel="stylesheet" href="css/${cssName}">`;

  if (html.includes(`css/${cssName}`)) {
    return { type: "css", skipped: true, reason: "already integrated" };
  }

  // Find existing CSS link or fall back to head
  const re = /(\s*)<link rel="stylesheet" href="css\/[^"]+\.css">\n/g;
  let lastMatch = null;
  let m;
  while ((m = re.exec(html)) !== null) lastMatch = m;

  let newHtml;
  if (lastMatch) {
    const insertPos = lastMatch.index + lastMatch[0].length;
    const indent = lastMatch[1].replace(/\n/g, "");
    newHtml = html.slice(0, insertPos) + indent + tag + "\n" + html.slice(insertPos);
  } else {
    // Insert before </head>
    const headEnd = html.indexOf("</head>");
    if (headEnd === -1) return { type: "css", skipped: true, reason: "no head tag" };
    newHtml = html.slice(0, headEnd) + tag + "\n" + html.slice(headEnd);
  }

  fs.writeFileSync(indexPath, newHtml);
  return { type: "css", action: "added link tag", file: cssName };
}

// Add const X = require("./src/routes/X") + app.use("/api/X", X) to server.js
function integrateRoute(rel, baseDir) {
  const serverPath = path.join(baseDir, "server.js");
  const code = fs.readFileSync(serverPath, "utf8");
  const routeName = path.basename(rel, ".js");
  const varName = camelCase(routeName) + "Routes";
  const requireLine = `const ${varName} = require("./src/routes/${routeName}");`;
  const usePath = "/api/" + routeName;
  const useLine = `app.use("${usePath}", ${varName});`;

  if (code.includes(`require("./src/routes/${routeName}")`)) {
    return { type: "route", skipped: true, reason: "already required" };
  }

  // Insert require after last existing route require
  const reqRe = /const \w+Routes? = require\("\.\/src\/routes\/[^"]+"\);\n/g;
  let lastReq = null;
  let m;
  while ((m = reqRe.exec(code)) !== null) lastReq = m;
  if (!lastReq) return { type: "route", skipped: true, reason: "no require anchor" };

  // Insert app.use after last existing app.use for routes
  const useRe = /app\.use\("\/[^"]+", \w*\s*,?\s*\w*Routes\);\n/g;
  let lastUse = null;
  while ((m = useRe.exec(code)) !== null) lastUse = m;
  if (!lastUse) return { type: "route", skipped: true, reason: "no app.use anchor" };

  // Insert from back to front so positions stay valid
  let newCode = code.slice(0, lastUse.index + lastUse[0].length) + useLine + "\n" + code.slice(lastUse.index + lastUse[0].length);
  newCode = newCode.slice(0, lastReq.index + lastReq[0].length) + requireLine + "\n" + newCode.slice(lastReq.index + lastReq[0].length);

  fs.writeFileSync(serverPath, newCode);
  return { type: "route", action: "added require + app.use", file: routeName, mountPath: usePath };
}

// Add const X = require("./src/middleware/X") + app.use(X) to server.js
function integrateMiddleware(rel, baseDir) {
  const serverPath = path.join(baseDir, "server.js");
  const code = fs.readFileSync(serverPath, "utf8");
  const mwName = path.basename(rel, ".js");
  const varName = camelCase(mwName);
  const requireLine = `const ${varName} = require("./src/middleware/${mwName}");`;

  if (code.includes(`require("./src/middleware/${mwName}")`)) {
    return { type: "middleware", skipped: true, reason: "already required" };
  }

  const reqRe = /const \w+ = require\("\.\/src\/middleware\/[^"]+"\);\n/g;
  let lastReq = null;
  let m;
  while ((m = reqRe.exec(code)) !== null) lastReq = m;
  if (!lastReq) return { type: "middleware", skipped: true, reason: "no require anchor" };

  const newCode = code.slice(0, lastReq.index + lastReq[0].length) + requireLine + "\n" + code.slice(lastReq.index + lastReq[0].length);
  fs.writeFileSync(serverPath, newCode);
  return { type: "middleware", action: "added require (manual app.use needed)", file: mwName };
}

function camelCase(s) {
  return s.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

module.exports = { integrateFile, integrateComponent, integrateCss, integrateRoute, integrateMiddleware };
