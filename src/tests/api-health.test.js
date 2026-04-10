const { test } = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://localhost:3000';

test('GET /api/health returns status 200', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(response.status, 200);
});

test('GET /api/health has timestamp', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  const data = await response.json();
  assert(data.timestamp, 'Response should have timestamp');
  assert(typeof data.timestamp === 'string' || typeof data.timestamp === 'number', 'Timestamp should be string or number');
});

test('GET /api/health has version', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  const data = await response.json();
  assert(data.version, 'Response should have version');
  assert(typeof data.version === 'string', 'Version should be string');
});

test('GET /api/health returns JSON content-type', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  const contentType = response.headers.get('content-type');
  assert(contentType.includes('application/json'), 'Content-Type should be application/json');
});

test('GET /api/health responds under 500ms', async () => {
  const start = Date.now();
  const response = await fetch(`${BASE_URL}/api/health`);
  const end = Date.now();
  const duration = end - start;

  assert(response.status === 200, 'Response should be successful');
  assert(duration < 500, `Response time ${duration}ms should be under 500ms`);
});