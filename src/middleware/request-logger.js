const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve('/tmp/blun-logs');
const BASE_NAME = 'api-requests.log';
const LOG_FILE = path.join(LOG_DIR, BASE_NAME);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ROTATED_FILES = 10;

let initialized = false;
let queue = Promise.resolve();

function ensureLogDir() {
  if (initialized) {
    return Promise.resolve();
  }

  return fs.promises
    .mkdir(LOG_DIR, { recursive: true })
    .then(() => {
      initialized = true;
    })
    .catch(() => {
      initialized = true;
    });
}

function shouldLogRequest(req) {
  const url = typeof req.originalUrl === 'string' ? req.originalUrl : req.url || '';
  return url.startsWith('/api/');
}

function safeParseUrl(req) {
  const origin = 'http://localhost';
  const rawUrl = typeof req.originalUrl === 'string' ? req.originalUrl : req.url || '/';

  try {
    return new URL(rawUrl, origin);
  } catch (_error) {
    return new URL('/', origin);
  }
}

function serializeQuery(urlObject) {
  const queryEntries = {};

  urlObject.searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(queryEntries, key)) {
      const current = queryEntries[key];
      if (Array.isArray(current)) {
        current.push(value);
      } else {
        queryEntries[key] = [current, value];
      }
      return;
    }
    queryEntries[key] = value;
  });

  return queryEntries;
}

async function rotateLogsIfNeeded() {
  let stats;
  try {
    stats = await fs.promises.stat(LOG_FILE);
  } catch (_error) {
    return;
  }

  if (stats.size < MAX_FILE_SIZE_BYTES) {
    return;
  }

  for (let index = MAX_ROTATED_FILES - 1; index >= 1; index -= 1) {
    const source = path.join(LOG_DIR, `${BASE_NAME}.${index}`);
    const target = path.join(LOG_DIR, `${BASE_NAME}.${index + 1}`);

    try {
      await fs.promises.rename(source, target);
    } catch (_error) {
      // Ignore missing files and continue with best effort rotation.
    }
  }

  try {
    await fs.promises.rename(LOG_FILE, path.join(LOG_DIR, `${BASE_NAME}.1`));
  } catch (_error) {
    // Rotation is best effort, do not break request handling.
  }
}

function enqueueWrite(line) {
  queue = queue
    .then(ensureLogDir)
    .then(rotateLogsIfNeeded)
    .then(
      () =>
        new Promise((resolve) => {
          fs.appendFile(LOG_FILE, line, 'utf8', () => {
            resolve();
          });
        })
    )
    .catch(() => {
      // Never throw from logger path.
    });

  return queue;
}

function buildLogEntry(req, res, startedAt, finishedAt) {
  const urlObject = safeParseUrl(req);
  const query = serializeQuery(urlObject);

  return {
    timestamp: new Date(startedAt).toISOString(),
    method: req.method,
    path: urlObject.pathname,
    query,
    responseStatus: res.statusCode,
    durationMs: finishedAt - startedAt,
  };
}

function requestLogger(req, res, next) {
  if (!shouldLogRequest(req)) {
    next();
    return;
  }

  const startedAt = Date.now();

  res.once('finish', () => {
    const finishedAt = Date.now();
    const logEntry = buildLogEntry(req, res, startedAt, finishedAt);
    const line = `${JSON.stringify(logEntry)}\n`;
    enqueueWrite(line);
  });

  next();
}

function installGlobalExpressHook() {
  let expressModule;
  try {
    expressModule = require('express');
  } catch (_error) {
    return;
  }

  if (!expressModule || !expressModule.application) {
    return;
  }

  const appPrototype = expressModule.application;
  const originalHandle = appPrototype.handle;

  if (typeof originalHandle !== 'function') {
    return;
  }

  if (originalHandle.__blunRequestLoggerPatched === true) {
    return;
  }

  function wrappedHandle(req, res, out) {
    requestLogger(req, res, () => {
      originalHandle.call(this, req, res, out);
    });
  }

  wrappedHandle.__blunRequestLoggerPatched = true;
  appPrototype.handle = wrappedHandle;
}

installGlobalExpressHook();

module.exports = requestLogger;
