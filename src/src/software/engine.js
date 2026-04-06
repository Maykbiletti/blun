// BLUN - AI Organisator | MIT License
/**
 * Software Generation Engine
 * Handles project templates, AI code generation, build pipeline, artifact storage
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BUILDS_DIR = "/var/www/blun-builds";
try { fs.mkdirSync(BUILDS_DIR, { recursive: true }); } catch(e) {}

const TEMPLATES = [
  {
    slug: "cli-tool",
    name: "CLI Tool",
    type: "cli",
    description: "Command-line utility with argument parsing and config support",
    language: "node",
    platforms: ["windows", "macos", "linux"]
  },
  {
    slug: "desktop-app",
    name: "Desktop App (Electron)",
    type: "desktop",
    description: "Cross-platform desktop application with Electron",
    language: "node",
    platforms: ["windows", "macos", "linux"]
  },
  {
    slug: "mobile-app",
    name: "Mobile App (React Native)",
    type: "mobile",
    description: "Cross-platform mobile app with React Native",
    language: "react-native",
    platforms: ["android", "ios"]
  },
  {
    slug: "web-api",
    name: "Web API",
    type: "cli",
    description: "REST API service with Express.js",
    language: "node",
    platforms: ["linux"]
  },
  {
    slug: "chrome-extension",
    name: "Chrome Extension",
    type: "desktop",
    description: "Browser extension with popup, background script, and content script",
    language: "web",
    platforms: ["windows", "macos", "linux"]
  }
];

function getTemplates() { return TEMPLATES; }
function getTemplateBySlug(slug) { return TEMPLATES.find(function(t) { return t.slug === slug; }); }

function slugify(name) {
  return (name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Generate boilerplate code based on template + description
 */
function generateCode(template, name, description) {
  var tpl = typeof template === "string" ? getTemplateBySlug(template) : template;
  if (!tpl) return null;

  var files = {};
  var sName = slugify(name);

  if (tpl.slug === "cli-tool") {
    files["package.json"] = JSON.stringify({
      name: sName, version: "1.0.0", description: description,
      main: "index.js", bin: { [sName]: "./index.js" },
      dependencies: { commander: "^11.0.0" },
      scripts: { start: "node index.js", build: "npx pkg . --targets node18-win-x64,node18-macos-x64,node18-linux-x64 --output dist/" + sName }
    }, null, 2);
    files["index.js"] = [
      "#!/usr/bin/env node",
      '"use strict";',
      'const { program } = require("commander");',
      "",
      "program",
      '  .name("' + sName + '")',
      '  .description("' + (description || name) + '")',
      '  .version("1.0.0");',
      "",
      "program",
      '  .command("run")',
      '  .description("Run the main command")',
      "  .action(function() {",
      '    console.log("' + name + ' is running...");',
      "    // TODO: Implement your logic here",
      "  });",
      "",
      "program.parse();",
      ""
    ].join("\n");
  } else if (tpl.slug === "desktop-app") {
    files["package.json"] = JSON.stringify({
      name: sName, version: "1.0.0", description: description,
      main: "main.js",
      scripts: { start: "electron .", build: "electron-builder" },
      dependencies: { electron: "^28.0.0" },
      devDependencies: { "electron-builder": "^24.0.0" },
      build: { appId: "com.blun." + sName, productName: name,
        win: { target: "nsis" }, mac: { target: "dmg" }, linux: { target: "deb" } }
    }, null, 2);
    files["main.js"] = [
      'const { app, BrowserWindow } = require("electron");',
      'const path = require("path");',
      "",
      "function createWindow() {",
      "  var win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { nodeIntegration: true } });",
      '  win.loadFile("index.html");',
      "}",
      "",
      "app.whenReady().then(createWindow);",
      'app.on("window-all-closed", function() { if (process.platform !== "darwin") app.quit(); });',
      ""
    ].join("\n");
    files["index.html"] = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>' + name + '</title>\n<style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh}\nh1{font-size:2rem;font-weight:600}p{color:#737373}</style></head>\n<body><div style="text-align:center"><h1>' + name + '</h1><p>' + (description || "Desktop application") + '</p></div></body></html>\n';
  } else if (tpl.slug === "mobile-app") {
    files["package.json"] = JSON.stringify({
      name: sName, version: "1.0.0", description: description,
      main: "index.js",
      scripts: { start: "react-native start", android: "react-native run-android", ios: "react-native run-ios" },
      dependencies: { react: "^18.2.0", "react-native": "^0.73.0" }
    }, null, 2);
    files["index.js"] = 'import { AppRegistry } from "react-native";\nimport App from "./App";\nAppRegistry.registerComponent("' + sName + '", function() { return App; });\n';
    files["App.js"] = 'import React from "react";\nimport { View, Text, StyleSheet } from "react-native";\n\nexport default function App() {\n  return (\n    <View style={styles.container}>\n      <Text style={styles.title}>' + name + '</Text>\n      <Text style={styles.desc}>' + (description || "Mobile application") + '</Text>\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },\n  title: { fontSize: 28, fontWeight: "600", color: "#e5e5e5" },\n  desc: { fontSize: 16, color: "#737373", marginTop: 8 }\n});\n';
  } else if (tpl.slug === "web-api") {
    files["package.json"] = JSON.stringify({
      name: sName, version: "1.0.0", description: description,
      main: "server.js",
      scripts: { start: "node server.js", dev: "node --watch server.js" },
      dependencies: { express: "^4.18.0", cors: "^2.8.5" }
    }, null, 2);
    files["server.js"] = 'const express = require("express");\nconst cors = require("cors");\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get("/", function(req, res) { res.json({ name: "' + name + '", status: "running" }); });\napp.get("/api/health", function(req, res) { res.json({ ok: true }); });\n\n// TODO: Add your routes here\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, function() { console.log("' + name + ' running on port " + PORT); });\n';
  } else if (tpl.slug === "chrome-extension") {
    files["manifest.json"] = JSON.stringify({
      manifest_version: 3, name: name, version: "1.0.0", description: description,
      action: { default_popup: "popup.html", default_icon: "icon.png" },
      permissions: ["storage", "activeTab"],
      background: { service_worker: "background.js" }
    }, null, 2);
    files["popup.html"] = '<!DOCTYPE html>\n<html><head><meta charset="utf-8">\n<style>body{width:320px;padding:16px;font-family:Inter,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0}\nh1{font-size:1.1rem;font-weight:600;margin:0 0 8px}p{color:#737373;font-size:0.85rem;margin:0}</style></head>\n<body><h1>' + name + '</h1><p>' + (description || "Chrome extension") + '</p></body></html>\n';
    files["background.js"] = '// Background service worker\nchrome.runtime.onInstalled.addListener(function() {\n  console.log("' + name + ' installed");\n});\n';
  }

  files["README.md"] = "# " + name + "\n\n" + (description || "") + "\n\nGenerated by BLUN Software Builder.\n";

  return files;
}

