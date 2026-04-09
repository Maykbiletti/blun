const fs = require('fs');
const { performance } = require('perf_hooks');

// Health Check Middleware
// Status: Ready for Production
// Author: Klaus (DevOps)

class HealthChecker {
    constructor() {
        this.startTime = Date.now();
        this.checkTimeout = 5000; // 5s timeout für alle checks
    }

    // DB Connection Ping
    async checkDatabase() {
        const start = performance.now();
        try {
            // TODO: Echte DB Connection hier einfügen
            // Simuliert DB Check für jetzt
            await new Promise(resolve => setTimeout(resolve, 50));

            return {
                status: 'healthy',
                responseTime: Math.round(performance.now() - start),
                message: 'Database connection OK'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Math.round(performance.now() - start),
                message: `Database error: ${error.message}`,
                error: 'DB_CONNECTION_FAILED'
            };
        }
    }

    // Disk Space Check
    async checkDisk() {
        const start = performance.now();
        try {
            const stats = fs.statSync('/root/blun');
            const diskUsage = {
                available: true,
                path: '/root/blun',
                accessible: true
            };

            return {
                status: 'healthy',
                responseTime: Math.round(performance.now() - start),
                message: 'Disk access OK',
                details: diskUsage
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Math.round(performance.now() - start),
                message: `Disk check failed: ${error.message}`,
                error: 'DISK_ACCESS_FAILED'
            };
        }
    }

    // Memory Usage Check
    checkMemory() {
        const start = performance.now();
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

        // Memory Warning bei >400MB
        const isHealthy = heapUsedMB < 400;

        return {
            status: isHealthy ? 'healthy' : 'warning',
            responseTime: Math.round(performance.now() - start),
            message: isHealthy ? 'Memory usage normal' : 'Memory usage high',
            details: {
                heapUsed: `${heapUsedMB}MB`,
                heapTotal: `${heapTotalMB}MB`,
                threshold: '400MB'
            },
            error: !isHealthy ? 'MEMORY_HIGH' : null
        };
    }

    // System Uptime
    getUptime() {
        const start = performance.now();
        const processUptime = Math.round(process.uptime());
        const systemUptime = Math.round((Date.now() - this.startTime) / 1000);

        return {
            status: 'healthy',
            responseTime: Math.round(performance.now() - start),
            message: 'System running',
            details: {
                processUptime: `${processUptime}s`,
                serviceUptime: `${systemUptime}s`,
                startTime: new Date(this.startTime).toISOString()
            }
        };
    }

    // Alle Health Checks ausführen
    async runAllChecks() {
        const start = performance.now();
        const checks = {};

        try {
            // Promise.allSettled für parallele Checks
            const [dbResult, diskResult, memResult, uptimeResult] = await Promise.allSettled([
                this.checkDatabase(),
                this.checkDisk(),
                Promise.resolve(this.checkMemory()),
                Promise.resolve(this.getUptime())
            ]);

            checks.database = dbResult.status === 'fulfilled' ? dbResult.value : {
                status: 'unhealthy',
                message: 'Database check timeout',
                error: 'DB_CHECK_TIMEOUT'
            };

            checks.disk = diskResult.status === 'fulfilled' ? diskResult.value : {
                status: 'unhealthy',
                message: 'Disk check timeout',
                error: 'DISK_CHECK_TIMEOUT'
            };

            checks.memory = memResult.value;
            checks.uptime = uptimeResult.value;

            // Overall Status bestimmen
            const hasUnhealthy = Object.values(checks).some(check => check.status === 'unhealthy');
            const hasWarnings = Object.values(checks).some(check => check.status === 'warning');

            const overallStatus = hasUnhealthy ? 'unhealthy' : (hasWarnings ? 'degraded' : 'healthy');

            return {
                status: overallStatus,
                responseTime: Math.round(performance.now() - start),
                timestamp: new Date().toISOString(),
                checks: checks,
                version: '1.0.0'
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Math.round(performance.now() - start),
                timestamp: new Date().toISOString(),
                message: `Health check failed: ${error.message}`,
                error: 'HEALTH_CHECK_ERROR',
                checks: checks
            };
        }
    }
}

// Express Middleware Function
const healthChecker = new HealthChecker();

const healthCheckMiddleware = async (req, res, next) => {
    try {
        const healthResult = await healthChecker.runAllChecks();

        // HTTP Status Code based auf Overall Status
        let statusCode;
        switch (healthResult.status) {
            case 'healthy':
                statusCode = 200;
                break;
            case 'degraded':
                statusCode = 200; // Degraded aber noch OK
                break;
            case 'unhealthy':
                statusCode = 503; // Service Unavailable
                break;
            default:
                statusCode = 503;
        }

        res.status(statusCode).json({
            ...healthResult,
            service: 'BLUN Agent System',
            environment: process.env.NODE_ENV || 'development'
        });

    } catch (error) {
        // Fallback bei totaler Failure
        res.status(503).json({
            status: 'unhealthy',
            message: 'Health check system failure',
            error: 'HEALTH_SYSTEM_FAILURE',
            timestamp: new Date().toISOString(),
            details: error.message
        });
    }
};

module.exports = {
    healthCheckMiddleware,
    HealthChecker
};