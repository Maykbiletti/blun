const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');

// ============================================================================
// Auth Middleware: X-BLUN-Key Header
// ============================================================================
async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-blun-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-BLUN-Key header' });
  }

  try {
    const user = await pool.query('SELECT id, email, name FROM users WHERE api_key = $1 LIMIT 1', [apiKey]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    req.user = user.rows[0];
    next();
  } catch (err) {
    console.error('[tenant-api] Auth error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ============================================================================
// POST /api/v1/register (NO AUTH REQUIRED)
// ============================================================================
router.post("/api/v1/register", async (req, res) => {
  const { email, password, name } = req.body;

  // Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password with bcryptjs
    const saltRounds = 10;
    const hashedPassword = await bcryptjs.hash(password, saltRounds);

    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Insert user + create personal company + membership in a transaction
    const client = await pool.connect();
    let user;
    let companyId;
    try {
      await client.query('BEGIN');
      const u = await client.query(
        `INSERT INTO users (email, password_hash, name, plan, role, api_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, email, api_key`,
        [email, hashedPassword, name || email, 'free', 'user', apiKey]
      );
      user = u.rows[0];

      const companyName = (name || email.split('@')[0]) + "'s Workspace";
      const c = await client.query(
        `INSERT INTO companies (name, owner_id, config, created_at)
         VALUES ($1, $2, $3, NOW()) RETURNING id`,
        [companyName, user.id, { description: 'Auto-created on registration' }]
      );
      companyId = c.rows[0].id;

      await client.query(
        `INSERT INTO company_members (user_id, company_id, role) VALUES ($1, $2, 'owner')`,
        [user.id, companyId]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return res.status(201).json({
      user_id: user.id,
      api_key: user.api_key,
      email: user.email,
      company_id: companyId
    });
  } catch (err) {
    console.error('[tenant-api] Register error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================================
// Authenticated Endpoints (require X-BLUN-Key)
// ============================================================================
router.use('/api/v1/projects', apiKeyAuth);
router.use('/api/v1', apiKeyAuth);

// ============================================================================
// POST /api/v1/projects
// ============================================================================
router.post('/api/v1/projects', async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO software_projects (name, description, user_id, owner_user_id, created_at)
       VALUES ($1, $2, $3, $3, NOW())
       RETURNING id, name, created_at`,
      [name, description || null, userId]
    );

    const project = result.rows[0];
    return res.status(201).json({
      id: project.id,
      name: project.name,
      created_at: project.created_at
    });
  } catch (err) {
    console.error('[tenant-api] POST /projects error:', err.message);

    // If table/column doesn't exist, hint to user
    if (err.message.includes('software_projects') || err.message.includes('owner_user_id')) {
      return res.status(500).json({
        error: 'Database schema error',
        hint: 'software_projects table requires: name, description, owner_user_id, created_at columns'
      });
    }

    return res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================================
// GET /api/v1/projects
// ============================================================================
router.get('/api/v1/projects', async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, name, description, owner_user_id, created_at
       FROM software_projects
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.json({ projects: result.rows });
  } catch (err) {
    console.error('[tenant-api] GET /projects error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================================
// GET /api/v1/projects/:id
// ============================================================================
router.get('/api/v1/projects/:id', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const userId = req.user.id;

  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  try {
    // Get project
    const projectResult = await pool.query(
      `SELECT id, name, description, owner_user_id, created_at
       FROM software_projects
       WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];

    // Check ownership
    if (project.owner_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get tasks (last 20, parent tasks only)
    const tasksResult = await pool.query(
      `SELECT id, task, status, agent_id, created_at, priority
       FROM agent_tasks
       WHERE project_id = $1 AND parent_task_id IS NULL
       ORDER BY created_at DESC
       LIMIT 20`,
      [projectId]
    );

    return res.json({
      project: project,
      tasks: tasksResult.rows
    });
  } catch (err) {
    console.error('[tenant-api] GET /projects/:id error:', err.message);

    // If project_id column doesn't exist
    if (err.message.includes('project_id')) {
      return res.status(500).json({
        error: 'Database schema error',
        hint: 'agent_tasks table requires project_id column'
      });
    }

    return res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================================
// POST /api/v1/projects/:id/tasks
// ============================================================================
router.post('/api/v1/projects/:id/tasks', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const userId = req.user.id;
  const { task, agent_name } = req.body;

  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  if (!task) {
    return res.status(400).json({ error: 'Task description is required' });
  }

  try {
    // Check project ownership
    const projectResult = await pool.query(
      `SELECT owner_user_id FROM software_projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    if (project.owner_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Resolve agent_id if agent_name provided
    let agentId = null;
    if (agent_name) {
      const agentResult = await pool.query(
        `SELECT id FROM blun_agents WHERE name = $1 LIMIT 1`,
        [agent_name]
      );
      if (agentResult.rows.length > 0) {
        agentId = agentResult.rows[0].id;
      }
    }

    // Insert task
    const result = await pool.query(
      `INSERT INTO agent_tasks (task, project_id, agent_id, status, priority, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, status, agent_id`,
      [task, projectId, agentId, 'pending', 5]
    );

    const newTask = result.rows[0];
    return res.status(201).json({
      id: newTask.id,
      status: newTask.status,
      agent_id: newTask.agent_id
    });
  } catch (err) {
    console.error('[tenant-api] POST /projects/:id/tasks error:', err.message);

    // Schema hints
    if (err.message.includes('project_id')) {
      return res.status(500).json({
        error: 'Database schema error',
        hint: 'agent_tasks table requires project_id column'
      });
    }

    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
