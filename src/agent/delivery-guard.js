var fs = require("fs");
var path = require("path");

var CODE_EXT = {
  ".js": true,
  ".cjs": true,
  ".mjs": true,
  ".ts": true,
  ".tsx": true,
  ".jsx": true,
  ".py": true,
  ".go": true,
  ".rs": true,
  ".java": true,
  ".kt": true,
  ".swift": true,
  ".php": true,
  ".rb": true,
  ".cs": true,
  ".cpp": true,
  ".c": true,
  ".h": true,
  ".hpp": true,
  ".sql": true,
  ".sh": true,
  ".css": true,
  ".scss": true,
  ".vue": true,
  ".svelte": true
};

function isCodeFile(filePath) {
  var ext = path.extname(filePath || "").toLowerCase();
  return !!CODE_EXT[ext];
}

function parseMinLines(taskText) {
  if (!taskText) return 0;
  var text = String(taskText);
  var matches = [
    /at\s+least\s+(\d{2,5})\s+lines/i,
    /mindestens\s+(\d{2,5})\s+zeilen/i,
    /min\.?\s*(\d{2,5})\s+lines/i,
    /(?:^|\s)(\d{2,5})\+\s*lines(?:\s|$)/i,
    /result_len\s*[<=>]+\s*(\d{2,5})/i
  ];
  for (var i = 0; i < matches.length; i++) {
    var m = text.match(matches[i]);
    if (m && m[1]) return parseInt(m[1], 10) || 0;
  }
  return 0;
}

function hasCommitRequirement(taskText) {
  if (!taskText) return false;
  var text = String(taskText).toLowerCase();
  return text.indexOf("commit") >= 0 || text.indexOf("git add") >= 0 || text.indexOf("git commit") >= 0;
}

function hasSyntaxCheckRequirement(taskText) {
  if (!taskText) return false;
  var text = String(taskText).toLowerCase();
  return text.indexOf("node -c") >= 0;
}

function parseTaskConstraints(taskText) {
  var minLines = parseMinLines(taskText);
  return {
    minLines: minLines,
    requireCommit: hasCommitRequirement(taskText),
    requireNodeCheck: hasSyntaxCheckRequirement(taskText)
  };
}

function safeCountLines(filePath) {
  try {
    var st = fs.statSync(filePath);
    if (!st.isFile() || st.size > 1024 * 1024) return 0;
    var content = fs.readFileSync(filePath, "utf8");
    if (!content) return 0;
    return content.split("\n").length;
  } catch (_e) {
    return 0;
  }
}

function aggregateUntrackedLines(agentDir, untrackedFiles) {
  var added = 0;
  var codeFiles = 0;
  var list = Array.isArray(untrackedFiles) ? untrackedFiles : [];
  for (var i = 0; i < list.length; i++) {
    var rel = list[i];
    if (!rel) continue;
    if (!isCodeFile(rel)) continue;
    codeFiles += 1;
    added += safeCountLines(path.join(agentDir, rel));
  }
  return { addedLines: added, codeFiles: codeFiles };
}

function buildEmptyDeliveryReasons(constraints, metrics, cliOutput) {
  var reasons = [];
  var minLines = constraints.minLines || 0;

  if ((metrics.codeTouched || 0) === 0) reasons.push("no_code_files_touched");

  if (minLines > 0 && (metrics.linesAdded || 0) < minLines) {
    reasons.push("insufficient_line_delta:" + metrics.linesAdded + "<" + minLines);
  }

  if (constraints.requireCommit && (metrics.commits || 0) <= 0) {
    reasons.push("missing_commit");
  }

  if ((metrics.filesChanged || 0) === 0 && (metrics.commits || 0) === 0) {
    reasons.push("no_repo_changes");
  }

  var outputLen = (cliOutput || "").trim().length;
  if (outputLen > 0 && outputLen < 120) {
    reasons.push("suspiciously_short_output:" + outputLen);
  }

  return reasons;
}

function evaluateDeliveryQuality(params) {
  var taskText = params && params.taskText ? params.taskText : "";
  var validation = params && params.validation ? params.validation : {};
  var diffStats = params && params.diffStats ? params.diffStats : {};
  var cliOutput = params && params.cliOutput ? params.cliOutput : "";

  var constraints = parseTaskConstraints(taskText);
  var metrics = {
    commits: validation.commits || 0,
    filesChanged: validation.changedFiles || 0,
    codeTouched: diffStats.codeTouched || 0,
    linesAdded: diffStats.linesAdded || 0,
    linesDeleted: diffStats.linesDeleted || 0,
    untrackedCodeFiles: diffStats.untrackedCodeFiles || 0
  };

  var reasons = buildEmptyDeliveryReasons(constraints, metrics, cliOutput);
  return {
    constraints: constraints,
    metrics: metrics,
    emptyDelivery: reasons.length > 0,
    reasons: reasons
  };
}

module.exports = {
  isCodeFile: isCodeFile,
  parseTaskConstraints: parseTaskConstraints,
  aggregateUntrackedLines: aggregateUntrackedLines,
  evaluateDeliveryQuality: evaluateDeliveryQuality
};
