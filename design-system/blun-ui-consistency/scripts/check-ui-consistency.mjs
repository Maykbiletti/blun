#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const PAGE_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".js"]);
const PAGE_HINTS = ["page.", "Page.", "layout.", "Layout."];
const REQUIRED_LAYOUT_IMPORT = "AppShell";
const FORBIDDEN_INLINE_NAV_HINTS = [
  "Dashboard",
  "Projekte",
  "Agents",
  "Einstellungen",
  "Admin",
];

const ignoredDirs = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".git",
]);

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
    if (!PAGE_EXTENSIONS.has(ext)) continue;

    const lowerName = entry.name.toLowerCase();
    const looksLikePage = PAGE_HINTS.some((hint) => lowerName.includes(hint.toLowerCase()));
    if (!looksLikePage) continue;

    const content = fs.readFileSync(fullPath, "utf8");
    const hasAppShell = content.includes(REQUIRED_LAYOUT_IMPORT);
    const hasInlineNav = FORBIDDEN_INLINE_NAV_HINTS.filter((term) => content.includes(term));

    if (!hasAppShell) {
      violations.push({
        file: fullPath,
        reason: "Page/Layout file does not use AppShell.",
      });
    }

    if (hasInlineNav.length >= 3 && !content.includes("BLUN_NAVIGATION")) {
      violations.push({
        file: fullPath,
        reason: `Possible hardcoded navigation detected: ${hasInlineNav.join(", ")}`,
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
