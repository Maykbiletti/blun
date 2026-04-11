const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');

function loadModuleWithMocks(targetPath, mocks) {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve(targetPath)];

  try {
    return require(targetPath);
  } finally {
    Module._load = originalLoad;
  }
}

async function requestJson(app, routePath) {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${routePath}`);
    const body = await response.json();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /agents returns all active (not deleted) agents with count', async () => {
  const agentsRows = [
    { id: 2, name: 'QA-Agent', status: 'running' },
    { id: 1, name: 'Dev-Agent', status: 'stopped' }
  ];

  const agentsRouter = loadModuleWithMocks(
    path.resolve(__dirname, '../../src/routes/v1/agents.js'),
    {
      '../../db': {
        query: async () => ({ rows: agentsRows })
      },
      '../../logger': {
        info: () => {},
        error: () => {}
      }
    }
  );

  const app = express();
  app.use('/agents', agentsRouter);

  const { response, body } = await requestJson(app, '/agents');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.count, 2);
  assert.deepEqual(body.data, agentsRows);
});

test('GET /agents/:id returns the requested agent by id', async () => {
  const agentRow = {
    id: 42,
    name: 'Status-Agent',
    type: 'qa',
    status: 'running',
    config: { scope: 'integration' }
  };

  const dbMock = {
    query: async (sql, params) => {
      if (sql.includes('WHERE id = $1') && String(params[0]) === '42') {
        return { rows: [agentRow] };
      }
      return { rows: [] };
    }
  };

  const agentsRouter = loadModuleWithMocks(
    path.resolve(__dirname, '../../src/routes/v1/agents.js'),
    {
      '../../db': dbMock,
      '../../logger': {
        info: () => {},
        error: () => {}
      }
    }
  );

  const app = express();
  app.use('/agents', agentsRouter);

  const { response, body } = await requestJson(app, '/agents/42');

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data, agentRow);
});

test('GET /agents/status returns merged runtime + heartbeat status data', async () => {
  const agentsList = [
    {
      id: 10,
      name: 'Runtime-Agent',
      adapter_type: 'openai',
      model: 'gpt-5.4-mini',
      company_name: 'BLUN',
      created_at: '2026-04-10T10:00:00.000Z'
    }
  ];

  const heartbeatRows = [
    {
      agent_id: 10,
      status: 'alive',
      created_at: '2026-04-11T08:30:00.000Z'
    }
  ];

  const statusRouter = loadModuleWithMocks(
    path.resolve(__dirname, '../../src/routes/agent-status.js'),
    {
      '../db': {
        query: async (sql) => {
          if (sql.includes('FROM agents a')) {
            return agentsList;
          }
          if (sql.includes('FROM heartbeats')) {
            return heartbeatRows;
          }
          return [];
        },
        queryOne: async () => null
      },
      '../agent/runtime': {
        processes: {},
        getProcessStatus: () => ({
          10: { running: true, pid: 12345, restarts: 1 }
        })
      },
      '../middleware/auth': {
        requireAuth: (req, res, next) => next()
      }
    }
  );

  const app = express();
  app.use('/', statusRouter);

  const { response, body } = await requestJson(app, '/agents/status');

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.total, 1);
  assert.equal(Array.isArray(body.agents), true);
  assert.equal(body.agents[0].id, 10);
  assert.equal(body.agents[0].running, true);
  assert.equal(body.agents[0].heartbeat.status, 'alive');
});
