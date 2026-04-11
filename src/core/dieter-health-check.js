const os = require('os');
const { performance } = require('perf_hooks');
const { Router } = require('express');
const { pool } = require('../db');
const { getProcessStatus } = require('../agent/runtime');

const SAMPLE_DELAY_MS = 25;
const DEFAULT_THRESHOLDS = {
  dbLatencyMs: 250,
  eventLoopLagMs: 100,
  memoryUsageRatio: 0.9,
  loadPerCpu: 1.2
};

function toMs(hrStart) {
  const diff = process.hrtime(hrStart);
  return Math.round(((diff[0] * 1e9) + diff[1]) / 1e6);
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getThresholds() {
  return {
    dbLatencyMs: asNumber(process.env.DIETER_HEALTH_DB_LATENCY_MS, DEFAULT_THRESHOLDS.dbLatencyMs),
    eventLoopLagMs: asNumber(process.env.DIETER_HEALTH_EVENT_LOOP_LAG_MS, DEFAULT_THRESHOLDS.eventLoopLagMs),
    memoryUsageRatio: asNumber(process.env.DIETER_HEALTH_MEMORY_RATIO, DEFAULT_THRESHOLDS.memoryUsageRatio),
    loadPerCpu: asNumber(process.env.DIETER_HEALTH_LOAD_PER_CPU, DEFAULT_THRESHOLDS.loadPerCpu)
  };
}

async function checkDatabase(thresholds) {
  const started = process.hrtime();

  try {
    const ping = await pool.query('SELECT NOW() AS now, 1 AS ok');
    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM agents');

    const responseTimeMs = toMs(started);
    const agentCount = countResult.rows[0] ? countResult.rows[0].total : 0;
    const status = responseTimeMs > thresholds.dbLatencyMs ? 'degraded' : 'healthy';

    return {
      status,
      responseTimeMs,
      thresholdMs: thresholds.dbLatencyMs,
      sampledAt: ping.rows[0] ? ping.rows[0].now : null,
      details: {
        agentsTotal: agentCount
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTimeMs: toMs(started),
      thresholdMs: thresholds.dbLatencyMs,
      error: error.message
    };
  }
}

async function checkEventLoop(thresholds) {
  const start = performance.now();
  await new Promise((resolve) => setTimeout(resolve, SAMPLE_DELAY_MS));

  const elapsed = performance.now() - start;
  const lagMs = Math.max(0, Math.round((elapsed - SAMPLE_DELAY_MS) * 100) / 100);

  return {
    status: lagMs > thresholds.eventLoopLagMs ? 'degraded' : 'healthy',
    lagMs,
    thresholdMs: thresholds.eventLoopLagMs,
    sampleDelayMs: SAMPLE_DELAY_MS
  };
}

function checkSystem(thresholds) {
  const load1m = os.loadavg()[0];
  const cpuCount = Math.max(1, os.cpus().length);
  const normalizedLoad = Number((load1m / cpuCount).toFixed(3));

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryUsageRatio = totalMem > 0 ? Number((usedMem / totalMem).toFixed(4)) : 0;

  const loadStatus = normalizedLoad > thresholds.loadPerCpu ? 'degraded' : 'healthy';
  const memoryStatus = memoryUsageRatio > thresholds.memoryUsageRatio ? 'degraded' : 'healthy';
  const status = loadStatus === 'degraded' || memoryStatus === 'degraded' ? 'degraded' : 'healthy';

  return {
    status,
    host: os.hostname(),
    platform: os.platform() + '-' + os.arch(),
    uptimeSec: Math.floor(os.uptime()),
    load: {
      oneMinute: Number(load1m.toFixed(3)),
      normalizedPerCpu: normalizedLoad,
      thresholdPerCpu: thresholds.loadPerCpu,
      cpuCount,
      status: loadStatus
    },
    memory: {
      usedBytes: usedMem,
      totalBytes: totalMem,
      usageRatio: memoryUsageRatio,
      thresholdRatio: thresholds.memoryUsageRatio,
      status: memoryStatus
    }
  };
}

async function checkAgentRuntime() {
  const started = process.hrtime();
  const runtime = getProcessStatus();
  const runtimeEntries = Object.entries(runtime);

  try {
    const dbResult = await pool.query("SELECT id, name, status FROM agents WHERE status IN ('active', 'error', 'idle')");
    const dbAgents = dbResult.rows;

    const runtimeById = new Map(runtimeEntries.map(([id, info]) => [String(id), info]));
    const activeAgents = dbAgents.filter((agent) => agent.status === 'active');
    const activeIdSet = new Set(activeAgents.map((agent) => String(agent.id)));

    const missingRuntime = activeAgents
      .filter((agent) => !runtimeById.has(String(agent.id)))
      .map((agent) => ({ id: agent.id, name: agent.name }));

    const stoppedRuntime = runtimeEntries
      .filter(([, info]) => info.running === false)
      .map(([id, info]) => ({ id: Number(id), name: info.name, pid: info.pid }));

    const orphanRuntime = runtimeEntries
      .filter(([id]) => !activeIdSet.has(String(id)))
      .map(([id, info]) => ({ id: Number(id), name: info.name, pid: info.pid, running: info.running }));

    const degraded = missingRuntime.length > 0 || stoppedRuntime.length > 0;

    return {
      status: degraded ? 'degraded' : 'healthy',
      responseTimeMs: toMs(started),
      totals: {
        agentsInDb: dbAgents.length,
        activeInDb: activeAgents.length,
        runtimeProcesses: runtimeEntries.length
      },
      missingRuntime,
      stoppedRuntime,
      orphanRuntime
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTimeMs: toMs(started),
      totals: {
        runtimeProcesses: runtimeEntries.length
      },
      runtime: runtimeEntries.map(([id, info]) => ({ id: Number(id), name: info.name, pid: info.pid, running: info.running })),
      error: error.message
    };
  }
}

function combineStatuses(statuses) {
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  return 'healthy';
}

async function buildHealthReport() {
  const started = process.hrtime();
  const thresholds = getThresholds();

  const [database, eventLoop, system, agents] = await Promise.all([
    checkDatabase(thresholds),
    checkEventLoop(thresholds),
    Promise.resolve(checkSystem(thresholds)),
    checkAgentRuntime()
  ]);

  const status = combineStatuses([database.status, eventLoop.status, system.status, agents.status]);

  return {
    status,
    service: 'dieter',
    timestamp: new Date().toISOString(),
    responseTimeMs: toMs(started),
    checks: {
      database,
      eventLoop,
      system,
      agents
    }
  };
}

async function healthHandler(req, res) {
  try {
    const report = await buildHealthReport();
    const statusCode = report.status === 'unhealthy' ? 503 : 200;
    return res.status(statusCode).json(report);
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      service: 'dieter',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}

function createDieterHealthCheckRouter() {
  const router = Router();
  router.get('/health', healthHandler);
  return router;
}

function registerDieterHealthCheck(app) {
  app.get('/health', healthHandler);
}

module.exports = {
  buildHealthReport,
  healthHandler,
  createDieterHealthCheckRouter,
  registerDieterHealthCheck
};
