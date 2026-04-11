const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const cp = require("child_process");
const path = require("path");
const {
  isCodeFile,
  parseTaskConstraints,
  aggregateUntrackedLines,
  evaluateDeliveryQuality
} = require("../agent/delivery-guard");

test("isCodeFile identifies common code extensions", () => {
  assert.strictEqual(isCodeFile("src/app.js"), true);
  assert.strictEqual(isCodeFile("styles/main.css"), true);
  assert.strictEqual(isCodeFile("README.md"), false);
  assert.strictEqual(isCodeFile("notes.txt"), false);
});

test("parseTaskConstraints extracts minimum lines and commit requirements", () => {
  const taskText = "Implement feature, at least 80 lines, git add + commit, run node -c";
  const parsed = parseTaskConstraints(taskText);

  assert.strictEqual(parsed.minLines, 80);
  assert.strictEqual(parsed.requireCommit, true);
  assert.strictEqual(parsed.requireNodeCheck, true);
});

test("parseTaskConstraints understands german phrasing", () => {
  const taskText = "mindestens 120 zeilen schreiben und danach commit";
  const parsed = parseTaskConstraints(taskText);

  assert.strictEqual(parsed.minLines, 120);
  assert.strictEqual(parsed.requireCommit, true);
  assert.strictEqual(parsed.requireNodeCheck, false);
});

test("aggregateUntrackedLines counts only code files", () => {
  const base = "/tmp/delivery-guard-untracked";
  cp.execSync(`rm -rf ${base} && mkdir -p ${base}/src ${base}/docs`);

  fs.writeFileSync(path.join(base, "src", "a.js"), "const a = 1;\nconst b = 2;\n");
  fs.writeFileSync(path.join(base, "src", "b.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(base, "docs", "readme.md"), "hello\nworld\n");

  const stats = aggregateUntrackedLines(base, ["src/a.js", "src/b.ts", "docs/readme.md"]);
  assert.strictEqual(stats.codeFiles, 2);
  assert(stats.addedLines >= 3, "Should count lines from code files only");

  cp.execSync(`rm -rf ${base}`);
});

test("evaluateDeliveryQuality flags empty delivery when line requirement is missed", () => {
  const quality = evaluateDeliveryQuality({
    taskText: "TASK: at least 80 lines and commit",
    validation: { commits: 1, changedFiles: 1 },
    diffStats: { linesAdded: 24, linesDeleted: 0, codeTouched: 1, untrackedCodeFiles: 0 },
    cliOutput: "done"
  });

  assert.strictEqual(quality.emptyDelivery, true);
  assert(quality.reasons.some((r) => r.startsWith("insufficient_line_delta:")));
});

test("evaluateDeliveryQuality accepts substantial code changes", () => {
  const quality = evaluateDeliveryQuality({
    taskText: "TASK: at least 80 lines and commit",
    validation: { commits: 1, changedFiles: 2 },
    diffStats: { linesAdded: 130, linesDeleted: 12, codeTouched: 2, untrackedCodeFiles: 1 },
    cliOutput: "Implemented and validated with node -c"
  });

  assert.strictEqual(quality.emptyDelivery, false);
  assert.strictEqual(quality.reasons.length, 0);
});

test("evaluateDeliveryQuality flags missing commit when required", () => {
  const quality = evaluateDeliveryQuality({
    taskText: "Please add feature and git commit",
    validation: { commits: 0, changedFiles: 3 },
    diffStats: { linesAdded: 220, linesDeleted: 14, codeTouched: 3, untrackedCodeFiles: 0 },
    cliOutput: "All changes done"
  });

  assert.strictEqual(quality.emptyDelivery, true);
  assert(quality.reasons.includes("missing_commit"));
});
