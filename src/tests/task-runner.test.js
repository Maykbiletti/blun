const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const cp = require("child_process");
const { executeTask, validateOutput, runAgentTasks } = require("../agent/task-runner");

test("executeTask returns result object", async () => {
  const agent = { name: "TestAgent", role: "Entwickler" };
  const task = { id: 1, task: "echo 'test'" };
  const mockQuery = async (sql, params) => {};

  const result = await executeTask(agent, task, mockQuery);

  assert(typeof result === "object", "Result should be object");
  assert(typeof result.pass === "boolean", "Result should have pass property");
  if (result.pass) {
    assert(typeof result.commits === "number", "Result should have commits count");
    assert(typeof result.files === "number", "Result should have files count");
  } else {
    assert(typeof result.reason === "string", "Failed result should have reason");
  }
});

test("validateOutput checks git log for commits", async () => {
  const testDir = "/tmp/test-git-repo";

  // Setup test git repo
  cp.execSync(`rm -rf ${testDir} && mkdir -p ${testDir} && cd ${testDir} && git init && git config user.email "test@test.com" && git config user.name "Test"`);

  const result = await validateOutput(testDir, "TestAgent");

  assert(typeof result.hasCommit === "boolean", "Should check for commits");
  assert(typeof result.hasChanges === "boolean", "Should check for changes");
  assert(typeof result.commits === "number", "Should return commit count");
  assert(typeof result.changedFiles === "number", "Should return changed files count");

  // Cleanup
  cp.execSync(`rm -rf ${testDir}`);
});

test("failed tasks go back to pending status", async () => {
  let lastQuery = null;
  const mockQuery = async (sql, params) => {
    lastQuery = { sql, params };
  };

  const agent = { name: "TestAgent", role: "Entwickler" };
  const task = { id: 42, task: "" }; // Empty task should fail

  const result = await executeTask(agent, task, mockQuery);

  assert.strictEqual(result.pass, false, "Empty task should fail");
  assert(lastQuery.sql.includes("pending"), "Should update status to pending");
  assert.strictEqual(lastQuery.params[0], 42, "Should update correct task ID");
});

test("empty task is skipped", async () => {
  const mockQueryOne = async () => null; // No pending tasks
  const mockQuery = async () => {};
  const agent = { id: 1, name: "TestAgent" };

  const result = await runAgentTasks(agent, mockQuery, mockQueryOne);

  assert(result.idle === true, "Should return idle when no tasks");
});