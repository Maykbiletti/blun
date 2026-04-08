// BLUN - AI Organisator | MIT License
// Multi-tenant company routes

const { Router } = require('express');
const { pool, query, queryOne } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Middleware: read x-company-id header, set search_path for the request
async function companyContext(req, res, next) {
  var companyId = req.headers['x-company-id'];
  if (!companyId || !req.user) return next();

  try {
    var company = await queryOne(
      'SELECT schema_name FROM companies WHERE id = $1 AND owner_user_id = $2',
      [companyId, req.user.id]
    );
    if (company && company.schema_name) {
      req.companySchemaName = company.schema_name;
      req.companyId = parseInt(companyId, 10);
      // Set search_path for this connection via a client from the pool
      // Note: search_path is set per-query where needed, not per-pool-connection
    }
  } catch (err) {
    console.error('[companies] companyContext error:', err.message);
  }
  next();
}

// GET /api/companies/list — all companies of the logged-in user
router.get('/list', requireAuth, async function (req, res) {
  try {
    var rows = await query(
      'SELECT id, name, email, description, schema_name, created_at FROM companies WHERE owner_user_id = $1 ORDER BY created_at',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[companies] list error:', err.message);
    res.status(500).json({ error: 'Failed to load companies' });
  }
});

// POST /api/companies/create — create a new company with isolated schema
router.post('/create', requireAuth, async function (req, res) {
  var name = (req.body.name || '').trim();
  var email = (req.body.email || '').trim();
  var description = (req.body.description || '').trim();

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > 255) return res.status(400).json({ error: 'name too long' });

  // Build a safe schema name: lowercase, alphanumeric + underscore, max 40 chars
  var schemaName = 'co_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 37) + '_' + Date.now().toString(36);
  schemaName = schemaName.slice(0, 63);

  var client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create company row
    var company = await client.query(
      'INSERT INTO companies (name, email, description, owner_user_id, schema_name, config) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, description, schema_name, created_at',
      [name, email || null, description || null, req.user.id, schemaName, {}]
    );
    var row = company.rows[0];

    // Create isolated PostgreSQL schema with all tables
    await client.query('SELECT create_company_schema($1)', [schemaName]);

    await client.query('COMMIT');
    res.status(201).json(row);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[companies] create error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A company with that name already exists' });
    }
    res.status(500).json({ error: 'Failed to create company' });
  } finally {
    client.release();
  }
});

// POST /api/companies/switch — switch active company, update session
router.post('/switch', requireAuth, async function (req, res) {
  var companyId = req.body.companyId;
  if (!companyId) return res.status(400).json({ error: 'companyId is required' });

  try {
    // Verify ownership
    var company = await queryOne(
      'SELECT id, name, schema_name FROM companies WHERE id = $1 AND owner_user_id = $2',
      [companyId, req.user.id]
    );
    if (!company) return res.status(403).json({ error: 'Company not found or access denied' });

    // Update session with active company
    if (req.sessionToken) {
      await query(
        'UPDATE sessions SET active_company_id = $1 WHERE token = $2',
        [company.id, req.sessionToken]
      );
    }

    res.json({ success: true, company: { id: company.id, name: company.name, schema_name: company.schema_name } });
  } catch (err) {
    console.error('[companies] switch error:', err.message);
    res.status(500).json({ error: 'Failed to switch company' });
  }
});

module.exports = { router, companyContext };
