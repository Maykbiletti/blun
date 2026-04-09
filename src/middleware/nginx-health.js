const http = require('http');
const { performance } = require('perf_hooks');

/**
 * Nginx Health Check Middleware
 * Überprüft Nginx Status und Response Time
 * Gibt 503 bei Timeout > 2s zurück
 */
const nginxHealthCheck = (options = {}) => {
  const {
    healthEndpoint = '/health',
    nginxHost = 'localhost',
    nginxPort = 80,
    timeout = 2000,
    skipRoutes = ['/health', '/nginx-health']
  } = options;

  return async (req, res, next) => {
    // Skip health check für bestimmte Routes
    if (skipRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }

    const startTime = performance.now();

    try {
      const healthCheck = await checkNginxHealth(nginxHost, nginxPort, healthEndpoint, timeout);
      const responseTime = performance.now() - startTime;

      if (!healthCheck.healthy) {
        return res.status(503).json({
          error: 'nginx_unhealthy',
          code: 'NGINX_DOWN',
          message: 'Nginx health check failed',
          details: {
            endpoint: `${nginxHost}:${nginxPort}${healthEndpoint}`,
            responseTime: Math.round(responseTime),
            error: healthCheck.error
          },
          timestamp: new Date().toISOString()
        });
      }

      if (responseTime > timeout) {
        return res.status(503).json({
          error: 'nginx_timeout',
          code: 'NGINX_SLOW',
          message: `Nginx health check timeout (${Math.round(responseTime)}ms > ${timeout}ms)`,
          details: {
            endpoint: `${nginxHost}:${nginxPort}${healthEndpoint}`,
            responseTime: Math.round(responseTime),
            threshold: timeout
          },
          timestamp: new Date().toISOString()
        });
      }

      // Optional: Response Time zu Request Headers hinzufügen
      res.set('X-Nginx-Health-Time', Math.round(responseTime).toString());

      next();

    } catch (error) {
      const responseTime = performance.now() - startTime;

      return res.status(503).json({
        error: 'nginx_check_failed',
        code: 'HEALTH_CHECK_ERROR',
        message: 'Failed to perform nginx health check',
        details: {
          endpoint: `${nginxHost}:${nginxPort}${healthEndpoint}`,
          responseTime: Math.round(responseTime),
          error: error.message
        },
        timestamp: new Date().toISOString()
      });
    }
  };
};

/**
 * Führt den eigentlichen Health Check durch
 */
function checkNginxHealth(host, port, path, timeoutMs) {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'BLUN-Health-Check/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            healthy: true,
            statusCode: res.statusCode,
            data: data
          });
        } else {
          resolve({
            healthy: false,
            statusCode: res.statusCode,
            error: `HTTP ${res.statusCode}: ${data}`
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        healthy: false,
        error: `Timeout after ${timeoutMs}ms`
      });
    });

    req.on('error', (error) => {
      resolve({
        healthy: false,
        error: error.message
      });
    });

    req.end();
  });
}

/**
 * Standalone Health Check Funktion für Tests
 */
const performHealthCheck = async (options = {}) => {
  const {
    nginxHost = 'localhost',
    nginxPort = 80,
    healthEndpoint = '/health',
    timeout = 2000
  } = options;

  const startTime = performance.now();
  const result = await checkNginxHealth(nginxHost, nginxPort, healthEndpoint, timeout);
  const responseTime = performance.now() - startTime;

  return {
    ...result,
    responseTime: Math.round(responseTime),
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  nginxHealthCheck,
  performHealthCheck
};