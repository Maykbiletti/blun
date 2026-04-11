const { Router } = require('express');
const { pool } = require('../db');
const { getProcessStatus } = require('../agent/runtime');

function toMilliseconds(startHrTime) {
  const diff = process.hrtime(startHrTime);
  return Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
}

async function checkDatabase() {
  const start = process.hrtime();

  try {
    await pool.query('SELECT 1 AS ok');

    return {
      status: 'healthy',
      responseTimeMs: toMilliseconds(start)
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTimeMs: toMilliseconds(start),
      error: error.message
    };
  }
}

async function fetchAgentsFromDb() {
  const result = await pool.query('SELECT id, name, status FROM agents ORDER BY id');
  return result.rows;
}

async function checkAgentProcesses() {
  const runtimeProcesses = getProcessStatus();
  const runtimeEntries = Object.entries(runtimeProcesses);

  try {
    const agents = await fetchAgentsFromDb();
    const activeAgents = agents.filter((agent) => agent.status === 'active');

    const runtimeById = new Map(runtimeEntries.map(([id, info]) => [String(id), info]));

    const missingProcesses = activeAgents
      .filter((agent) => !runtimeById.has(String(agent.id)))
      .map((agent) => ({ id: agent.id, name: agent.name }));

    const downProcesses = runtimeEntries
      .filter(([, info]) => info.running === false)
      .map(([id, info]) => ({
        id: Number(id),
        name: info.name,
        pid: info.pid,
        running: info.running
      }));

    const activeIdSet = new Set(activeAgents.map((agent) => String(agent.id)));

    const orphanProcesses = runtimeEntries
      .filter(([id]) => !activeIdSet.has(String(id)))
      .map(([id, info]) => ({
        id: Number(id),
        name: info.name,
        pid: info.pid,
        running: info.running
      }));

    const healthy = missingProcesses.length === 0 && downProcesses.length === 0;

    return {
      status: healthy ? 'healthy' : 'degraded',
      totals: {
        agentsInDb: agents.length,
        activeAgentsInDb: activeAgents.length,
        runtimeProcesses: runtimeEntries.length
      },
      missingProcesses,
      downProcesses,
      orphanProcesses
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      totals: {
        runtimeProcesses: runtimeEntries.length
      },
      error: error.message,
      runtimeProcesses: runtimeEntries.map(([id, info]) => ({
        id: Number(id),
        name: info.name,
        pid: info.pid,
        running: info.running
      }))
    };
  }
}

async function buildHealthReport() {
  const startedAt = process.hrtime();

  const [database, agents] = await Promise.all([
    checkDatabase(),
    checkAgentProcesses()
  ]);

  const overallStatus =
    database.status === 'unhealthy' || agents.status === 'unhealthy'
      ? 'unhealthy'
      : (agents.status === 'degraded' ? 'degraded' : 'healthy');

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: 'dieter',
    responseTimeMs: toMilliseconds(startedAt),
    checks: {
      database,
      agents
    }
  };
}

async function healthHandler(req, res) {
  try {
    const report = await buildHealthReport();
    const statusCode = report.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(report);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'dieter',
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
  createDieterHealthCheckRouter,
  registerDieterHealthCheck,
  buildHealthReport,
  healthHandler
};
