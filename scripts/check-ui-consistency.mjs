#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const HTML_EXTENSIONS = new Set([".html"]);
const JS_EXTENSIONS = new Set([".js", ".mjs"]);
const ignoredDirs = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

const violations = [];

function walk(currentDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(fullPath);
      continue;
    }

    const ext = path.extname(entry.name);

    if (HTML_EXTENSIONS.has(ext)) {
      checkHtmlFile(fullPath);
    }

    if (JS_EXTENSIONS.has(ext)) {
      checkJsFile(fullPath);
    }
  }
}

function checkHtmlFile(fullPath) {
  const content = fs.readFileSync(fullPath, "utf8");
  const normalizedPath = fullPath.replace(/\\/g, "/");

  const isDashboardShell = normalizedPath.endsWith("/dashboard/index.html");
  const isPageFragment = normalizedPath.includes("/dashboard/pages/");

  if (isDashboardShell) {
    if (!content.includes("navigation.config.js")) {
      violations.push({
        file: fullPath,
        reason: "dashboard/index.html does not load navigation.config.js"
      });
    }

    if (!content.includes("design-tokens.js")) {
      violations.push({
        file: fullPath,
        reason: "dashboard/index.html does not load design-tokens.js"
      });
    }

    if (!content.includes("sidebar-renderer.js")) {
      violations.push({
        file: fullPath,
        reason: "dashboard/index.html does not load sidebar-renderer.js"
      });
    }

    if (!content.includes("data-blun-sidebar") && !content.includes("renderBlunSidebar(")) {
      violations.push({
        file: fullPath,
        reason: "dashboard/index.html does not expose a BLUN sidebar mount"
      });
    }
  }

  if (isPageFragment) {
    if (/<html[\s>]/i.test(content) || /<body[\s>]/i.test(content)) {
      violations.push({
        file: fullPath,
        reason: "dashboard/pages fragment contains full html/body structure instead of shell content fragment"
      });
    }
  }

  const hardcodedMenuTerms = ["Dashboard", "Projekte", "Agents", "Einstellungen", "Admin"];
  const found = hardcodedMenuTerms.filter((term) => content.includes(`>${term}<`) || content.includes(`"${term}"`) || content.includes(`'${term}'`));

  if (found.length >= 4 && !isDashboardShell) {
    violations.push({
      file: fullPath,
      reason: `Possible hardcoded menu labels found outside central shell: ${found.join(", ")}`
    });
  }

  const inlineColorMatches = content.match(/style\s*=\s*["'][^"']*(color:|background:|border-color:|font-family:)/gi);
  if (inlineColorMatches && inlineColorMatches.length > 5) {
    violations.push({
      file: fullPath,
      reason: "Heavy inline design styling detected. Move repeated UI styling to shared tokens/classes."
    });
  }
}

function checkJsFile(fullPath) {
  const content = fs.readFileSync(fullPath, "utf8");
  const normalizedPath = fullPath.replace(/\\/g, "/");

  if (normalizedPath.endsWith("/dashboard/assets/js/sidebar-renderer.js")) {
    if (!content.includes("window.BLUN_NAVIGATION")) {
      violations.push({
        file: fullPath,
        reason: "sidebar-renderer.js does not use central BLUN_NAVIGATION"
      });
    }
  }
}

walk(ROOT_DIR);

if (violations.length) {
  console.error("\nBLUN UI consistency check failed.\n");
  for (const violation of violations) {
    console.error(`- ${violation.file}`);
    console.error(`  ${violation.reason}`);
  }
  console.error("\nFix the files above before merging.\n");
  process.exit(1);
}

console.log("BLUN UI consistency check passed. ✅");
