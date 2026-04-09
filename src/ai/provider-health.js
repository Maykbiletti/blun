const https = require('https');
const http = require('http');
const { URL } = require('url');

const PROVIDER_ENDPOINTS = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com'
};

async function checkProvider(name) {
  const endpoint = PROVIDER_ENDPOINTS[name];
  if (!endpoint) {
    return { name, status: 'unknown', latency_ms: null };
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    const url = new URL(endpoint);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'HEAD',
      timeout: 5000
    }, (res) => {
      const latency_ms = Date.now() - startTime;
      const status = res.statusCode >= 200 && res.statusCode < 400 ? 'healthy' : 'unhealthy';
      resolve({ name, status, latency_ms });
    });

    req.on('error', () => {
      const latency_ms = Date.now() - startTime;
      resolve({ name, status: 'unhealthy', latency_ms });
    });

    req.on('timeout', () => {
      req.destroy();
      const latency_ms = Date.now() - startTime;
      resolve({ name, status: 'timeout', latency_ms });
    });

    req.end();
  });
}

module.exports = { checkProvider };