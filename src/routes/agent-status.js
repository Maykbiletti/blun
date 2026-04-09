// BLUN - AI Organisator | MIT License
/**
 * Agent Status & Monitoring Routes
 * Live-Agent-Monitoring für Dashboard
 *
 * GET /api/agents/status — Alle Agents mit Live-Status
 * GET /api/agents/status/:id — Einzelner Agent-Status mit Heartbeat
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const { getProcessStatus, processes } = require('../agent/runtime');
const { requireAuth } = require('../middleware/auth');

const router = Router();

/**
 * GET /api/agents/status
 * Alle Agents mit Live-Status (PID, Running, Restarts, Heartbeat)
 */
router.get('/agents/status', requireAuth, async function (req, res) {
  try {
    // DB-Daten (Agents + Company Info)
    const agents = await query(`
      SELECT
        a.id,
        a.name,
        a.adapter_type,
        a.model,
        a.company_id,
        c.name AS company_name,
        a.created_at
      FROM agents a
      LEFT JOIN companies c ON c.id = a.company_id
      ORDER BY c.name, a.name
    `);

    // Live-Process-Status
    const processStatus = getProcessStatus();

    // Letzten Heartbeat für jeden Agent
    const heartbeats = await query(`
      SELECT DISTINCT ON (agent_id)
        agent_id,
        status,
        created_at
      FROM heartbeats
      WHERE agent_id = ANY($1)
      ORDER BY agent_id, created_at DESC
    `, [agents.map(a => a.id)]);

    const heartbeatMap = {};
    heartbeats.forEach(hb => {
      heartbeatMap[hb.agent_id] = hb;
    });

    // Kombiniert: Agents + Live-Status + Heartbeat
    const statusData = agents.map(agent => {
      const processInfo = processStatus[agent.id] || {};
      const heartbeat = heartbeatMap[agent.id];

      return {
        id: agent.id,
        name: agent.name,
        company_name: agent.company_name,
        adapter_type: agent.adapter_type,
        model: agent.model,
        created_at: agent.created_at,
        // Live-Status
        running: processInfo.running || false,
        pid: processInfo.pid || null,
        restarts: processInfo.restarts || 0,
        // Heartbeat
        heartbeat: {
          status: heartbeat?.status || 'unknown',
          last_seen: heartbeat?.created_at || null
        }
      };
    });

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      total: statusData.length,
      agents: statusData
    });

  } catch (err) {
    console.error('[Agent Status] Error:', err.message);
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

/**
 * GET /api/agents/status/:id
 * Einzelner Agent-Status mit detaillierten Heartbeat-Infos
 */
router.get('/agents/status/:id', requireAuth, async function (req, res) {
  try {
    const agentId = req.params.id;

    // Agent-Info
    const agent = await queryOne(`
      SELECT
        a.id,
        a.name,
        a.adapter_type,
        a.model,
        a.config,
        a.company_id,
        c.name AS company_name,
        a.created_at
      FROM agents a
      LEFT JOIN companies c ON c.id = a.company_id
      WHERE a.id = $1
    `, [agentId]);

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found'
      });
    }

    // Live-Process-Status
    const processStatus = getProcessStatus();
    const processInfo = processStatus[agentId] || {};

    // Letzte 10 Heartbeats
    const heartbeats = await query(`
      SELECT
        status,
        created_at
      FROM heartbeats
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [agentId]);

    // Uptime berechnen
    const latestHeartbeat = heartbeats[heartbeats.length - 1];
    const oldestHeartbeat = heartbeats[0];
    let uptime = null;

    if (latestHeartbeat) {
      const upStart = new Date(latestHeartbeat.created_at);
      const upEnd = new Date(oldestHeartbeat?.created_at || new Date());
      uptime = Math.floor((upEnd - upStart) / 1000); // Sekunden
    }

    res.json({
      status: 'ok',
      agent: {
        id: agent.id,
        name: agent.name,
        company_name: agent.company_name,
        adapter_type: agent.adapter_type,
        model: agent.model,
        config: agent.config,
        created_at: agent.created_at
      },
      // Live-Status
      runtime: {
        running: processInfo.running || false,
        pid: processInfo.pid || null,
        restarts: processInfo.restarts || 0,
        uptime_seconds: uptime
      },
      // Heartbeat-Historie
      heartbeats: heartbeats.map(hb => ({
        status: hb.status,
        timestamp: hb.created_at
      })),
      // Snapshot
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Agent Status Detail] Error:', err.message);
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

/**
 * GET /api/agents/status/health/check
 * Health-Check für Dashboard (schnelle Statusprüfung)
 * Antwortet mit minimalen Daten (name, running, heartbeat_status)
 */
router.get('/agents/status/health/check', requireAuth, async function (req, res) {
  try {
    const agents = await query(`
      SELECT a.id, a.name
      FROM agents a
      ORDER BY a.name
    `);

    const processStatus = getProcessStatus();

    // Nur notwendige Felder für Dashboard
    const healthData = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      running: (processStatus[agent.id]?.running || false) ? 'online' : 'offline'
    }));

    res.json({
      status: 'ok',
      count: healthData.length,
      agents: healthData,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Health Check] Error:', err.message);
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

module.exports = router;
