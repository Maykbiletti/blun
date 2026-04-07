/**
 * BLUN.ai Agent Heartbeat & Auto-Task-Loop
 * Heinrich — AI Engineer, Infrastruktur & DevOps
 *
 * Globaler Heartbeat-Service + Task-Queue fuer alle Agents.
 * DB: PostgreSQL mit pg Pool
 */

const express = require('express');
const { Pool } = require('pg');

const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30000');
const STALE_THRESHOLD = parseInt(process.env.STALE_THRESHOLD || '90000');
const TASK_POLL_INTERVAL = parseInt(process.env.TASK_POLL_INTERVAL || '10000');
const HEARTBEAT_API_PORT = parseInt(process.env.HEARTBEAT_API_PORT || '3820');

// --- DB Init ---

async function initHeartbeatDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_heartbeats (
      agent_id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      role TEXT,
      status TEXT DEFAULT 'active',
      last_beat TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id SERIAL PRIMARY KEY,
      agent_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      payload JSONB DEFAULT '{}',
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      result JSONB,
      created_by TEXT,
      claimed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Indizes fuer schnelles Polling
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_poll
    ON agent_tasks (status, priority DESC)
    WHERE status = 'pending'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_agent
    ON agent_tasks (agent_id, status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_heartbeat_status
    ON agent_heartbeats (status, last_beat DESC)
  `);
}

// --- Router ---

function createRouter(pool) {
  const router = express.Router();
  router.use(express.json());

  // POST /heartbeat — Agent meldet sich alive
  router.post('/heartbeat', async (req, res) => {
    try {
      const { agentId, agentName, role, metadata } = req.body;
      if (!agentId || !agentName) {
        return res.status(400).json({ error: 'agentId und agentName erforderlich' });
      }
      const result = await pool.query(`
        INSERT INTO agent_heartbeats (agent_id, agent_name, role, status, last_beat, metadata)
        VALUES ($1, $2, $3, 'active', NOW(), $4)
        ON CONFLICT (agent_id) DO UPDATE SET
          agent_name = $2,
          role = $3,
          status = 'active',
          last_beat = NOW(),
          metadata = COALESCE($4, agent_heartbeats.metadata)
        RETURNING *
      `, [agentId, agentName, role || null, JSON.stringify(metadata || {})]);
      res.json({ ok: true, agent: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /heartbeat/status — Alle Agents + Status
  router.get('/heartbeat/status', async (req, res) => {
    try {
      const staleMs = STALE_THRESHOLD;
      const result = await pool.query(`
        SELECT *,
          CASE
            WHEN last_beat < NOW() - ($1 || ' milliseconds')::interval THEN 'stale'
            ELSE status
          END AS current_status,
          EXTRACT(EPOCH FROM (NOW() - last_beat))::int AS seconds_since_beat
        FROM agent_heartbeats
        ORDER BY last_beat DESC
      `, [String(staleMs)]);
      res.json({ agents: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /heartbeat/stale — Stale Agents erkennen + markieren
  router.get('/heartbeat/stale', async (req, res) => {
    try {
      const result = await pool.query(`
        UPDATE agent_heartbeats
        SET status = 'stale'
        WHERE last_beat < NOW() - ($1 || ' milliseconds')::interval
          AND status = 'active'
        RETURNING *
      `, [String(STALE_THRESHOLD)]);
      res.json({ stale: result.rows, count: result.rowCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /tasks — Task erstellen
  router.post('/tasks', async (req, res) => {
    try {
      const { agentId, title, description, payload, priority, createdBy } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'title erforderlich' });
      }
      const result = await pool.query(`
        INSERT INTO agent_tasks (agent_id, title, description, payload, priority, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [agentId || null, title, description || null, JSON.stringify(payload || {}), priority || 0, createdBy || null]);
      res.json({ ok: true, task: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /tasks/poll/:agentId — Atomares Task-Abholen (FOR UPDATE SKIP LOCKED)
  router.get('/tasks/poll/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const result = await pool.query(`
        UPDATE agent_tasks
        SET status = 'in_progress', agent_id = $1, claimed_at = NOW()
        WHERE id = (
          SELECT id FROM agent_tasks
          WHERE status = 'pending'
            AND (agent_id IS NULL OR agent_id = $1)
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `, [agentId]);
      if (result.rowCount === 0) {
        return res.json({ task: null });
      }
      res.json({ task: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /tasks/:id/complete — Task abschliessen
  router.put('/tasks/:id/complete', async (req, res) => {
    try {
      const { id } = req.params;
      const { result: taskResult } = req.body;
      const result = await pool.query(`
        UPDATE agent_tasks
        SET status = 'completed', result = $2, completed_at = NOW()
        WHERE id = $1 AND status = 'in_progress'
        RETURNING *
      `, [id, JSON.stringify(taskResult || {})]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Task nicht gefunden oder nicht in_progress' });
      }
      res.json({ ok: true, task: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /tasks/:id/fail — Task fehlgeschlagen
  router.put('/tasks/:id/fail', async (req, res) => {
    try {
      const { id } = req.params;
      const { error: errorMsg } = req.body;
      const result = await pool.query(`
        UPDATE agent_tasks
        SET status = 'failed', result = $2, completed_at = NOW()
        WHERE id = $1 AND status = 'in_progress'
        RETURNING *
      `, [id, JSON.stringify({ error: errorMsg || 'unknown' })]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Task nicht gefunden oder nicht in_progress' });
      }
      res.json({ ok: true, task: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /tasks/stats — Task-Statistiken
  router.get('/tasks/stats', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed,
          COUNT(*) AS total
        FROM agent_tasks
      `);
      res.json({ stats: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /tasks/:agentId — Tasks eines Agents
  router.get('/tasks/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const status = req.query.status;
      let query = 'SELECT * FROM agent_tasks WHERE agent_id = $1';
      const params = [agentId];
      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }
      query += ' ORDER BY created_at DESC LIMIT 50';
      const result = await pool.query(query, params);
      res.json({ tasks: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// --- AgentLoop Client-Klasse ---

class AgentLoop {
  constructor({ agentId, agentName, role, baseUrl, apiKey, onTask }) {
    this.agentId = agentId;
    this.agentName = agentName;
    this.role = role;
    this.baseUrl = baseUrl || `http://localhost:${HEARTBEAT_API_PORT}`;
    this.apiKey = apiKey;
    this.onTask = onTask;
    this._heartbeatTimer = null;
    this._pollTimer = null;
    this._running = false;
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    return res.json();
  }

  async _sendHeartbeat() {
    try {
      await this._fetch('/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          agentId: this.agentId,
          agentName: this.agentName,
          role: this.role
        })
      });
    } catch (err) {
      console.error(`[AgentLoop:${this.agentId}] Heartbeat fehlgeschlagen:`, err.message);
    }
  }

  async _pollTask() {
    if (!this._running) return;
    try {
      const data = await this._fetch(`/tasks/poll/${this.agentId}`);
      if (data.task && this.onTask) {
        console.log(`[AgentLoop:${this.agentId}] Task erhalten: ${data.task.title}`);
        try {
          const result = await this.onTask(data.task);
          await this._fetch(`/tasks/${data.task.id}/complete`, {
            method: 'PUT',
            body: JSON.stringify({ result })
          });
          console.log(`[AgentLoop:${this.agentId}] Task ${data.task.id} abgeschlossen`);
        } catch (taskErr) {
          await this._fetch(`/tasks/${data.task.id}/fail`, {
            method: 'PUT',
            body: JSON.stringify({ error: taskErr.message })
          });
          console.error(`[AgentLoop:${this.agentId}] Task ${data.task.id} fehlgeschlagen:`, taskErr.message);
        }
      }
    } catch (err) {
      console.error(`[AgentLoop:${this.agentId}] Poll fehlgeschlagen:`, err.message);
    }
  }

  start() {
    this._running = true;
    console.log(`[AgentLoop:${this.agentId}] Gestartet — Heartbeat: ${HEARTBEAT_INTERVAL}ms, Poll: ${TASK_POLL_INTERVAL}ms`);
    this._sendHeartbeat();
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL);
    this._pollTask();
    this._pollTimer = setInterval(() => this._pollTask(), TASK_POLL_INTERVAL);
  }

  stop() {
    this._running = false;
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    if (this._pollTimer) clearInterval(this._pollTimer);
    console.log(`[AgentLoop:${this.agentId}] Gestoppt`);
  }
}

// --- Standalone Server ---

if (require.main === module) {
  const app = express();
  app.use(express.json());

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/blun_agents'
  });

  initHeartbeatDb(pool).then(() => {
    app.use('/', createRouter(pool));

    app.listen(HEARTBEAT_API_PORT, () => {
      console.log(`[Heartbeat] Server laeuft auf Port ${HEARTBEAT_API_PORT}`);
      console.log(`[Heartbeat] Stale-Threshold: ${STALE_THRESHOLD}ms`);
    });
  }).catch(err => {
    console.error('[Heartbeat] DB-Init fehlgeschlagen:', err.message);
    process.exit(1);
  });
}

module.exports = { createRouter, initHeartbeatDb, AgentLoop };
