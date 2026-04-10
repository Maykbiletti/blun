const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const AgentPool = require('../agent-pool');

describe('AgentPool', () => {
  let pool;

  beforeEach(() => {
    pool = new AgentPool();
  });

  test('register agent', () => {
    const agentId = 'agent-1';
    const result = pool.register(agentId, { name: 'Test Agent' });

    assert.strictEqual(result.id, agentId);
    assert.strictEqual(result.status, 'idle');
    assert.strictEqual(result.name, 'Test Agent');
    assert.ok(result.registeredAt instanceof Date);

    const stored = pool.getAgent(agentId);
    assert.deepStrictEqual(stored, result);
  });

  test('getIdle initial', () => {
    pool.register('agent-1');
    pool.register('agent-2');
    pool.register('agent-3');

    const idleAgents = pool.getIdle();

    assert.strictEqual(idleAgents.length, 3);
    assert.strictEqual(idleAgents[0].id, 'agent-1');
    assert.strictEqual(idleAgents[1].id, 'agent-2');
    assert.strictEqual(idleAgents[2].id, 'agent-3');

    idleAgents.forEach(agent => {
      assert.strictEqual(agent.status, 'idle');
    });
  });

  test('markBusy moved to busy', () => {
    pool.register('agent-1');
    pool.register('agent-2');

    const result = pool.markBusy('agent-1');

    assert.strictEqual(result.status, 'busy');
    assert.ok(result.lastBusyAt instanceof Date);

    const idleAgents = pool.getIdle();
    assert.strictEqual(idleAgents.length, 1);
    assert.strictEqual(idleAgents[0].id, 'agent-2');

    const busyAgent = pool.getAgent('agent-1');
    assert.strictEqual(busyAgent.status, 'busy');
  });

  test('getStats counts', () => {
    pool.register('agent-1');
    pool.register('agent-2');
    pool.register('agent-3');

    let stats = pool.getStats();
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.idle, 3);
    assert.strictEqual(stats.busy, 0);

    pool.markBusy('agent-1');
    pool.markBusy('agent-2');

    stats = pool.getStats();
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.idle, 1);
    assert.strictEqual(stats.busy, 2);
  });
});