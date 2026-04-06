// BLUN - AI Organisator | MIT License
/**
 * Skills API Routes
 */

const { Router } = require('express');
const { query, queryOne } = require('../db');
const { getRegistry, getSkillByName } = require('../skills/registry');

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
    'INSERT INTO skills (name, version, description, author, source_url, category, config, system_prompt, tools) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [b.name, b.version || '1.0.0', b.description, b.author, b.source_url, b.category, b.config || {}, b.system_prompt, b.tools || []]
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
    'INSERT INTO agent_skills (agent_id, skill_id, config) VALUES ($1, $2, $3) ON CONFLICT (agent_id, skill_id) DO UPDATE SET enabled = true, config = EXCLUDED.config RETURNING *',
    [req.params.agentId, req.params.id, req.body.config || {}]
  );
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

module.exports = { router: router, getAgentSkills: getAgentSkills };
