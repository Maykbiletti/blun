'use strict';

const http = require('node:http');
const { URL } = require('node:url');

const DEFAULT_BASE = 'http://127.0.0.1:3100';

function getBase() {
  return process.env.BLUN_API || DEFAULT_BASE;
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, getBase());
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Accept': 'application/json' },
      timeout: 10000,
    };

    if (body) {
      const payload = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        const data = raw ? JSON.parse(raw) : null;
        if (res.statusCode >= 400) {
          const err = new Error(data?.error || `HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.data = data;
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('BLUN server is not running. Start it with: blun start'));
      } else {
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = {
  get:  (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put:  (path, body) => request('PUT', path, body),
  del:  (path) => request('DELETE', path),
};
