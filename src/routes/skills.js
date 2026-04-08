// BLUN - AI Organisator | MIT License
/**
 * Skills API Routes
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const { getRegistry, getSkillByName } = require('../skills/registry');
const SkillSandbox = require('../security/sandbox');

var router = Router();

// List all installed skills
router.get('/', async function (req, res) {
  res.json(await query('SELECT * FROM skills ORDER BY name'));
});

// Browse available skills from built-in registry
router.get('/registry', function (req, res) {
  res.json(getRegistry());
});

// Get skill details
router.get('/:id', async function (req, res) {
  var skill = await queryOne('SELECT * FROM skills WHERE id = $1', [req.params.id]);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  // include assigned agents
  var agents = await query(
    'SELECT a.id, a.name, a_s.enabled, a_s.config FROM agent_skills a_s JOIN agents a ON a.id = a_s.agent_id WHERE a_s.skill_id = $1',
    [req.params.id]
  );
  res.json(Object.assign({}, skill, { assigned_agents: agents }));
});

// Install a skill (from registry by name, or custom)
router.post('/install', async function (req, res) {
  var b = req.body;

  // If installing from registry by name
  if (b.name && !b.system_prompt) {
    var fromRegistry = getSkillByName(b.name);
    if (fromRegistry) {
      b = Object.assign({}, fromRegistry, b);
    }
  }

  if (!b.name) return res.status(400).json({ error: 'name is required' });

  // Check if already installed
  var existing = await queryOne('SELECT * FROM skills WHERE name = $1', [b.name]);
  if (existing) return res.status(409).json({ error: 'Skill already installed', skill: existing });

  var row = await queryOne(
    'INSERT INTO skills (name, description, category, code) VALUES ($1,$2,$3,$4) RETURNING *',
    [b.name, b.description || '', b.category || 'marketplace', b.system_prompt || b.prompt || b.code || '']
  );
  res.status(201).json(row);
});

// Uninstall a skill
router.delete('/:id', async function (req, res) {
  var skill = await queryOne('DELETE FROM skills WHERE id = $1 RETURNING *', [req.params.id]);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json({ deleted: true, skill: skill });
});

// Assign skill to agent
router.post('/:id/assign/:agentId', async function (req, res) {
  var skill = await queryOne('SELECT id FROM skills WHERE id = $1', [req.params.id]);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  var agent = await queryOne('SELECT id FROM agents WHERE id = $1', [req.params.agentId]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  var row = await queryOne(
    'INSERT INTO agent_skills (agent_id, skill_id, installed_by) VALUES ($1, $2, $3) ON CONFLICT (agent_id, skill_id) DO NOTHING RETURNING *',
    [req.params.agentId, req.params.id, 'marketplace']
  );
  if(!row) row = await queryOne('SELECT * FROM agent_skills WHERE agent_id=$1 AND skill_id=$2', [req.params.agentId, req.params.id]);
  res.json(row);
});

// Remove skill from agent
router.delete('/:id/assign/:agentId', async function (req, res) {
  var row = await queryOne('DELETE FROM agent_skills WHERE skill_id = $1 AND agent_id = $2 RETURNING *', [req.params.id, req.params.agentId]);
  if (!row) return res.status(404).json({ error: 'Assignment not found' });
  res.json({ removed: true });
});

// List skills for an agent (mounted at /api/agents/:id/skills in server.js)
// This is exported separately
async function getAgentSkills(req, res) {
  var rows = await query(
    'SELECT s.*, a_s.enabled, a_s.config AS agent_config FROM skills s JOIN agent_skills a_s ON a_s.skill_id = s.id WHERE a_s.agent_id = $1 ORDER BY s.name',
    [req.params.id]
  );
  res.json(rows);
}

// Execute skill in sandbox
router.post('/:id/execute', async function (req, res) {
  try {
    var skill = await queryOne('SELECT * FROM skills WHERE id = $1', [req.params.id]);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    // Create sandbox (req.user set by auth middleware)
    var sandbox = new SkillSandbox(
      skill.code,
      req.body.agentId || null,
      req.user?.id || null,
      {
        skillName: skill.name,
        allowedDomains: skill.config?.allowedDomains || []
      }
    );

    // Execute in sandbox
    var result = await sandbox.execute(req.body.input || {});

    // Cleanup
    await sandbox.cleanup();

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router: router, getAgentSkills: getAgentSkills };
