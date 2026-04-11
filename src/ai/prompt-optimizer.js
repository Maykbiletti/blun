"use strict";

/**
 * Prompt Optimizer
 * Builds compact, structured prompts while keeping critical instructions intact.
 */

var DEFAULT_MAX_CHARS = 12000;
var DEFAULT_SOFT_LIMIT = 9000;

function normalizeText(input) {
  return String(input || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLines(text) {
  return normalizeText(text)
    .split("\n")
    .map(function(line) { return line.trim(); })
    .filter(Boolean);
}

function dedupeLines(lines) {
  var seen = new Set();
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var key = lines[i].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lines[i]);
  }
  return out;
}

function summarizeBullets(title, items) {
  var cleanItems = dedupeLines(items || []);
  if (!cleanItems.length) return "";
  return title + "\n" + cleanItems.map(function(item) { return "- " + item; }).join("\n");
}

function estimateTokens(text) {
  // Practical heuristic for mixed English/German prompts.
  return Math.ceil(String(text || "").length / 4);
}

function stripNoise(text) {
  var lines = splitLines(text);
  var noisePatterns = [
    /^thanks[.!]?$/i,
    /^thank you[.!]?$/i,
    /^best regards[.!]?$/i,
    /^kind regards[.!]?$/i,
    /^please let me know[\s\S]*$/i,
    /^fyi[.!]?$/i
  ];

  return lines.filter(function(line) {
    for (var i = 0; i < noisePatterns.length; i++) {
      if (noisePatterns[i].test(line)) return false;
    }
    return true;
  }).join("\n");
}

function truncateSmart(text, maxChars) {
  var clean = normalizeText(text);
  if (clean.length <= maxChars) return clean;

  var cut = clean.slice(0, maxChars);
  var lastBoundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (lastBoundary > Math.floor(maxChars * 0.7)) {
    cut = cut.slice(0, lastBoundary + 1);
  }

  return cut.trim() + "\n\n[Truncated for token budget]";
}

function buildPromptSections(input) {
  var role = normalizeText(input.role || "You are a precise execution agent.");
  var objective = normalizeText(input.objective || input.task || "");
  var context = stripNoise(input.context || "");
  var constraints = dedupeLines(splitLines(input.constraints || ""));
  var requiredOutput = dedupeLines(splitLines(input.requiredOutput || ""));

  var sections = [];
  sections.push("Role\n" + role);

  if (objective) {
    sections.push("Objective\n" + objective);
  }

  if (context) {
    sections.push("Context\n" + context);
  }

  var cSection = summarizeBullets("Constraints", constraints);
  if (cSection) sections.push(cSection);

  var rSection = summarizeBullets("Required Output", requiredOutput);
  if (rSection) sections.push(rSection);

  return sections;
}

function optimizePrompt(input, options) {
  input = input || {};
  options = options || {};

  var maxChars = Number(options.maxChars || DEFAULT_MAX_CHARS);
  var softLimit = Number(options.softLimit || DEFAULT_SOFT_LIMIT);

  if (!Number.isFinite(maxChars) || maxChars < 500) {
    throw new Error("optimizePrompt: maxChars must be a number >= 500");
  }

  if (!Number.isFinite(softLimit) || softLimit < 300 || softLimit > maxChars) {
    softLimit = Math.min(DEFAULT_SOFT_LIMIT, maxChars);
  }

  var sections = buildPromptSections(input);
  var prompt = sections.join("\n\n");
  var tokenEstimate = estimateTokens(prompt);

  if (prompt.length > maxChars) {
    prompt = truncateSmart(prompt, maxChars);
    tokenEstimate = estimateTokens(prompt);
  }

  // Secondary compression: shorten context first while preserving role/objective/constraints.
  if (prompt.length > softLimit) {
    var role = sections[0] || "";
    var objective = sections[1] || "";
    var tail = sections.slice(3).join("\n\n");
    var contextSection = sections[2] || "";

    if (contextSection.indexOf("Context\n") === 0) {
      var contextBody = contextSection.slice("Context\n".length);
      var compressedContext = truncateSmart(contextBody, Math.max(400, softLimit - role.length - objective.length - tail.length - 80));
      prompt = [role, objective, "Context\n" + compressedContext, tail].filter(Boolean).join("\n\n");
      tokenEstimate = estimateTokens(prompt);
    }
  }

  return {
    prompt: normalizeText(prompt),
    meta: {
      chars: prompt.length,
      tokenEstimate: tokenEstimate,
      maxChars: maxChars,
      softLimit: softLimit,
      compressed: prompt.length > softLimit,
      generatedAt: new Date().toISOString()
    }
  };
}

function optimizePromptFromRaw(rawText, options) {
  var cleaned = stripNoise(rawText || "");
  return optimizePrompt({
    role: "You are a precise execution agent.",
    objective: cleaned,
    constraints: "Avoid unnecessary verbosity\nReturn only relevant output"
  }, options);
}

module.exports = {
  optimizePrompt: optimizePrompt,
  optimizePromptFromRaw: optimizePromptFromRaw,
  _internal: {
    normalizeText: normalizeText,
    splitLines: splitLines,
    dedupeLines: dedupeLines,
    estimateTokens: estimateTokens,
    stripNoise: stripNoise,
    truncateSmart: truncateSmart,
    buildPromptSections: buildPromptSections
  }
};
