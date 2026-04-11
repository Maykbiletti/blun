const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const routeFile = path.resolve(__dirname, '../../../src/routes/v1/agents.js');

function createRouterMock() {
  return {
    stack: [],
    get(routePath, handler) {
      this.stack.push({
        route: {
          path: routePath,
          methods: { get: true },
          stack: [{ handle: handler }]
        }
      });
    },
    post() {},
    put() {},
    delete() {}
  };
}

function loadRouter({ db, logger }) {
  const originalLoad = Module._load;
  const router = createRouterMock();

  Module._load = function patchedLoad(request, parent) {
    if (parent && parent.filename === routeFile) {
      if (request === 'express') return { Router: () => router };
      if (request === '../../db') return db;
      if (request === '../../logger') return logger || { error() {}, info() {}, warn() {} };
    }
    return originalLoad.apply(this, arguments);
  };

  delete require.cache[routeFile];
  require(routeFile);
  Module._load = originalLoad;

  return router;
}

function getRouteHandler(router, method, routePath) {
  const routeLayer = router.stack.find((layer) => {
    return layer.route && layer.route.path === routePath && layer.route.methods[method];
  });

  assert(routeLayer, `Route ${method.toUpperCase()} ${routePath} not found`);
  return routeLayer.route.stack[0].handle;
}

function createResponseMock() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

test('GET /agents returns 200 and list payload with count', async () => {
  const rows = [
    { id: 11, name: 'Alpha', status: 'idle' },
    { id: 12, name: 'Bravo', status: 'running' }
  ];

  const db = {
    query: async (sql) => {
      assert.match(sql, /SELECT \* FROM agents/);
      assert.match(sql, /WHERE deleted_at IS NULL/);
      assert.match(sql, /ORDER BY created_at DESC/);
      return { rows };
    }
  };

  const router = loadRouter({ db });
  const handler = getRouteHandler(router, 'get', '/');
  const res = createResponseMock();

  await handler({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.payload, {
    success: true,
    data: rows,
    count: 2
  });
});

test('GET /agents supports array response from db.query', async () => {
  const rows = [{ id: 99, name: 'ArrayOnly', status: 'stopped' }];

  const db = {
    query: async () => rows
  };

  const router = loadRouter({ db });
  const handler = getRouteHandler(router, 'get', '/');
  const res = createResponseMock();

  await handler({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.payload.success, true);
  assert.strictEqual(res.payload.count, 1);
  assert.deepStrictEqual(res.payload.data, rows);
});

test('GET /agents returns empty list when no rows exist', async () => {
  const db = {
    query: async () => ({ rows: [] })
  };

  const router = loadRouter({ db });
  const handler = getRouteHandler(router, 'get', '/');
  const res = createResponseMock();

  await handler({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.payload.success, true);
  assert.strictEqual(res.payload.count, 0);
  assert.deepStrictEqual(res.payload.data, []);
});

test('GET /agents returns 500 and logs on db error', async () => {
  const dbError = new Error('connection refused');
  const logged = [];

  const db = {
    query: async () => {
      throw dbError;
    }
  };

  const logger = {
    error: (...args) => logged.push(args),
    info() {},
    warn() {}
  };

  const router = loadRouter({ db, logger });
  const handler = getRouteHandler(router, 'get', '/');
  const res = createResponseMock();

  await handler({}, res);

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.payload.success, false);
  assert.strictEqual(res.payload.error, 'Fehler beim Laden der Agenten');
  assert.strictEqual(res.payload.message, undefined);
  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0][0], 'GET /agents Error:');
  assert.strictEqual(logged[0][1], dbError);
});

test('GET /agents includes error message in development mode only', async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  const db = {
    query: async () => {
      throw new Error('dev-visible-message');
    }
  };

  const router = loadRouter({ db });
  const handler = getRouteHandler(router, 'get', '/');
  const res = createResponseMock();

  try {
    await handler({}, res);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }

  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.payload.success, false);
  assert.strictEqual(res.payload.error, 'Fehler beim Laden der Agenten');
  assert.strictEqual(res.payload.message, 'dev-visible-message');
});

test('GET /agents never mutates database row objects', async () => {
  const first = { id: 1, name: 'KeepMe', config: { model: 'llama' } };
  const second = { id: 2, name: 'KeepMeToo', config: { model: 'mistral' } };
  const rows = [first, second];

  const db = {
    query: async () => ({ rows })
  };

  const router = loadRouter({ db });
  const handler = getRouteHandler(router, 'get', '/');
  const res = createResponseMock();

  await handler({}, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.payload.data[0], first);
  assert.strictEqual(res.payload.data[1], second);
  assert.deepStrictEqual(first.config, { model: 'llama' });
  assert.deepStrictEqual(second.config, { model: 'mistral' });
});
