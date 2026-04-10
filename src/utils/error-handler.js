'use strict';

class AppError extends Error {
  constructor(message, options = {}) {
    super(message || 'Application error');
    this.name = this.constructor.name;
    this.statusCode = options.statusCode || 500;
    this.code = options.code || 'APP_ERROR';
    this.details = options.details || null;
    this.expose = options.expose !== undefined ? options.expose : this.statusCode < 500;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details,
      expose: true
    });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, {
      statusCode: 404,
      code: 'NOT_FOUND',
      details,
      expose: true
    });
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, {
      statusCode: 401,
      code: 'AUTH_ERROR',
      details,
      expose: true
    });
  }
}

function isErrorLike(value) {
  return value instanceof Error || (value && typeof value === 'object' && typeof value.message === 'string');
}

function getStatusCode(error) {
  const candidates = [error?.statusCode, error?.status, error?.httpCode];
  for (const code of candidates) {
    if (Number.isInteger(code) && code >= 400 && code <= 599) {
      return code;
    }
  }

  if (error?.name === 'ValidationError') return 400;
  if (error?.name === 'NotFoundError') return 404;
  if (error?.name === 'AuthError') return 401;

  return 500;
}

function buildErrorResponse(error, statusCode, req) {
  const production = process.env.NODE_ENV === 'production';
  const expose = error?.expose === true || statusCode < 500;
  const message = expose ? error?.message || 'Request failed' : 'Internal server error';

  return {
    success: false,
    error: {
      code: error?.code || 'INTERNAL_ERROR',
      message,
      details: error?.details || null,
      statusCode
    },
    meta: {
      requestId: req?.id || req?.headers?.['x-request-id'] || null,
      timestamp: new Date().toISOString(),
      path: req?.originalUrl || req?.url || null,
      method: req?.method || null,
      stack: !production && isErrorLike(error) ? error.stack : undefined
    }
  };
}

function logError(error, statusCode, req) {
  const payload = {
    level: statusCode >= 500 ? 'error' : 'warn',
    message: error?.message || 'Unhandled error',
    code: error?.code || 'INTERNAL_ERROR',
    statusCode,
    path: req?.originalUrl || req?.url || null,
    method: req?.method || null,
    ip: req?.ip || req?.socket?.remoteAddress || null,
    requestId: req?.id || req?.headers?.['x-request-id'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
    timestamp: new Date().toISOString()
  };

  if (statusCode >= 500) {
    console.error('[error-handler]', payload, error?.stack || error);
    return;
  }

  console.warn('[error-handler]', payload);
}

function errorHandler(err, req, res, next) {
  if (res?.headersSent) {
    return next(err);
  }

  const error = isErrorLike(err) ? err : new AppError('Unknown error', {
    statusCode: 500,
    code: 'UNKNOWN_ERROR',
    details: { raw: String(err) },
    expose: false
  });

  const statusCode = getStatusCode(error);
  const body = buildErrorResponse(error, statusCode, req);

  logError(error, statusCode, req);

  return res.status(statusCode).json(body);
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  errorHandler,
  buildErrorResponse,
  getStatusCode,
  logError
};
