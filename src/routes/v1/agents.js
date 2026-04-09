const express = require('express');
const db = require('../../db');
const logger = require('../../logger');

const router = express.Router();

// GET /agents — Liste aller Agenten
router.get('/', async (req, res) => {
  try {
    const agents = await db.query('SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY created_at DESC');

    res.status(200).json({
      success: true,
      data: agents.rows || agents,
      count: (agents.rows || agents).length
    });

  } catch (err) {
    logger.error('GET /agents Error:', err);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /agents/:id — Einzelner Agent
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Agent-ID'
      });
    }

    const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [id]);

    if (!agent.rows || agent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent nicht gefunden'
      });
    }

    res.status(200).json({
      success: true,
      data: agent.rows[0]
    });

  } catch (err) {
    logger.error('GET /agents/:id Error:', { id, error: err });
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden des Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /agents — Neuen Agent erstellen
router.post('/', async (req, res) => {
  try {
    const { name, type, config } = req.body;

    // Input Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Agent-Name ist erforderlich'
      });
    }

    if (!type || typeof type !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Agent-Typ ist erforderlich'
      });
    }

    // DB Insert with proper error handling
    const result = await db.query(
      'INSERT INTO agents (name, type, config, status, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [name.trim(), type, config || {}, 'stopped']
    );

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Agent konnte nicht erstellt werden');
    }

    logger.info('Agent created:', { id: result.rows[0].id, name, type });

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Agent erfolgreich erstellt'
    });

  } catch (err) {
    logger.error('POST /agents Error:', err);

    // Handle specific DB constraints
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: 'Ein Agent mit diesem Namen existiert bereits'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Fehler beim Erstellen des Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /agents/:id/start — Agent starten
router.post('/:id/start', async (req, res) => {
  const { id } = req.params;

  try {
    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Agent-ID'
      });
    }

    // Check if agent exists
    const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [id]);

    if (!agent.rows || agent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent nicht gefunden'
      });
    }

    const agentData = agent.rows[0];

    // Check current status
    if (agentData.status === 'running') {
      return res.status(409).json({
        success: false,
        error: 'Agent läuft bereits'
      });
    }

    // Update status to running
    const updateResult = await db.query(
      'UPDATE agents SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
      ['running', id]
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      throw new Error('Agent-Status konnte nicht aktualisiert werden');
    }

    logger.info('Agent started:', { id, name: agentData.name });

    res.status(200).json({
      success: true,
      data: updateResult.rows[0],
      message: 'Agent erfolgreich gestartet'
    });

  } catch (err) {
    logger.error('POST /agents/:id/start Error:', { id, error: err });
    res.status(500).json({
      success: false,
      error: 'Fehler beim Starten des Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /agents/:id/stop — Agent stoppen
router.post('/:id/stop', async (req, res) => {
  const { id } = req.params;

  try {
    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Agent-ID'
      });
    }

    // Check if agent exists
    const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [id]);

    if (!agent.rows || agent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent nicht gefunden'
      });
    }

    const agentData = agent.rows[0];

    // Check current status
    if (agentData.status === 'stopped') {
      return res.status(409).json({
        success: false,
        error: 'Agent ist bereits gestoppt'
      });
    }

    // Update status to stopped
    const updateResult = await db.query(
      'UPDATE agents SET status = $1, stopped_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
      ['stopped', id]
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      throw new Error('Agent-Status konnte nicht aktualisiert werden');
    }

    logger.info('Agent stopped:', { id, name: agentData.name });

    res.status(200).json({
      success: true,
      data: updateResult.rows[0],
      message: 'Agent erfolgreich gestoppt'
    });

  } catch (err) {
    logger.error('POST /agents/:id/stop Error:', { id, error: err });
    res.status(500).json({
      success: false,
      error: 'Fehler beim Stoppen des Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// PUT /agents/:id — Agent aktualisieren
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, type, config } = req.body;

  try {
    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Agent-ID'
      });
    }

    // Check if agent exists
    const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [id]);

    if (!agent.rows || agent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent nicht gefunden'
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Agent-Name darf nicht leer sein'
        });
      }
      updates.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }

    if (type !== undefined) {
      if (!type || typeof type !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Agent-Typ ist erforderlich'
        });
      }
      updates.push(`type = $${paramCount++}`);
      values.push(type);
    }

    if (config !== undefined) {
      updates.push(`config = $${paramCount++}`);
      values.push(config);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keine Daten zum Aktualisieren'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await db.query(query, values);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Agent konnte nicht aktualisiert werden');
    }

    logger.info('Agent updated:', { id, updates: updates.length });

    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: 'Agent erfolgreich aktualisiert'
    });

  } catch (err) {
    logger.error('PUT /agents/:id Error:', { id, error: err });

    // Handle specific DB constraints
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: 'Ein Agent mit diesem Namen existiert bereits'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Fehler beim Aktualisieren des Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// DELETE /agents/:id — Agent löschen (soft delete)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Ungültige Agent-ID'
      });
    }

    // Check if agent exists and is not already deleted
    const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND deleted_at IS NULL', [id]);

    if (!agent.rows || agent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent nicht gefunden'
      });
    }

    const agentData = agent.rows[0];

    // Stop agent if running before deleting
    if (agentData.status === 'running') {
      await db.query(
        'UPDATE agents SET status = $1, stopped_at = NOW() WHERE id = $2',
        ['stopped', id]
      );
    }

    // Soft delete
    const result = await db.query(
      'UPDATE agents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Agent konnte nicht gelöscht werden');
    }

    logger.info('Agent deleted:', { id, name: agentData.name });

    res.status(200).json({
      success: true,
      message: 'Agent erfolgreich gelöscht'
    });

  } catch (err) {
    logger.error('DELETE /agents/:id Error:', { id, error: err });
    res.status(500).json({
      success: false,
      error: 'Fehler beim Löschen des Agenten',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;