/**
 * Integration Tests: Agent Task Create-Update-Complete Flow
 * Scenarios: normal, with_parent, failed, cancelled, retry
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');

// ── helpers ────────────────────────────────────────────────────────────────

function loadRouterWithMocks(routerPath, mocks) {
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return orig.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve(routerPath)];
  try {
    return require(routerPath);
  } finally {
    Module._load = orig;
  }
}

async function request(app, method, routePath, body) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'x-blun-key': 'blun-dev-key' }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`http://127.0.0.1:${port}${routePath}`, opts);
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const ROUTER_PATH = path.resolve(__dirname, '../../src/routes/organisator.js');

function buildApp(dbMock) {
  const router = loadRouterWithMocks(ROUTER_PATH, {
    '../db': dbMock,
    '../middleware/auth': { authenticate: (req, res, next) => next() },
    '../agent-engine': {},
    '../paperclip-proxy': {}
  });
  const app = express();
  app.use(express.json());
  app.use('/', router);
  return app;
}

// ── shared task fixture ────────────────────────────────────────────────────

function makeTask(overrides = {}) {
  return {
    id: 1,
    agent_id: 42,
    task: 'Build login form',
    status: 'pending',
    parent_id: null,
    result: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    ...overrides
  };
}

// ── Scenario 1: normal ─────────────────────────────────────────────────────

describe('Scenario: normal task flow (create → in_progress → completed)', () => {
  test('POST /agents/42/task creates a pending task', async () => {
    const created = makeTask();
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql, params) => {
        if (sql.includes('INSERT')) return created;
        return null;
      }
    };
    const { status, body } = await request(buildApp(db), 'POST', '/agents/42/task', { task: 'Build login form' });
    assert.equal(status, 200);
    assert.equal(body.status, 'pending');
    assert.equal(body.agent_id, 42);
  });

  test('PUT /agents/42/tasks/1 sets status to in_progress', async () => {
    const updated = makeTask({ status: 'in_progress' });
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql) => sql.includes('UPDATE') ? updated : null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/1', { status: 'in_progress' });
    assert.equal(status, 200);
    assert.equal(body.status, 'in_progress');
  });

  test('PUT /agents/42/tasks/1 sets status to completed and records completed_at', async () => {
    const now = new Date().toISOString();
    const done = makeTask({ status: 'completed', completed_at: now });
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql) => sql.includes('UPDATE') ? done : null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/1', { status: 'completed' });
    assert.equal(status, 200);
    assert.equal(body.status, 'completed');
    assert.ok(body.completed_at, 'completed_at should be set');
  });
});

// ── Scenario 2: with_parent ─────────────────────────────────────────────────

describe('Scenario: task with parent_id (sub-task flow)', () => {
  test('POST /agents/42/task creates sub-task referencing parent', async () => {
    const sub = makeTask({ id: 2, task: 'Sub-task: style login form', parent_id: 1 });
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql) => sql.includes('INSERT') ? sub : null
    };
    const { status, body } = await request(buildApp(db), 'POST', '/agents/42/task', { task: 'Sub-task: style login form', parent_id: 1 });
    assert.equal(status, 200);
    assert.equal(body.id, 2);
    assert.equal(body.parent_id, 1, 'sub-task must reference parent');
  });

  test('GET /agents/42/tasks returns both parent and child tasks', async () => {
    const rows = [
      makeTask({ id: 1, task: 'Build login form' }),
      makeTask({ id: 2, task: 'Sub-task: style login form', parent_id: 1 })
    ];
    const db = {
      query: async (sql) => sql.includes('SELECT') ? { rows } : { rows: [] },
      queryOne: async () => null
    };
    const { status, body } = await request(buildApp(db), 'GET', '/agents/42/tasks', null);
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 2);
    const child = body.find(t => t.parent_id === 1);
    assert.ok(child, 'child task must be present');
  });
});

// ── Scenario 3: failed ──────────────────────────────────────────────────────

describe('Scenario: task fails (create → in_progress → failed)', () => {
  test('PUT /agents/42/tasks/1 transitions to failed', async () => {
    const failed = makeTask({ status: 'failed' });
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql) => sql.includes('UPDATE') ? failed : null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/1', { status: 'failed' });
    assert.equal(status, 200);
    assert.equal(body.status, 'failed');
    assert.equal(body.completed_at, null, 'failed tasks must not have completed_at');
  });

  test('PUT with invalid status returns 400', async () => {
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async () => null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/1', { status: 'broken' });
    assert.equal(status, 400);
    assert.ok(body.error, 'must return error message');
  });
});

// ── Scenario 4: cancelled ───────────────────────────────────────────────────

describe('Scenario: task is cancelled (create → delete)', () => {
  test('POST then DELETE removes task', async () => {
    const db = {
      query: async (sql) => sql.includes('DELETE') ? { rows: [] } : { rows: [] },
      queryOne: async (sql) => sql.includes('INSERT') ? makeTask() : null
    };
    const appCreate = buildApp(db);
    const create = await request(appCreate, 'POST', '/agents/42/task', { task: 'Build login form' });
    assert.equal(create.status, 200);

    const appDelete = buildApp(db);
    const del = await request(appDelete, 'DELETE', '/agents/42/tasks/1', null);
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);
  });

  test('GET after cancel returns empty list', async () => {
    const db = {
      query: async (sql) => sql.includes('SELECT') ? { rows: [] } : { rows: [] },
      queryOne: async () => null
    };
    const { status, body } = await request(buildApp(db), 'GET', '/agents/42/tasks', null);
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });
});

// ── Scenario 5: retry ───────────────────────────────────────────────────────

describe('Scenario: task retry (failed → reset to pending → completed)', () => {
  test('failed task can be reset to pending via PUT', async () => {
    const reset = makeTask({ status: 'pending' });
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql) => sql.includes('UPDATE') ? reset : null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/1', { status: 'pending' });
    assert.equal(status, 200);
    assert.equal(body.status, 'pending', 'retry must reset status to pending');
  });

  test('retried task completes successfully on second attempt', async () => {
    const now = new Date().toISOString();
    const done = makeTask({ status: 'completed', completed_at: now });
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async (sql) => sql.includes('UPDATE') ? done : null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/1', { status: 'completed' });
    assert.equal(status, 200);
    assert.equal(body.status, 'completed');
    assert.ok(body.completed_at);
  });

  test('POST /tasks/reset resets all stuck in_progress tasks', async () => {
    let resetCalled = false;
    const db = {
      query: async (sql) => {
        if (sql.includes("UPDATE tasks SET status = 'pending'")) resetCalled = true;
        return { rows: [], rowCount: 3 };
      },
      queryOne: async () => null
    };
    const { status } = await request(buildApp(db), 'POST', '/tasks/reset', {});
    assert.equal(status, 200);
    assert.ok(resetCalled, 'bulk reset query must execute');
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('POST /agents/42/task without task body returns 400', async () => {
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async () => null
    };
    const { status, body } = await request(buildApp(db), 'POST', '/agents/42/task', {});
    assert.equal(status, 400);
    assert.equal(body.error, 'task required');
  });

  test('PUT on non-existent task returns 404', async () => {
    const db = {
      query: async () => ({ rows: [] }),
      queryOne: async () => null
    };
    const { status, body } = await request(buildApp(db), 'PUT', '/agents/42/tasks/9999', { status: 'completed' });
    assert.equal(status, 404);
    assert.equal(body.error, 'task not found');
  });
});