/**
 * Write generated files to disk
 */
function writeProject(projectId, files) {
  var dir = path.join(BUILDS_DIR, String(projectId), "src");
  fs.mkdirSync(dir, { recursive: true });
  for (var fname in files) {
    var fp = path.join(dir, fname);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, files[fname], "utf8");
  }
  return dir;
}

/**
 * Build project (placeholder - creates archive as artifact)
 */
async function buildProject(projectId, platform) {
  var srcDir = path.join(BUILDS_DIR, String(projectId), "src");
  var distDir = path.join(BUILDS_DIR, String(projectId), "dist");
  fs.mkdirSync(distDir, { recursive: true });

  var ext = { windows: ".exe", macos: ".app.zip", linux: ".deb", android: ".apk", ios: ".ipa" };
  var artifactName = "build-" + platform + (ext[platform] || ".zip");
  var artifactPath = path.join(distDir, artifactName);

  try {
    execSync("cd " + srcDir + " && tar czf " + artifactPath + " .");
  } catch(e) {
    return { success: false, error: e.message };
  }

  var stats = fs.statSync(artifactPath);
  return {
    success: true,
    artifact: artifactPath,
    filename: artifactName,
    size: stats.size,
    platform: platform
  };
}

function getArtifactPath(projectId, platform) {
  var ext = { windows: ".exe", macos: ".app.zip", linux: ".deb", android: ".apk", ios: ".ipa" };
  var artifactName = "build-" + platform + (ext[platform] || ".zip");
  var p = path.join(BUILDS_DIR, String(projectId), "dist", artifactName);
  if (fs.existsSync(p)) return p;
  return null;
}

module.exports = { getTemplates, getTemplateBySlug, generateCode, writeProject, buildProject, getArtifactPath, slugify, BUILDS_DIR };
