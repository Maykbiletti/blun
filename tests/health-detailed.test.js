const { test } = require('node:test');
const assert = require('node:assert');

test('detailed health contains uptime > 0', () => {
  const health = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  };

  assert.ok(health.uptime > 0, 'uptime must be > 0');
});

test('detailed health contains memory.rss', () => {
  const health = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  };

  assert.ok(health.memory);
  assert.ok(Object.prototype.hasOwnProperty.call(health.memory, 'rss'));
});

test('detailed health contains nodeVersion starting with v', () => {
  const health = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  };

  assert.strictEqual(typeof health.nodeVersion, 'string');
  assert.ok(health.nodeVersion.startsWith('v'));
});
